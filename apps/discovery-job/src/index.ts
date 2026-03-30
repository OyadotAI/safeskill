/**
 * Daily Discovery Job
 *
 * Discovers new AI skills from GitHub and npm, scans them,
 * creates PRs with badges, and stores results.
 *
 * Runs as a Cloud Run Job triggered by Cloud Scheduler daily.
 * Scans up to SCAN_LIMIT packages per run (default 200) to stay within time budget.
 */

import { GcpScanStore } from '@safeskill/scan-store/gcp';
import { packageToSlug } from '@safeskill/scan-store';
import { discover } from './discover.js';
import { scanAndStore } from './scanner.js';

const CONCURRENCY = parseInt(process.env.SCAN_CONCURRENCY ?? '10', 10);
const SCAN_LIMIT = parseInt(process.env.SCAN_LIMIT ?? '10', 10);
const TIME_BUDGET_MS = parseInt(process.env.TIME_BUDGET_MS ?? '2700000', 10); // 45 min default

async function main() {
  const startTime = Date.now();

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
  console.log(`Concurrency: ${CONCURRENCY} | Limit: ${SCAN_LIMIT} | Budget: ${TIME_BUDGET_MS / 60000}min`);
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

  // 3. Take only up to SCAN_LIMIT packages per run
  const toScan = newPackages.slice(0, SCAN_LIMIT);
  if (newPackages.length > SCAN_LIMIT) {
    console.log(`Capping to ${SCAN_LIMIT} packages this run (${newPackages.length - SCAN_LIMIT} deferred to next run)`);
  }

  // 4. Scan
  console.log(`--- Phase 2: Scanning ${toScan.length} packages ---`);
  let scanned = 0;
  let failed = 0;
  let prsCreated = 0;
  let skippedTimeBudget = 0;

  for (let i = 0; i < toScan.length; i += CONCURRENCY) {
    // Check time budget
    const elapsed = Date.now() - startTime;
    if (elapsed > TIME_BUDGET_MS) {
      skippedTimeBudget = toScan.length - i;
      console.log(`\nTime budget exceeded (${(elapsed / 60000).toFixed(1)}min). Skipping remaining ${skippedTimeBudget} packages.`);
      break;
    }

    const batch = toScan.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (pkg) => {
        const idx = i + batch.indexOf(pkg) + 1;
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
          console.log(`  [${idx}/${toScan.length}] ✓ ${pkg.name} → ${result.score}/100 [${elapsed}s]${prInfo}`);
        } else {
          failed++;
          console.log(`  [${idx}/${toScan.length}] ✗ ${pkg.name} → ${result.error?.slice(0, 60)} [${elapsed}s]`);
        }
      }),
    );
  }

  const totalElapsed = ((Date.now() - startTime) / 60000).toFixed(1);

  console.log('');
  console.log('--- Summary ---');
  console.log(`Discovered: ${discovered.length}`);
  console.log(`New: ${newPackages.length}`);
  console.log(`Scanned: ${scanned}`);
  console.log(`Failed: ${failed}`);
  console.log(`PRs created: ${prsCreated}`);
  console.log(`Skipped (time budget): ${skippedTimeBudget}`);
  console.log(`Deferred to next run: ${Math.max(0, newPackages.length - SCAN_LIMIT)}`);
  console.log(`Total in registry: ${existingSlugs.size + scanned}`);
  console.log(`Elapsed: ${totalElapsed}min`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
