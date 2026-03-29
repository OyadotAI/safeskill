import type { ScoreGrade } from '@safeskill/shared';

/** Lightweight metadata for browse/search — stored in Firestore. */
export interface ScanMeta {
  slug: string;
  packageName: string;
  packageVersion: string | null;
  overallScore: number;
  codeScore: number;
  contentScore: number;
  grade: ScoreGrade;
  findingsCount: number;
  taintFlowCount: number;
  timestamp: number;
  duration: number;
  scanId: string;
}

/** Job tracking for async scans. */
export interface ScanJob {
  jobId: string;
  packageName: string;
  slug: string;
  status: 'queued' | 'scanning' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  error?: string;
}

/** Options for listing scan metadata. */
export interface ListMetaOptions {
  limit: number;
  offset: number;
  sort: 'score' | 'timestamp' | 'name';
  order?: 'asc' | 'desc';
}
