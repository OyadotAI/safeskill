import type { MarketplaceEntry } from '@safeskill/shared';

export interface CrawlerOptions {
  /** Max number of entries to fetch */
  limit?: number;
  /** Callback for progress updates */
  onProgress?: (fetched: number, total: number | null) => void;
}

export interface CrawlerResult {
  source: string;
  entries: MarketplaceEntry[];
  totalAvailable: number | null;
  duration: number;
}

export interface Crawler {
  name: string;
  crawl(options?: CrawlerOptions): Promise<CrawlerResult>;
}
