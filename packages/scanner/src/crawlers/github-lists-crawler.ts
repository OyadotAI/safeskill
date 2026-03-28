import type { MarketplaceEntry, SkillCategory } from '@safeskill/shared';
import type { Crawler, CrawlerOptions, CrawlerResult } from './types.js';

/**
 * Crawls curated GitHub awesome-lists and official repos for MCP servers.
 */

interface ListSource {
  url: string;
  source: string;
  category: SkillCategory;
}

const LISTS: ListSource[] = [
  {
    url: 'https://raw.githubusercontent.com/modelcontextprotocol/servers/refs/heads/main/README.md',
    source: 'mcp-official',
    category: 'mcp-server',
  },
  {
    url: 'https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/refs/heads/main/README.md',
    source: 'awesome-mcp-servers',
    category: 'mcp-server',
  },
  {
    url: 'https://raw.githubusercontent.com/wong2/awesome-mcp-servers/refs/heads/main/README.md',
    source: 'awesome-mcp-servers-wong2',
    category: 'mcp-server',
  },
  {
    url: 'https://raw.githubusercontent.com/anthropics/anthropic-cookbook/refs/heads/main/misc/prompt_caching.ipynb',
    source: 'anthropic-cookbook',
    category: 'claude-skill',
  },
];

// Regex patterns to extract package/repo references from markdown
const PATTERNS = {
  // [name](https://github.com/owner/repo) — description
  githubLink: /\[([^\]]+)\]\((https:\/\/github\.com\/[^)]+)\)\s*[-–—:]?\s*(.*)/g,
  // [name](https://www.npmjs.com/package/pkg)
  npmLink: /\[([^\]]+)\]\(https:\/\/(?:www\.)?npmjs\.com\/package\/([^)]+)\)/g,
  // `npx package-name` or `npx @scope/name`
  npxUsage: /`npx\s+(@?[\w\-./]+)`/g,
  // npm install / npm i package
  npmInstall: /`npm\s+(?:install|i)\s+(@?[\w\-./]+)`/g,
};

export class GitHubListsCrawler implements Crawler {
  name = 'github-lists';

  async crawl(options?: CrawlerOptions): Promise<CrawlerResult> {
    const start = Date.now();
    const seen = new Set<string>();
    const entries: MarketplaceEntry[] = [];

    for (const list of LISTS) {
      let markdown: string;
      try {
        const res = await fetch(list.url, {
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) continue;
        markdown = await res.text();
      } catch {
        continue;
      }

      // Extract GitHub links
      let match: RegExpExecArray | null;
      const ghRegex = new RegExp(PATTERNS.githubLink.source, PATTERNS.githubLink.flags);
      while ((match = ghRegex.exec(markdown)) !== null) {
        const name = match[1]!.trim();
        const repoUrl = match[2]!.trim();
        const description = match[3]?.trim() ?? '';

        // Convert github URL to a likely npm package name
        const repoPath = repoUrl.replace('https://github.com/', '');
        const packageName = guessPackageName(name, repoPath);

        if (seen.has(packageName)) continue;
        seen.add(packageName);

        entries.push({
          source: list.source,
          packageName,
          description: description.slice(0, 500),
          repositoryUrl: repoUrl,
          category: list.category,
          tags: [list.source, 'github'],
          discoveredAt: Date.now(),
        });
      }

      // Extract npm links
      const npmRegex = new RegExp(PATTERNS.npmLink.source, PATTERNS.npmLink.flags);
      while ((match = npmRegex.exec(markdown)) !== null) {
        const packageName = match[2]!.trim();
        if (seen.has(packageName)) continue;
        seen.add(packageName);

        entries.push({
          source: list.source,
          packageName,
          description: match[1]?.trim() ?? '',
          repositoryUrl: null,
          category: list.category,
          tags: [list.source, 'npm'],
          discoveredAt: Date.now(),
        });
      }

      // Extract npx references
      const npxRegex = new RegExp(PATTERNS.npxUsage.source, PATTERNS.npxUsage.flags);
      while ((match = npxRegex.exec(markdown)) !== null) {
        const packageName = match[1]!.trim();
        if (seen.has(packageName) || packageName.includes(' ')) continue;
        seen.add(packageName);

        entries.push({
          source: list.source,
          packageName,
          description: '',
          repositoryUrl: null,
          category: list.category,
          tags: [list.source, 'npx'],
          discoveredAt: Date.now(),
        });
      }

      options?.onProgress?.(entries.length, null);
    }

    return {
      source: 'github-lists',
      entries,
      totalAvailable: null,
      duration: Date.now() - start,
    };
  }
}

function guessPackageName(displayName: string, repoPath: string): string {
  // If name looks like an npm package (@scope/name or hyphenated), use it
  if (displayName.startsWith('@') || /^[a-z][\w-]+$/.test(displayName)) {
    return displayName;
  }

  // Otherwise derive from repo path: owner/repo -> repo
  const parts = repoPath.split('/');
  const repo = parts[parts.length - 1] ?? displayName;
  return repo.toLowerCase();
}
