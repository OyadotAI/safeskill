#!/usr/bin/env tsx
/**
 * Scan 1,000 packages from the marketplace index and report results.
 *
 * Usage:
 *   pnpm exec tsx scripts/test-1k.ts                  # scan 1K npm packages
 *   pnpm exec tsx scripts/test-1k.ts --resume         # resume interrupted run
 *   pnpm exec tsx scripts/test-1k.ts --limit 500      # scan fewer
 *   pnpm exec tsx scripts/test-1k.ts --include-github  # include GitHub repos too
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve('packages/cli/dist/bin/safeskill.js');
const RESULTS_PATH = path.resolve('data/test-1k-results.json');
const CONCURRENCY = 5;

interface Result {
  packageName: string;
  overallScore: number;
  codeScore: number;
  contentScore: number;
  codeFindings: Array<{ severity: string; category: string; description: string }>;
  promptFindings: Array<{ severity: string; category: string }>;
  taintFlows: unknown[];
}

interface TestResults {
  startedAt: string;
  completedAt: string | null;
  total: number;
  scanned: number;
  failed: number;
  grades: { verified: number; passes: number; caution: number; blocked: number };
  securityHolders: string[];
  criticalFindings: Array<{ package: string; description: string }>;
  results: Record<string, Result>;
  errors: Record<string, string>;
}

async function scanPackage(pkg: string): Promise<Result | null> {
  try {
    const { stdout } = await execFileAsync(
      'node',
      [CLI_PATH, 'scan', pkg, '--json'],
      { timeout: 180000, maxBuffer: 10 * 1024 * 1024 },
    );
    return JSON.parse(stdout) as Result;
  } catch (error: unknown) {
    const execError = error as { stdout?: string; message?: string };
    if (execError.stdout) {
      try {
        return JSON.parse(execError.stdout) as Result;
      } catch { /* not valid JSON */ }
    }
    throw new Error(execError.message?.split('\n')[0] ?? String(error));
  }
}

function gradeLabel(score: number): string {
  if (score >= 90) return 'VERIFIED';
  if (score >= 70) return 'PASSES';
  if (score >= 40) return 'CAUTION';
  return 'BLOCKED';
}

async function main() {
  if (!existsSync(CLI_PATH)) {
    console.error('CLI not built. Run: pnpm build');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const resume = args.includes('--resume');
  const includeGitHub = args.includes('--include-github');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 1000;

  // Load marketplace index
  const indexPath = path.resolve('data/marketplaces/index.compact.json');
  const entries = JSON.parse(await readFile(indexPath, 'utf-8')) as Array<{ n: string; s: string }>;

  // Filter by source
  let packages = entries
    .filter(e => includeGitHub ? true : e.s === 'npm')
    .map(e => e.n);

  // Shuffle for variety (deterministic seed based on date)
  const today = new Date().toISOString().slice(0, 10);
  let seed = Array.from(today).reduce((a, c) => a + c.charCodeAt(0), 0);
  packages = packages
    .map(p => ({ p, r: (seed = (seed * 16807) % 2147483647) }))
    .sort((a, b) => a.r - b.r)
    .map(x => x.p)
    .slice(0, limit);

  // Load or init results
  const outDir = path.dirname(RESULTS_PATH);
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

  let state: TestResults;
  if (resume && existsSync(RESULTS_PATH)) {
    state = JSON.parse(await readFile(RESULTS_PATH, 'utf-8')) as TestResults;
    packages = packages.filter(p => !state.results[p] && !state.errors[p]);
    console.log(`Resuming: ${packages.length} remaining (${state.scanned} already done)\n`);
  } else {
    state = {
      startedAt: new Date().toISOString(),
      completedAt: null,
      total: packages.length,
      scanned: 0,
      failed: 0,
      grades: { verified: 0, passes: 0, caution: 0, blocked: 0 },
      securityHolders: [],
      criticalFindings: [],
      results: {},
      errors: {},
    };
  }

  console.log(`Scanning ${packages.length} packages (concurrency: ${CONCURRENCY})\n`);
  const startTime = Date.now();

  for (let i = 0; i < packages.length; i += CONCURRENCY) {
    const batch = packages.slice(i, i + CONCURRENCY);

    await Promise.all(batch.map(async (pkg) => {
      const idx = i + batch.indexOf(pkg) + 1 + state.scanned;
      const t0 = Date.now();

      try {
        const result = await scanPackage(pkg);
        if (!result) throw new Error('No result returned');

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        const grade = gradeLabel(result.overallScore);

        state.results[result.packageName] = result;
        state.scanned++;
        state.grades[grade.toLowerCase() as keyof typeof state.grades]++;

        // Track security holders
        const isSecHolder = result.codeFindings.some(f =>
          f.description.includes('removed by npm for security reasons')
        );
        if (isSecHolder) state.securityHolders.push(result.packageName);

        // Track critical findings
        const criticals = [
          ...result.codeFindings.filter(f => f.severity === 'critical'),
          ...result.promptFindings.filter(f => f.severity === 'critical'),
        ];
        for (const c of criticals) {
          state.criticalFindings.push({
            package: result.packageName,
            description: 'description' in c ? c.description : c.category,
          });
        }

        const icon = grade === 'BLOCKED' ? '!!' : grade === 'CAUTION' ? '??' : '  ';
        console.log(`[${idx}/${state.total}] ${icon} ${result.packageName} → ${result.overallScore}/100 (${grade}) [${elapsed}s]`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        state.errors[pkg] = msg;
        state.failed++;
        console.log(`[${idx}/${state.total}]  X ${pkg} → FAILED: ${msg.slice(0, 80)}`);
      }
    }));

    // Save after each batch
    state.completedAt = new Date().toISOString();
    await writeFile(RESULTS_PATH, JSON.stringify(state, null, 2));
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`
${'='.repeat(60)}
  TEST RESULTS — ${state.scanned} packages scanned in ${elapsed}s
${'='.repeat(60)}

  Grades:
    Verified Safe:    ${state.grades.verified}
    Passes w/ Notes:  ${state.grades.passes}
    Use with Caution: ${state.grades.caution}
    Blocked:          ${state.grades.blocked}

  Failures:           ${state.failed}
  Security holders:   ${state.securityHolders.length}
  Critical findings:  ${state.criticalFindings.length}

  Results saved to: ${RESULTS_PATH}
`);

  if (state.securityHolders.length > 0) {
    console.log('  npm security holders detected:');
    for (const p of state.securityHolders) console.log(`    - ${p}`);
    console.log();
  }

  if (state.criticalFindings.length > 0) {
    console.log('  Critical findings (first 20):');
    for (const f of state.criticalFindings.slice(0, 20)) {
      console.log(`    - ${f.package}: ${f.description.slice(0, 100)}`);
    }
    console.log();
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
