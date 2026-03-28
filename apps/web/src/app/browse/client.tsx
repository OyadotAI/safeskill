'use client';

import { useState, useMemo } from 'react';
import { SearchBar } from '@/components/SearchBar';

interface CompactEntry {
  n: string;
  d: string;
  c: string;
  s: string;
  t: string[];
}

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'mcp-server', label: 'MCP Servers' },
  { key: 'claude-skill', label: 'Claude Skills' },
  { key: 'openclaw-tool', label: 'OpenClaw' },
  { key: 'cli-tool', label: 'CLI Tools' },
  { key: 'other', label: 'Other' },
];

const SOURCES = [
  { key: 'all', label: 'All Sources' },
  { key: 'npm', label: 'npm' },
  { key: 'smithery', label: 'Smithery' },
  { key: 'github-topic', label: 'GitHub' },
  { key: 'github-lists', label: 'Curated Lists' },
];

const PAGE_SIZE = 60;

interface Props {
  entries: CompactEntry[];
}

export function BrowseClient({ entries }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [source, setSource] = useState('all');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let result = entries;

    if (category !== 'all') {
      result = result.filter(e => e.c === category);
    }
    if (source !== 'all') {
      result = result.filter(e => e.s.startsWith(source));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.n.toLowerCase().includes(q) ||
        e.d.toLowerCase().includes(q) ||
        e.t.some(t => t.toLowerCase().includes(q))
      );
    }

    return result;
  }, [entries, category, source, search]);

  const pageEntries = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // Category counts
  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { all: entries.length };
    for (const e of entries) {
      counts[e.c] = (counts[e.c] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          Browse {entries.length.toLocaleString()} Skills
        </h1>
        <p className="text-gray-400">
          Indexed from npm, Smithery, GitHub topics, and curated lists. Click any package to scan it.
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Filter by name, description, or tag..."
          className="w-full bg-gray-900 border border-gray-800 rounded-xl text-gray-50 placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25 transition-all pl-4 pr-4 py-3 text-sm"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => { setCategory(cat.key); setPage(0); }}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                category === cat.key
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-gray-700/50 bg-gray-800/30 text-gray-400 hover:text-gray-300'
              }`}
            >
              {cat.label}
              <span className="ml-1 text-gray-600">
                {(catCounts[cat.key] ?? 0).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SOURCES.map(src => (
            <button
              key={src.key}
              onClick={() => { setSource(src.key); setPage(0); }}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                source === src.key
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-gray-700/50 bg-gray-800/30 text-gray-400 hover:text-gray-300'
              }`}
            >
              {src.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="mb-4 text-sm text-gray-500">
        Showing {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} results
      </div>

      {/* Grid */}
      {pageEntries.length === 0 ? (
        <div className="rounded-2xl border border-gray-800/80 bg-gray-900/30 p-12 text-center">
          <p className="text-gray-500">No packages found matching your filters.</p>
          <p className="text-sm text-gray-600 mt-2">Try a different search or category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pageEntries.map((entry) => (
            <a
              key={entry.n}
              href={`/scan/${encodeURIComponent(entry.n)}`}
              className="group rounded-xl border border-gray-800/80 bg-gray-900/30 hover:bg-gray-900/60 hover:border-gray-700/80 p-4 transition-all"
            >
              <h3 className="text-sm font-semibold text-gray-200 group-hover:text-emerald-400 transition-colors truncate mb-1">
                {entry.n}
              </h3>
              {entry.d && (
                <p className="text-xs text-gray-500 line-clamp-2 mb-2 min-h-[2rem]">
                  {entry.d}
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  entry.c === 'mcp-server' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' :
                  entry.c === 'claude-skill' ? 'border-purple-500/20 bg-purple-500/5 text-purple-400' :
                  entry.c === 'openclaw-tool' ? 'border-blue-500/20 bg-blue-500/5 text-blue-400' :
                  'border-gray-700/50 bg-gray-800/30 text-gray-500'
                }`}>
                  {entry.c}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700/50 bg-gray-800/30 text-gray-600">
                  {entry.s.replace('github-topic:', '')}
                </span>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 text-sm rounded-lg border border-gray-700/50 bg-gray-800/30 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500 px-4">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 text-sm rounded-lg border border-gray-700/50 bg-gray-800/30 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Bottom search */}
      <div className="mt-16 text-center">
        <p className="text-gray-500 text-sm mb-4">
          Search for a specific package to scan
        </p>
        <div className="max-w-lg mx-auto">
          <SearchBar placeholder="Scan any npm package..." />
        </div>
      </div>
    </div>
  );
}
