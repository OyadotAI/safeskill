#!/usr/bin/env npx tsx

/**
 * Generates sitemap.xml with:
 * - Static pages
 * - Scanned package pages (slug URLs from scan-results.json)
 * - All 10K+ indexed packages (query param URLs for discovery)
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'apps', 'web', 'public');
const DATA_FILE = path.join(ROOT, 'data', 'marketplaces', 'index.compact.json');
const SCAN_RESULTS = path.join(ROOT, 'data', 'scan-results.json');

const BASE = 'https://safeskill.dev';
const TODAY = new Date().toISOString().split('T')[0];

interface CompactEntry {
  n: string;
  d: string;
  c: string;
  s: string;
  t: string[];
}

function packageToSlug(packageName: string): string {
  return packageName
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .replace(/[^a-z0-9\-._]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

async function main() {
  // Static pages
  const staticPages = [
    { loc: '/', priority: '1.0' },
    { loc: '/browse', priority: '0.9' },
    { loc: '/scan', priority: '0.8' },
    { loc: '/blog', priority: '0.8' },
    { loc: '/blog/we-scanned-10k-skills', priority: '0.9' },
    { loc: '/blog/how-skills-md-steals-your-ssh-keys', priority: '0.8' },
    { loc: '/blog/mcp-server-security-checklist', priority: '0.7' },
  ];

  // Load scanned packages (these get slug URLs with high priority)
  const scannedSlugs = new Set<string>();
  let scanCount = 0;
  try {
    if (existsSync(SCAN_RESULTS)) {
      const raw = await readFile(SCAN_RESULTS, 'utf-8');
      const data = JSON.parse(raw) as { results: Record<string, { packageName: string; timestamp: number }> };
      for (const result of Object.values(data.results)) {
        scannedSlugs.add(packageToSlug(result.packageName));
        scanCount++;
      }
    }
  } catch {
    console.warn('Warning: Could not read scan-results.json');
  }

  // Load package index
  let entries: CompactEntry[] = [];
  try {
    const raw = await readFile(DATA_FILE, 'utf-8');
    entries = JSON.parse(raw) as CompactEntry[];
  } catch {
    console.warn('Warning: No index data found.');
  }

  // Build XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // Static pages
  for (const page of staticPages) {
    xml += `  <url>\n`;
    xml += `    <loc>${BASE}${page.loc}</loc>\n`;
    xml += `    <lastmod>${TODAY}</lastmod>\n`;
    xml += `    <priority>${page.priority}</priority>\n`;
    xml += `  </url>\n`;
  }

  // Scanned package pages — these have full reports, high priority
  for (const slug of scannedSlugs) {
    xml += `  <url>\n`;
    xml += `    <loc>${BASE}/scan/${slug}</loc>\n`;
    xml += `    <lastmod>${TODAY}</lastmod>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>0.8</priority>\n`;
    xml += `  </url>\n`;
  }

  // Indexed packages not yet scanned — lower priority discovery pages
  for (const entry of entries) {
    const slug = packageToSlug(entry.n);
    if (scannedSlugs.has(slug)) continue; // already added above
    xml += `  <url>\n`;
    xml += `    <loc>${BASE}/scan?pkg=${encodeURIComponent(entry.n)}</loc>\n`;
    xml += `    <lastmod>${TODAY}</lastmod>\n`;
    xml += `    <changefreq>monthly</changefreq>\n`;
    xml += `    <priority>0.4</priority>\n`;
    xml += `  </url>\n`;
  }

  xml += '</urlset>\n';

  await writeFile(path.join(PUBLIC_DIR, 'sitemap.xml'), xml);
  const total = staticPages.length + scannedSlugs.size + entries.filter(e => !scannedSlugs.has(packageToSlug(e.n))).length;
  console.log(`Sitemap generated:`);
  console.log(`  ${staticPages.length} static pages`);
  console.log(`  ${scanCount} scanned packages (/scan/<slug> — priority 0.8)`);
  console.log(`  ${entries.length - scannedSlugs.size} indexed packages (/scan?pkg= — priority 0.4)`);
  console.log(`  ${total} total URLs`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
