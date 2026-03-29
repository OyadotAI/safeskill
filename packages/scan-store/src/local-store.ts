import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { ScanResult } from '@safeskill/shared';
import type { ScanStore, ScanMeta, ScanJob, ListMetaOptions } from './index.js';
import { extractMeta, packageToSlug } from './index.js';

/**
 * Local filesystem store for development.
 * Stores results as individual JSON files and metadata in a single index.
 */
export class LocalScanStore implements ScanStore {
  private resultsDir: string;
  private metaPath: string;
  private jobsPath: string;

  constructor(dataDir: string) {
    this.resultsDir = path.join(dataDir, 'results');
    this.metaPath = path.join(dataDir, 'meta-index.json');
    this.jobsPath = path.join(dataDir, 'jobs.json');
  }

  async init(): Promise<void> {
    if (!existsSync(this.resultsDir)) {
      await mkdir(this.resultsDir, { recursive: true });
    }
  }

  async getResult(slug: string): Promise<ScanResult | null> {
    const filePath = path.join(this.resultsDir, `${slug}.json`);
    if (!existsSync(filePath)) return null;
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as ScanResult;
  }

  async putResult(slug: string, result: ScanResult): Promise<void> {
    await this.init();
    const filePath = path.join(this.resultsDir, `${slug}.json`);
    await writeFile(filePath, JSON.stringify(result));

    // Also update meta index
    const meta = extractMeta(slug, result);
    const index = await this.loadMetaIndex();
    index[slug] = meta;
    await writeFile(this.metaPath, JSON.stringify(index));
  }

  async getMeta(slug: string): Promise<ScanMeta | null> {
    const index = await this.loadMetaIndex();
    return index[slug] ?? null;
  }

  async listMeta(opts: ListMetaOptions): Promise<{ entries: ScanMeta[]; total: number }> {
    const index = await this.loadMetaIndex();
    let entries = Object.values(index);

    // Sort
    const order = opts.order === 'asc' ? 1 : -1;
    if (opts.sort === 'score') {
      entries.sort((a, b) => (a.overallScore - b.overallScore) * order);
    } else if (opts.sort === 'timestamp') {
      entries.sort((a, b) => (a.timestamp - b.timestamp) * order);
    } else {
      entries.sort((a, b) => a.packageName.localeCompare(b.packageName) * order);
    }

    const total = entries.length;
    entries = entries.slice(opts.offset, opts.offset + opts.limit);
    return { entries, total };
  }

  async getAllSlugs(): Promise<string[]> {
    const index = await this.loadMetaIndex();
    return Object.keys(index);
  }

  async getJob(jobId: string): Promise<ScanJob | null> {
    const jobs = await this.loadJobs();
    return jobs[jobId] ?? null;
  }

  async putJob(job: ScanJob): Promise<void> {
    const jobs = await this.loadJobs();
    jobs[job.jobId] = job;
    await writeFile(this.jobsPath, JSON.stringify(jobs));
  }

  // --- Helpers ---

  private async loadMetaIndex(): Promise<Record<string, ScanMeta>> {
    if (!existsSync(this.metaPath)) return {};
    try {
      const raw = await readFile(this.metaPath, 'utf-8');
      return JSON.parse(raw) as Record<string, ScanMeta>;
    } catch {
      return {};
    }
  }

  private async loadJobs(): Promise<Record<string, ScanJob>> {
    if (!existsSync(this.jobsPath)) return {};
    try {
      const raw = await readFile(this.jobsPath, 'utf-8');
      return JSON.parse(raw) as Record<string, ScanJob>;
    } catch {
      return {};
    }
  }

  /**
   * Import from legacy scan-results.json format.
   */
  async importLegacy(legacyPath: string): Promise<number> {
    const raw = await readFile(legacyPath, 'utf-8');
    const data = JSON.parse(raw) as { results: Record<string, ScanResult> };
    let count = 0;
    for (const result of Object.values(data.results)) {
      const slug = packageToSlug(result.packageName);
      await this.putResult(slug, result);
      count++;
    }
    return count;
  }
}
