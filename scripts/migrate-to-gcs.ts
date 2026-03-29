#!/usr/bin/env tsx
/**
 * Migrate existing scan-results.json to GCS + Firestore.
 *
 * Usage:
 *   GCP_PROJECT=your-project GCS_BUCKET=safeskill-scans pnpm exec tsx scripts/migrate-to-gcs.ts
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { ScanResult } from '@safeskill/shared';

// Dynamic import to avoid build issues when GCP deps aren't installed yet
async function main() {
  const projectId = process.env.GCP_PROJECT;
  const bucket = process.env.GCS_BUCKET ?? 'safeskill-scans';

  if (!projectId) {
    console.error('Set GCP_PROJECT environment variable');
    process.exit(1);
  }

  const legacyPath = path.resolve('data/scan-results.json');
  if (!existsSync(legacyPath)) {
    console.error(`No scan-results.json found at ${legacyPath}`);
    process.exit(1);
  }

  const raw = await readFile(legacyPath, 'utf-8');
  const data = JSON.parse(raw) as { results: Record<string, ScanResult> };
  const results = Object.values(data.results);

  console.log(`Found ${results.length} scan results to migrate`);
  console.log(`Target: GCS gs://${bucket}/results/ + Firestore ${projectId}`);

  const { GcpScanStore } = await import('../packages/scan-store/src/gcp-store.js');
  const { packageToSlug } = await import('../packages/scan-store/src/index.js');

  const store = new GcpScanStore({ bucket, projectId });

  const items = results.map((result) => ({
    slug: packageToSlug(result.packageName),
    result,
  }));

  console.log(`Uploading ${items.length} results (concurrency: 10)...`);

  const uploaded = await store.putResultsBatch(items, 10);

  console.log(`\nDone! ${uploaded} results migrated.`);
  console.log(`  GCS: gs://${bucket}/results/`);
  console.log(`  Firestore: ${projectId} → scans collection`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
