import { Storage } from '@google-cloud/storage';
import { Firestore } from '@google-cloud/firestore';
import type { ScanResult } from '@safeskill/shared';
import type { ScanStore, ScanMeta, ScanJob, ListMetaOptions } from './index.js';
import { extractMeta } from './index.js';

export interface GcpStoreConfig {
  /** GCS bucket name for full scan results. */
  bucket: string;
  /** GCP project ID. */
  projectId: string;
  /** Firestore collection prefix (default: no prefix). */
  collectionPrefix?: string;
}

/**
 * GCP-backed scan store.
 * - GCS: full ScanResult JSON files at results/{slug}.json
 * - Firestore: scan metadata (scans/{slug}) and job status (jobs/{jobId})
 */
export class GcpScanStore implements ScanStore {
  private storage: Storage;
  private bucket: string;
  private db: Firestore;
  private scansCol: string;
  private jobsCol: string;

  constructor(config: GcpStoreConfig) {
    this.storage = new Storage({ projectId: config.projectId });
    this.bucket = config.bucket;
    this.db = new Firestore({ projectId: config.projectId });
    const prefix = config.collectionPrefix ?? '';
    this.scansCol = prefix ? `${prefix}_scans` : 'scans';
    this.jobsCol = prefix ? `${prefix}_jobs` : 'jobs';
  }

  // --- Results (GCS) ---

  async getResult(slug: string): Promise<ScanResult | null> {
    try {
      const file = this.storage.bucket(this.bucket).file(`results/${slug}.json`);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [contents] = await file.download();
      return JSON.parse(contents.toString('utf-8')) as ScanResult;
    } catch {
      return null;
    }
  }

  async putResult(slug: string, result: ScanResult): Promise<void> {
    const file = this.storage.bucket(this.bucket).file(`results/${slug}.json`);
    await file.save(JSON.stringify(result), {
      contentType: 'application/json',
      metadata: {
        cacheControl: 'public, max-age=86400', // 1 day
      },
    });

    // Also write metadata to Firestore
    const meta = extractMeta(slug, result);
    await this.db.collection(this.scansCol).doc(slug).set(meta);
  }

  // --- Metadata (Firestore) ---

  async getMeta(slug: string): Promise<ScanMeta | null> {
    const doc = await this.db.collection(this.scansCol).doc(slug).get();
    if (!doc.exists) return null;
    return doc.data() as ScanMeta;
  }

  async listMeta(opts: ListMetaOptions): Promise<{ entries: ScanMeta[]; total: number }> {
    // Get total count (cached via a counter doc for production; full count for now)
    const countSnapshot = await this.db.collection(this.scansCol).count().get();
    const total = countSnapshot.data().count;

    // Build query
    const sortField = opts.sort === 'score' ? 'overallScore'
      : opts.sort === 'name' ? 'packageName'
      : 'timestamp';
    const direction = opts.order === 'asc' ? 'asc' : 'desc';

    const snapshot = await this.db
      .collection(this.scansCol)
      .orderBy(sortField, direction)
      .offset(opts.offset)
      .limit(opts.limit)
      .get();

    const entries = snapshot.docs.map((doc) => doc.data() as ScanMeta);
    return { entries, total };
  }

  async getAllSlugs(): Promise<string[]> {
    const snapshot = await this.db
      .collection(this.scansCol)
      .select() // Only get doc IDs, no field data
      .get();
    return snapshot.docs.map((doc) => doc.id);
  }

  // --- Jobs (Firestore) ---

  async getJob(jobId: string): Promise<ScanJob | null> {
    const doc = await this.db.collection(this.jobsCol).doc(jobId).get();
    if (!doc.exists) return null;
    return doc.data() as ScanJob;
  }

  async putJob(job: ScanJob): Promise<void> {
    await this.db.collection(this.jobsCol).doc(job.jobId).set(job);
  }

  // --- Batch helpers ---

  /** Upload many results in parallel (for migration). */
  async putResultsBatch(
    items: Array<{ slug: string; result: ScanResult }>,
    concurrency = 10,
  ): Promise<number> {
    let uploaded = 0;
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async ({ slug, result }) => {
          await this.putResult(slug, result);
          uploaded++;
        }),
      );
    }
    return uploaded;
  }
}
