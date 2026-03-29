/**
 * Discover new AI skill packages from multiple sources.
 */

const GITHUB_API = 'https://api.github.com';
const NPM_API = 'https://registry.npmjs.org/-/v1/search';
const SMITHERY_API = 'https://registry.smithery.ai/servers';

export interface DiscoveredPackage {
  name: string;        // npm package name or "owner/repo" for GitHub
  source: string;      // github-topic, npm, smithery, github-list
  isGitHub: boolean;   // true if it's a GitHub repo (not an npm package)
  description: string;
  category: string;
}

function ghHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'SafeSkill-Discovery/1.0',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- GitHub Topics ---

const GITHUB_TOPICS = [
  { topic: 'mcp-server', category: 'mcp-server' },
  { topic: 'claude-skill', category: 'claude-skill' },
  { topic: 'claude-code-skill', category: 'claude-skill' },
  { topic: 'openclaw', category: 'openclaw-tool' },
  { topic: 'agent-skills', category: 'other' },
  { topic: 'model-context-protocol', category: 'mcp-server' },
  { topic: 'mcp-tools', category: 'mcp-server' },
  { topic: 'claude-code', category: 'claude-skill' },
];

async function discoverGitHubTopics(token: string): Promise<DiscoveredPackage[]> {
  const results: DiscoveredPackage[] = [];
  const seen = new Set<string>();

  for (const { topic, category } of GITHUB_TOPICS) {
    let page = 1;
    const maxPages = 10; // GitHub caps at 1000 results

    while (page <= maxPages) {
      try {
        const url = `${GITHUB_API}/search/repositories?q=topic:${topic}&sort=updated&order=desc&per_page=100&page=${page}`;
        const res = await fetch(url, { headers: ghHeaders(token) });

        if (res.status === 403 || res.status === 429) {
          const retryAfter = parseInt(res.headers.get('retry-after') ?? '60', 10);
          console.log(`  Rate limited on topic:${topic}, waiting ${retryAfter}s...`);
          await sleep(retryAfter * 1000);
          continue;
        }

        if (!res.ok) break;

        const data = await res.json() as {
          items: Array<{ full_name: string; description: string | null; topics: string[] }>;
          total_count: number;
        };

        if (data.items.length === 0) break;

        for (const repo of data.items) {
          const name = repo.full_name;
          if (seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());

          results.push({
            name,
            source: `github-topic:${topic}`,
            isGitHub: true,
            description: (repo.description ?? '').slice(0, 200),
            category,
          });
        }

        page++;
        await sleep(token ? 200 : 2000);
      } catch (e) {
        console.error(`  Error crawling topic:${topic} page ${page}:`, e);
        break;
      }
    }

    console.log(`  topic:${topic} → ${results.filter(r => r.source === `github-topic:${topic}`).length} repos`);
  }

  return results;
}

// --- GitHub Curated Lists ---

const GITHUB_LISTS = [
  {
    name: 'official-mcp',
    url: 'https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md',
  },
  {
    name: 'awesome-mcp-punkpeye',
    url: 'https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md',
  },
  {
    name: 'awesome-mcp-wong2',
    url: 'https://raw.githubusercontent.com/wong2/awesome-mcp-servers/main/README.md',
  },
  {
    name: 'awesome-openclaw',
    url: 'https://raw.githubusercontent.com/anthropics/courses/master/README.md',
  },
];

