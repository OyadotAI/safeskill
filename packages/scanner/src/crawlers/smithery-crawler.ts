import type { MarketplaceEntry } from '@safeskill/shared';
import type { Crawler, CrawlerOptions, CrawlerResult } from './types.js';

const SMITHERY_API = 'https://registry.smithery.ai/servers';
const PAGE_SIZE = 100;

interface SmitheryResponse {
  servers: Array<{
    id: string;
    qualifiedName: string;
    displayName: string;
    description: string;
    iconUrl?: string;
    verified?: boolean;
    createdAt: string;
    useCount?: number;
    tools?: Array<{ name: string; description: string }>;
  }>;
  pagination: {
    currentPage: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
}

export class SmitheryCrawler implements Crawler {
  name = 'smithery';

  async crawl(options?: CrawlerOptions): Promise<CrawlerResult> {
    const start = Date.now();
    const limit = options?.limit ?? 5000;
    const entries: MarketplaceEntry[] = [];
    let page = 1;
    let totalCount: number | null = null;

    while (entries.length < limit) {
      const url = `${SMITHERY_API}?pageSize=${PAGE_SIZE}&page=${page}`;

      let data: SmitheryResponse;
      try {
        const res = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) break;
        data = await res.json() as SmitheryResponse;
      } catch {
        break;
      }

      totalCount = data.pagination.totalCount;

      for (const server of data.servers) {
        entries.push({
          source: 'smithery',
          packageName: server.qualifiedName,
          description: (server.description ?? server.displayName ?? '').slice(0, 500),
          repositoryUrl: null,
          category: 'mcp-server',
          tags: [
            'smithery',
            ...(server.verified ? ['verified'] : []),
            ...(server.tools?.slice(0, 5).map(t => t.name) ?? []),
          ],
          discoveredAt: Date.now(),
        });
      }

      options?.onProgress?.(entries.length, totalCount);

      if (page >= data.pagination.totalPages) break;
      page++;

      await sleep(200);
    }

    return {
      source: 'smithery',
      entries,
      totalAvailable: totalCount,
      duration: Date.now() - start,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
