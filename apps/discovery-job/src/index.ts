/**
 * Daily Discovery Job
 *
 * Discovers new AI skills from GitHub and npm, scans them,
 * creates PRs with badges, and stores results.
 *
 * Runs as a Cloud Run Job triggered by Cloud Scheduler daily.
 *
 * Sources:
 * - GitHub topics: mcp-server, claude-skill, openclaw, claude-code-skill, agent-skills
 * - GitHub curated lists: awesome-mcp-servers, official MCP servers
 * - npm: mcp, claude-skill, ai-tool keywords
 * - Smithery registry
 */

import { GcpScanStore } from '@safeskill/scan-store/gcp';
import { packageToSlug } from '@safeskill/scan-store';
import { discover } from './discover.js';
import { scanAndStore } from './scanner.js';

const CONCURRENCY = parseInt(process.env.SCAN_CONCURRENCY ?? '5', 10);

async function main() {
  const store = new GcpScanStore({
    bucket: process.env.GCS_BUCKET ?? '',
    projectId: process.env.GCP_PROJECT ?? '',
  });

  const githubToken = process.env.GITHUB_TOKEN ?? '';
  const scannerUrl = process.env.SCANNER_URL ?? '';

  if (!process.env.GCS_BUCKET || !process.env.GCP_PROJECT) {
    console.error('Missing GCS_BUCKET or GCP_PROJECT');
    process.exit(1);
  }

  console.log('=== SafeSkill Daily Discovery ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log('');

  // 1. Discover new packages from all sources
  console.log('--- Phase 1: Discovery ---');
  const discovered = await discover(githubToken);
  console.log(`Discovered ${discovered.length} total packages`);

  // 2. Filter out already-scanned packages
  const existingSlugs = new Set(await store.getAllSlugs());
  const newPackages = discovered.filter(p => !existingSlugs.has(packageToSlug(p.name)));
  console.log(`New (not yet scanned): ${newPackages.length}`);
  console.log(`Already scanned: ${discovered.length - newPackages.length}`);
  console.log('');

  if (newPackages.length === 0) {
    console.log('No new packages to scan. Done.');
    return;
  }

  // 3. Scan new packages
  console.log(`--- Phase 2: Scanning ${newPackages.length} packages ---`);
  let scanned = 0;
  let failed = 0;
  let prsCreated = 0;

  for (let i = 0; i < newPackages.length; i += CONCURRENCY) {
    const batch = newPackages.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (pkg) => {
        const idx = i + batch.indexOf(pkg) + 1;
        console.log(`[${idx}/${newPackages.length}] Scanning ${pkg.name} (${pkg.source})...`);
        const start = Date.now();

        const result = await scanAndStore({
          packageName: pkg.name,
          isGitHub: pkg.isGitHub,
          scannerUrl,
          githubToken,
        });

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);

        if (result.success) {
          scanned++;
          const prInfo = result.prUrl ? ` | PR: ${result.prUrl}` : '';
          if (result.prUrl) prsCreated++;
          console.log(`  ✓ ${pkg.name} → ${result.score}/100 [${elapsed}s]${prInfo}`);
        } else {
          failed++;
          console.log(`  ✗ ${pkg.name} → ${result.error} [${elapsed}s]`);
        }
      }),
    );
  }

  console.log('');
  console.log('--- Summary ---');
  console.log(`Discovered: ${discovered.length}`);
  console.log(`New: ${newPackages.length}`);
  console.log(`Scanned: ${scanned}`);
  console.log(`Failed: ${failed}`);
  console.log(`PRs created: ${prsCreated}`);
  console.log(`Total in registry: ${existingSlugs.size + scanned}`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
