import type { ScanResult } from '@safeskill/shared';
import { packageToSlug, buildSlugIndex } from '@/lib/slugs';
import scanResultsJson from './scan-results.json';

const scanResultsData: Record<string, ScanResult> =
  (scanResultsJson as { results: Record<string, ScanResult> }).results ?? {};

export const SCAN_CACHE: Record<string, ScanResult> = scanResultsData;

/** slug → packageName lookup */
export const SLUG_INDEX = buildSlugIndex(Object.keys(scanResultsData));

/** Get cached result by slug */
export function getCachedScanBySlug(slug: string): ScanResult | null {
  const packageName = SLUG_INDEX[slug];
  if (!packageName) return null;
  return SCAN_CACHE[packageName] ?? null;
}

/** Get all cached slugs */
export function getAllCachedSlugs(): string[] {
  return Object.keys(SLUG_INDEX);
}

export { packageToSlug };

/** Get cached result by package name */
export function getCachedScan(packageName: string): ScanResult | null {
  return SCAN_CACHE[packageName] ?? null;
}

/** Get all cached results sorted by scan date (newest first) */
export function getAllCachedScans(): ScanResult[] {
  return Object.values(SCAN_CACHE).sort((a, b) => b.timestamp - a.timestamp);
}

/** Get featured scans (top packages by relevance) */
export function getFeaturedScans(limit = 8): ScanResult[] {
  const all = getAllCachedScans();
  if (all.length === 0) return [];

  const blocked = all.filter(r => r.overallScore < 40);
  const caution = all.filter(r => r.overallScore >= 40 && r.overallScore < 70);
  const passes = all.filter(r => r.overallScore >= 70 && r.overallScore < 90);
  const verified = all.filter(r => r.overallScore >= 90);

  const featured: ScanResult[] = [];
  const buckets = [verified, passes, caution, blocked];
  let bucketIdx = 0;
  while (featured.length < limit) {
    const bucket = buckets[bucketIdx % buckets.length];
    const next = bucket.shift();
    if (next) featured.push(next);
    bucketIdx++;
    if (buckets.every(b => b.length === 0)) break;
  }

  return featured;
}
