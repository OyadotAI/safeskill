#!/usr/bin/env tsx
/**
 * Batch-scan npm packages using the built CLI and save results to data/scan-results.json
 *
 * Usage:
 *   pnpm exec tsx scripts/scan-packages.ts                     # scan default list
 *   pnpm exec tsx scripts/scan-packages.ts --from-index 50     # top 50 from marketplace index
 *   pnpm exec tsx scripts/scan-packages.ts --packages "a,b,c"  # specific packages
 *   pnpm exec tsx scripts/scan-packages.ts --resume             # skip already-scanned
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

const CLI_PATH = path.resolve('packages/cli/dist/bin/safeskill.js');

// Well-known packages to always scan
const DEFAULT_PACKAGES = [
  // Official MCP servers
  '@modelcontextprotocol/server-filesystem',
  '@modelcontextprotocol/server-github',
  '@modelcontextprotocol/server-puppeteer',
  '@modelcontextprotocol/server-memory',
  '@modelcontextprotocol/server-brave-search',
  '@modelcontextprotocol/server-google-maps',
  '@modelcontextprotocol/server-slack',
  '@modelcontextprotocol/server-fetch',
  '@modelcontextprotocol/server-postgres',
  '@modelcontextprotocol/server-sqlite',
  '@modelcontextprotocol/server-sequential-thinking',
  // Popular third-party
  'mcp-server-fetch',
  '@railway/mcp-server',
  '@aashari/mcp-server-atlassian-jira',
  '@benborla29/mcp-server-mysql',
  '@cyanheads/git-mcp-server',
  '@codacy/codacy-mcp',
  '@aashari/mcp-server-atlassian-confluence',
  '@aashari/mcp-server-atlassian-bitbucket',
  'browser-devtools-mcp',
  '@taazkareem/clickup-mcp-server',
  '@currents/mcp',
  '@mseep/linear-mcp-server',
];

const RESULTS_PATH = path.resolve('data/scan-results.json');
const CONCURRENCY = 3;

interface ScanCache {
  generatedAt: string;
  count: number;
  results: Record<string, unknown>;
}

async function scanPackage(pkg: string): Promise<unknown | null> {
  try {
    const { stdout } = await execFileAsync(
      'node',
      [CLI_PATH, 'scan', pkg, '--json', '--skip-deps'],
      { timeout: 120000, maxBuffer: 10 * 1024 * 1024 },
    );

    // The CLI outputs the JSON result to stdout
    const result = JSON.parse(stdout);
    return result;
  } catch (error: unknown) {
    // CLI exits 1 for blocked packages but still outputs valid JSON
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    if (execError.stdout) {
      try {
        return JSON.parse(execError.stdout);
      } catch {
        // not valid JSON
      }
    }
    const msg = execError.message ?? String(error);
    console.error(`  FAILED: ${msg.split('\n')[0]}`);
    return null;
  }
}

async function loadExisting(): Promise<ScanCache> {
  if (existsSync(RESULTS_PATH)) {
    try {
      const raw = await readFile(RESULTS_PATH, 'utf-8');
      return JSON.parse(raw) as ScanCache;
    } catch {
      // corrupted, start fresh
    }
  }
  return { generatedAt: new Date().toISOString(), count: 0, results: {} };
}

async function main() {
  // Check CLI is built
  if (!existsSync(CLI_PATH)) {
    console.error(`CLI not built. Run: pnpm build`);
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const resume = args.includes('--resume');

  // Determine which packages to scan
  let packages = [...DEFAULT_PACKAGES];

  const pkgIdx = args.indexOf('--packages');
  if (pkgIdx !== -1 && args[pkgIdx + 1]) {
    packages = args[pkgIdx + 1].split(',').map(s => s.trim()).filter(Boolean);
  }

  const fromIdxArg = args.indexOf('--from-index');
  if (fromIdxArg !== -1 && args[fromIdxArg + 1]) {
    const limit = parseInt(args[fromIdxArg + 1], 10);
    try {
      const indexPath = path.resolve('data/marketplaces/index.compact.json');
      const raw = await readFile(indexPath, 'utf-8');
      const entries = JSON.parse(raw) as Array<{ n: string; s: string; c: string }>;
      // Only npm packages (they're installable via npm pack)
      const npmPackages = entries
        .filter(e => e.s === 'npm')
        .map(e => e.n)
        .slice(0, limit);
      packages = [...new Set([...packages, ...npmPackages])];
    } catch (e) {
      console.error('Failed to read marketplace index:', e);
    }
  }

  // Ensure output directory exists
  const outDir = path.dirname(RESULTS_PATH);
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }

  // Load existing results
  const cache = await loadExisting();

  if (resume) {
    packages = packages.filter(p => !cache.results[p]);
    console.log(`Resuming: ${packages.length} packages remaining (${Object.keys(cache.results).length} already scanned)`);
  }

  console.log(`\nScanning ${packages.length} packages (concurrency: ${CONCURRENCY})\n`);

  let completed = 0;
  let failed = 0;

  // Process in batches for concurrency
  for (let i = 0; i < packages.length; i += CONCURRENCY) {
    const batch = packages.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (pkg) => {
      const idx = packages.indexOf(pkg) + 1;
      console.log(`[${idx}/${packages.length}] Scanning ${pkg}...`);
      const start = Date.now();
      const result = await scanPackage(pkg);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      if (result) {
        const r = result as { packageName: string; overallScore: number };
        cache.results[r.packageName] = result;
        completed++;
        const grade = r.overallScore >= 90 ? 'VERIFIED' :
                      r.overallScore >= 70 ? 'PASSES' :
                      r.overallScore >= 40 ? 'CAUTION' : 'BLOCKED';
        console.log(`  ✓ ${r.packageName} → ${r.overallScore}/100 (${grade}) [${elapsed}s]`);
      } else {
        failed++;
        console.log(`  ✗ ${pkg} → FAILED [${elapsed}s]`);
      }
    });
    await Promise.all(promises);

    // Save after each batch (crash-safe)
    cache.generatedAt = new Date().toISOString();
    cache.count = Object.keys(cache.results).length;
    await writeFile(RESULTS_PATH, JSON.stringify(cache, null, 2));
  }

  console.log(`\nDone! ${completed} scanned, ${failed} failed, ${cache.count} total cached.`);
  console.log(`Results saved to ${RESULTS_PATH}`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
