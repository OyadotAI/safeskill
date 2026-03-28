import type { MarketplaceEntry, SkillCategory } from '@safeskill/shared';
import type { Crawler, CrawlerOptions, CrawlerResult } from './types.js';

const GITHUB_SEARCH_API = 'https://api.github.com/search/repositories';
const PER_PAGE = 100; // GitHub max

// GitHub topics mapped to categories
const TOPICS: Array<{ topic: string; category: SkillCategory }> = [
  { topic: 'mcp-server', category: 'mcp-server' },
  { topic: 'agent-skills', category: 'other' },
  { topic: 'openclaw', category: 'openclaw-tool' },
  { topic: 'claude-skill', category: 'claude-skill' },
  { topic: 'claude-code-skill', category: 'claude-skill' },
  { topic: 'model-context-protocol', category: 'mcp-server' },
];

interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: Array<{
    full_name: string;
    name: string;
    description: string | null;
    html_url: string;
    stargazers_count: number;
    topics: string[];
    language: string | null;
    updated_at: string;
  }>;
}

export class GitHubTopicsCrawler implements Crawler {
  name = 'github-topics';

  private token: string | undefined;

  constructor(token?: string) {
    this.token = token ?? process.env.GITHUB_TOKEN ?? undefined;
  }

  async crawl(options?: CrawlerOptions): Promise<CrawlerResult> {
    const start = Date.now();
    const limit = options?.limit ?? 10000;
    const seen = new Set<string>();
    const entries: MarketplaceEntry[] = [];

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    for (const { topic, category } of TOPICS) {
      if (entries.length >= limit) break;

      let page = 1;
      // GitHub search API returns max 1000 results per query
      const maxPages = 10; // 10 pages * 100 per page = 1000

      while (page <= maxPages && entries.length < limit) {
        const q = encodeURIComponent(`topic:${topic}`);
        const url = `${GITHUB_SEARCH_API}?q=${q}&sort=stars&order=desc&per_page=${PER_PAGE}&page=${page}`;

        let data: GitHubSearchResponse;
        try {
          const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });

          if (res.status === 403 || res.status === 429) {
            // Rate limited — wait and retry once
            const retryAfter = parseInt(res.headers.get('retry-after') ?? '60', 10);
            await sleep(Math.min(retryAfter * 1000, 60000));
            const retry = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
            if (!retry.ok) break;
            data = await retry.json() as GitHubSearchResponse;
          } else if (!res.ok) {
            break;
          } else {
            data = await res.json() as GitHubSearchResponse;
          }
        } catch {
          break;
        }

        if (data.items.length === 0) break;

        for (const repo of data.items) {
          if (seen.has(repo.full_name)) continue;
          seen.add(repo.full_name);

          // Infer npm package name — check if repo name looks like an npm package
          const packageName = inferPackageName(repo.full_name, repo.name, repo.topics);

          entries.push({
            source: `github-topic:${topic}`,
            packageName,
            description: (repo.description ?? '').slice(0, 500),
            repositoryUrl: repo.html_url,
            category: refineCategory(category, repo.topics, repo.name, repo.description ?? ''),
            tags: [
              topic,
              ...(repo.language ? [repo.language.toLowerCase()] : []),
              ...repo.topics.filter(t => t !== topic).slice(0, 5),
            ],
            discoveredAt: Date.now(),
          });
        }

        options?.onProgress?.(entries.length, null);
        page++;

        // Respect GitHub rate limits
        await sleep(this.token ? 200 : 2000);
      }
    }

    return {
      source: 'github-topics',
      entries,
      totalAvailable: null,
      duration: Date.now() - start,
    };
  }
}

function inferPackageName(fullName: string, repoName: string, topics: string[]): string {
  // If repo name already looks like a scoped npm package
  if (repoName.startsWith('@')) return repoName;

  // Common pattern: owner/mcp-server-xyz -> @owner/mcp-server-xyz or just mcp-server-xyz
  // For now, use the repo full_name as the identifier (owner/repo)
  return fullName;
}

function refineCategory(
  defaultCat: SkillCategory,
  topics: string[],
  name: string,
  description: string,
): SkillCategory {
  const text = `${topics.join(' ')} ${name} ${description}`.toLowerCase();

  if (text.includes('mcp-server') || text.includes('mcp server') || text.includes('model-context-protocol')) {
    return 'mcp-server';
  }
  if (text.includes('claude-skill') || text.includes('claude skill') || text.includes('claude-code')) {
    return 'claude-skill';
  }
  if (text.includes('openclaw')) {
    return 'openclaw-tool';
  }
  if (text.includes('cli-tool') || text.includes('cli tool')) {
    return 'cli-tool';
  }

  return defaultCat;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
