#!/usr/bin/env npx tsx

/**
 * SafeSkill Seed Script
 *
 * Crawls all marketplace sources and builds a static JSON index.
 *
 * Usage:
 *   npx tsx scripts/seed.ts                    # crawl all sources (default 10K limit)
 *   npx tsx scripts/seed.ts --limit 500        # quick test with 500
 *   npx tsx scripts/seed.ts --source npm       # only npm
 *   npx tsx scripts/seed.ts --source smithery  # only smithery
 *   npx tsx scripts/seed.ts --source github    # only github topics
 */

import { NpmCrawler, SmitheryCrawler, GitHubListsCrawler, GitHubTopicsCrawler } from '../packages/scanner/src/crawlers/index.js';
import type { CrawlerResult } from '../packages/scanner/src/crawlers/types.js';
import type { MarketplaceEntry } from '../packages/shared/src/types/skill.js';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'marketplaces');

// Parse CLI args
const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]!, 10) : 10000;
const sourceIdx = args.indexOf('--source');
const sourceFilter = sourceIdx >= 0 ? args[sourceIdx + 1] : null;

async function main() {
  console.log(`\n  🛡️  SafeSkill Marketplace Crawler`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Target: ${limit.toLocaleString()} entries`);
  console.log(`  Source: ${sourceFilter ?? 'all'}\n`);

  await mkdir(DATA_DIR, { recursive: true });

  const crawlers = [
    { key: 'npm', crawler: new NpmCrawler() },
    { key: 'smithery', crawler: new SmitheryCrawler() },
    { key: 'github', crawler: new GitHubTopicsCrawler() },
    { key: 'lists', crawler: new GitHubListsCrawler() },
  ].filter(c => !sourceFilter || c.key === sourceFilter);

  const allResults: CrawlerResult[] = [];
  const allEntries: MarketplaceEntry[] = [];
  const seen = new Set<string>();

  for (const { key, crawler } of crawlers) {
    const remaining = limit - allEntries.length;
    if (remaining <= 0) break;

    console.log(`  ⏳ Crawling ${crawler.name}...`);
    const startTime = Date.now();

    try {
      const result = await crawler.crawl({
        limit: remaining,
        onProgress: (fetched, total) => {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const totalStr = total ? `/${total.toLocaleString()}` : '';
          process.stdout.write(`\r  ⏳ Crawling ${crawler.name}... ${fetched.toLocaleString()}${totalStr} entries (${elapsed}s)`);
        },
      });

      allResults.push(result);

      // Deduplicate by packageName
      let added = 0;
      for (const entry of result.entries) {
        const key = entry.packageName.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        allEntries.push(entry);
        added++;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\r  ✓ ${crawler.name}: ${result.entries.length.toLocaleString()} found, ${added.toLocaleString()} new (${elapsed}s)      `);
    } catch (error) {
      console.log(`\r  ✗ ${crawler.name}: ${error instanceof Error ? error.message : 'failed'}      `);
    }
  }

  // Write per-source files
  for (const result of allResults) {
    const filename = `${result.source}.json`;
    await writeFile(
      path.join(DATA_DIR, filename),
      JSON.stringify(result.entries, null, 2),
    );
  }

  // Write combined deduped index
  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalEntries: allEntries.length,
    sources: allResults.map(r => ({
      name: r.source,
      count: r.entries.length,
      totalAvailable: r.totalAvailable,
      duration: r.duration,
    })),
    entries: allEntries,
  };

  await writeFile(
    path.join(DATA_DIR, 'index.json'),
    JSON.stringify(index, null, 2),
  );

  // Write a compact version for the web app (no descriptions, smaller)
  const compact = allEntries.map(e => ({
    n: e.packageName,
    d: e.description.slice(0, 100),
    c: e.category,
    s: e.source,
    t: e.tags.slice(0, 3),
  }));

  await writeFile(
    path.join(DATA_DIR, 'index.compact.json'),
    JSON.stringify(compact),
  );

  // Category breakdown
  const categories: Record<string, number> = {};
  for (const entry of allEntries) {
    categories[entry.category] = (categories[entry.category] ?? 0) + 1;
  }

  console.log(`\n  ─────────────────────────────────`);
  console.log(`  Total unique entries: ${allEntries.length.toLocaleString()}`);
  console.log(`  Categories:`);
  for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat}: ${count.toLocaleString()}`);
  }
  console.log(`\n  Written to: ${DATA_DIR}/`);
  console.log(`    - index.json (${(Buffer.byteLength(JSON.stringify(index)) / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`    - index.compact.json (for web app)`);
  for (const result of allResults) {
    console.log(`    - ${result.source}.json`);
  }
  console.log('');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
