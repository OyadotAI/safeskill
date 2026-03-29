import type { ScanResult } from '@safeskill/shared';
import { getGrade } from '@safeskill/shared';
import type { ScanMeta, ScanJob, ListMetaOptions } from './types.js';

export type { ScanMeta, ScanJob, ListMetaOptions } from './types.js';

/** Abstract storage interface for scan results. */
export interface ScanStore {
  // --- Results (full JSON, stored in GCS / filesystem) ---
  getResult(slug: string): Promise<ScanResult | null>;
  putResult(slug: string, result: ScanResult): Promise<void>;

  // --- Metadata (lightweight, stored in Firestore / memory) ---
  getMeta(slug: string): Promise<ScanMeta | null>;
  listMeta(opts: ListMetaOptions): Promise<{ entries: ScanMeta[]; total: number }>;
  getAllSlugs(): Promise<string[]>;

  // --- Jobs (scan queue status) ---
  getJob(jobId: string): Promise<ScanJob | null>;
  putJob(job: ScanJob): Promise<void>;
}

/** Extract lightweight metadata from a full ScanResult. */
export function extractMeta(slug: string, result: ScanResult): ScanMeta {
  return {
    slug,
    packageName: result.packageName,
    packageVersion: result.packageVersion,
    overallScore: result.overallScore,
    codeScore: result.codeScore,
    contentScore: result.contentScore,
    grade: getGrade(result.overallScore),
    findingsCount: result.codeFindings.length + result.promptFindings.length,
    taintFlowCount: result.taintFlows.length,
    timestamp: result.timestamp,
    duration: result.duration,
    scanId: result.scanId,
  };
}

/**
 * Convert an npm package name to a URL-safe slug.
 *   @modelcontextprotocol/server-filesystem → modelcontextprotocol-server-filesystem
 */
export function packageToSlug(packageName: string): string {
  return packageName
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .replace(/[^a-z0-9\-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
