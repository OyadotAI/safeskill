import type { MarketplaceEntry, SkillCategory } from '@safeskill/shared';
import type { Crawler, CrawlerOptions, CrawlerResult } from './types.js';

const NPM_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search';
const PAGE_SIZE = 250; // npm max

// Search queries to cover the AI tools ecosystem
const SEARCH_QUERIES = [
  { q: 'keywords:mcp-server', category: 'mcp-server' as SkillCategory },
  { q: 'keywords:mcp', category: 'mcp-server' as SkillCategory },
  { q: 'keywords:model-context-protocol', category: 'mcp-server' as SkillCategory },
  { q: 'keywords:claude-skill', category: 'claude-skill' as SkillCategory },
  { q: 'keywords:claude-code', category: 'claude-skill' as SkillCategory },
  { q: 'keywords:ai-tool', category: 'other' as SkillCategory },
  { q: 'keywords:ai-plugin', category: 'other' as SkillCategory },
  { q: 'keywords:llm-tool', category: 'other' as SkillCategory },
];

interface NpmSearchResponse {
  objects: Array<{
    package: {
      name: string;
      version: string;
      description?: string;
      keywords?: string[];
      links?: {
        repository?: string;
        homepage?: string;
        npm?: string;
      };
      publisher?: { username: string };
      date: string;
    };
    score: { final: number };
  }>;
  total: number;
}

export class NpmCrawler implements Crawler {
  name = 'npm';

  async crawl(options?: CrawlerOptions): Promise<CrawlerResult> {
    const start = Date.now();
    const limit = options?.limit ?? 10000;
    const seen = new Set<string>();
    const entries: MarketplaceEntry[] = [];

    for (const { q, category } of SEARCH_QUERIES) {
      if (entries.length >= limit) break;

      let from = 0;
      let total = Infinity;

      while (from < total && entries.length < limit) {
        const remaining = limit - entries.length;
        const size = Math.min(PAGE_SIZE, remaining);

        const url = `${NPM_SEARCH_URL}?text=${encodeURIComponent(q)}&size=${size}&from=${from}`;

        let data: NpmSearchResponse;
        try {
          const res = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) break;
          data = await res.json() as NpmSearchResponse;
        } catch {
          break;
        }

        total = Math.min(data.total, 10000); // npm caps at 10000

        for (const obj of data.objects) {
          const pkg = obj.package;
          if (seen.has(pkg.name)) continue;
          seen.add(pkg.name);

          const inferredCategory = inferCategory(pkg.name, pkg.keywords ?? [], pkg.description ?? '', category);

          entries.push({
            source: 'npm',
            packageName: pkg.name,
            description: (pkg.description ?? '').slice(0, 500),
            repositoryUrl: pkg.links?.repository ?? null,
            category: inferredCategory,
            tags: (pkg.keywords ?? []).slice(0, 10),
            discoveredAt: Date.now(),
          });
        }

        from += data.objects.length;
        if (data.objects.length === 0) break;

        options?.onProgress?.(entries.length, null);

        // Small delay to be nice to the npm registry
        await sleep(100);
      }
    }

    return {
      source: 'npm',
      entries,
      totalAvailable: null,
      duration: Date.now() - start,
    };
  }
}

function inferCategory(
  name: string,
  keywords: string[],
  description: string,
  defaultCategory: SkillCategory,
): SkillCategory {
  const text = `${name} ${keywords.join(' ')} ${description}`.toLowerCase();

  if (text.includes('mcp-server') || text.includes('mcp server') || text.includes('model context protocol')) {
    return 'mcp-server';
  }
  if (text.includes('claude-skill') || text.includes('claude skill') || text.includes('claude code')) {
    return 'claude-skill';
  }
  if (text.includes('openclaw')) {
    return 'openclaw-tool';
  }

  return defaultCategory;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