async function discoverGitHubLists(token: string): Promise<DiscoveredPackage[]> {
  const results: DiscoveredPackage[] = [];
  const seen = new Set<string>();

  // Regex to find GitHub repo links in markdown
  const ghRepoRe = /\[([^\]]+)\]\(https?:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\/?(?:[#?][^\)]*)?\)/g;
  // Regex to find npm package references
  const npmRe = /(?:npx|npm install|npm i)\s+(@?[a-z0-9\-._~]+(?:\/[a-z0-9\-._~]+)?)/gi;

  for (const list of GITHUB_LISTS) {
    try {
      const res = await fetch(list.url, { headers: ghHeaders(token) });
      if (!res.ok) continue;
      const content = await res.text();

      // Extract GitHub repos
      let match;
      while ((match = ghRepoRe.exec(content)) !== null) {
        const repo = match[2];
        if (seen.has(repo.toLowerCase())) continue;
        seen.add(repo.toLowerCase());
        results.push({
          name: repo,
          source: `github-list:${list.name}`,
          isGitHub: true,
          description: match[1].slice(0, 200),
          category: 'mcp-server',
        });
      }

      // Extract npm packages
      while ((match = npmRe.exec(content)) !== null) {
        const pkg = match[1];
        if (seen.has(pkg.toLowerCase())) continue;
        seen.add(pkg.toLowerCase());
        results.push({
          name: pkg,
          source: `github-list:${list.name}`,
          isGitHub: false,
          description: '',
          category: 'mcp-server',
        });
      }

      console.log(`  list:${list.name} → ${results.filter(r => r.source === `github-list:${list.name}`).length} entries`);
    } catch (e) {
      console.error(`  Error crawling list:${list.name}:`, e);
    }

    await sleep(500);
  }

  return results;
}

// --- npm Registry ---

const NPM_KEYWORDS = [
  'mcp-server',
  'mcp',
  'model-context-protocol',
  'claude-skill',
  'claude-code',
  'ai-tool',
  'openclaw',
  'llm-tool',
];

async function discoverNpm(): Promise<DiscoveredPackage[]> {
  const results: DiscoveredPackage[] = [];
  const seen = new Set<string>();

  for (const keyword of NPM_KEYWORDS) {
    let from = 0;
    const size = 250;

    while (from < 2000) { // max 2000 per keyword
      try {
        const url = `${NPM_API}?text=keywords:${keyword}&size=${size}&from=${from}`;
        const res = await fetch(url);
        if (!res.ok) break;

        const data = await res.json() as {
          objects: Array<{
            package: { name: string; description: string; keywords?: string[] };
          }>;
          total: number;
        };

        if (data.objects.length === 0) break;

        for (const obj of data.objects) {
          const pkg = obj.package;
          if (seen.has(pkg.name.toLowerCase())) continue;
          seen.add(pkg.name.toLowerCase());

          let category = 'other';
          const lower = (pkg.name + ' ' + (pkg.keywords?.join(' ') ?? '')).toLowerCase();
          if (lower.includes('mcp') || lower.includes('model-context-protocol')) category = 'mcp-server';
          else if (lower.includes('claude-skill') || lower.includes('claude-code')) category = 'claude-skill';
          else if (lower.includes('openclaw')) category = 'openclaw-tool';

          results.push({
            name: pkg.name,
            source: `npm:${keyword}`,
            isGitHub: false,
            description: (pkg.description ?? '').slice(0, 200),
            category,
          });
        }

        from += size;
        await sleep(100);
      } catch (e) {
        console.error(`  Error crawling npm:${keyword}:`, e);
        break;
      }
    }

    console.log(`  npm:${keyword} → ${results.filter(r => r.source === `npm:${keyword}`).length} packages`);
  }

  return results;
}

// --- Smithery ---

async function discoverSmithery(): Promise<DiscoveredPackage[]> {
  const results: DiscoveredPackage[] = [];
  let page = 1;

  while (true) {
    try {
      const res = await fetch(`${SMITHERY_API}?page=${page}&pageSize=100`);
      if (!res.ok) break;

      const data = await res.json() as {
        servers: Array<{ qualifiedName: string; displayName: string; description: string }>;
        pagination: { totalPages: number };
      };

      if (!data.servers || data.servers.length === 0) break;

      for (const server of data.servers) {
        results.push({
          name: server.qualifiedName,
          source: 'smithery',
          isGitHub: false,
          description: (server.description ?? '').slice(0, 200),
          category: 'mcp-server',
        });
      }

      if (page >= data.pagination.totalPages) break;
      page++;
      await sleep(200);
    } catch (e) {
      console.error(`  Error crawling smithery page ${page}:`, e);
      break;
    }
  }

  console.log(`  smithery → ${results.length} servers`);
  return results;
}

// --- Main Discovery ---

export async function discover(githubToken: string): Promise<DiscoveredPackage[]> {
  const all: DiscoveredPackage[] = [];
  const globalSeen = new Set<string>();

  function addUnique(packages: DiscoveredPackage[]) {
    for (const pkg of packages) {
      const key = pkg.name.toLowerCase();
      if (globalSeen.has(key)) continue;
      globalSeen.add(key);
      all.push(pkg);
    }
  }

  console.log('Crawling GitHub topics...');
  addUnique(await discoverGitHubTopics(githubToken));

  console.log('Crawling GitHub curated lists...');
  addUnique(await discoverGitHubLists(githubToken));

  console.log('Crawling npm registry...');
  addUnique(await discoverNpm());

  console.log('Crawling Smithery registry...');
  addUnique(await discoverSmithery());

  console.log(`Total unique: ${all.length}`);
  console.log(`  GitHub repos: ${all.filter(p => p.isGitHub).length}`);
  console.log(`  npm packages: ${all.filter(p => !p.isGitHub).length}`);

  return all;
}
