import type { Metadata } from 'next';
import { BrowseClient } from './client';
import { readFile } from 'fs/promises';
import path from 'path';

export const metadata: Metadata = {
  title: 'Browse 10,000+ Skills — SafeSkill',
  description: 'Browse and scan 10,000+ AI tool skills, MCP servers, and plugins from npm, Smithery, and GitHub.',
};

interface CompactEntry {
  n: string; // name
  d: string; // description
  c: string; // category
  s: string; // source
  t: string[]; // tags
}

async function loadIndex(): Promise<CompactEntry[]> {
  // Try multiple possible locations (monorepo root, web app cwd, etc.)
  const candidates = [
    path.join(process.cwd(), 'data', 'marketplaces', 'index.compact.json'),
    path.join(process.cwd(), '..', '..', 'data', 'marketplaces', 'index.compact.json'),
    path.resolve('data', 'marketplaces', 'index.compact.json'),
  ];

  for (const filePath of candidates) {
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw) as CompactEntry[];
    } catch {
      continue;
    }
  }

  return [];
}

export default async function BrowsePage() {
  const entries = await loadIndex();
  return <BrowseClient entries={entries} />;
}
