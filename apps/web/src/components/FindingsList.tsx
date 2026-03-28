'use client';

import { useState } from 'react';
import type { CodeFinding, PromptFinding } from '@safeskill/shared';

const SEV_COLORS: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  high: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  low: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  info: 'text-gray-500 bg-gray-500/5 border-gray-500/10',
};

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

interface Props {
  codeFindings: CodeFinding[];
  promptFindings: PromptFinding[];
}

export function FindingsList({ codeFindings, promptFindings }: Props) {
  const [filter, setFilter] = useState<'all' | 'code' | 'prompt'>('all');
  const [showAll, setShowAll] = useState(false);

  const combined = [
    ...codeFindings.map(f => ({ ...f, kind: 'code' as const, snippet: f.codeSnippet })),
    ...promptFindings.map(f => ({ ...f, kind: 'prompt' as const, snippet: f.contentSnippet })),
  ].sort((a, b) => (SEV_ORDER[a.severity] ?? 5) - (SEV_ORDER[b.severity] ?? 5));

  const filtered = filter === 'all' ? combined : combined.filter(f => f.kind === filter);
  const shown = showAll ? filtered : filtered.slice(0, 15);

  return (
    <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          Findings
          <span className="text-sm font-normal text-gray-500 ml-2">({filtered.length})</span>
        </h3>
        <div className="flex gap-1">
          {(['all', 'code', 'prompt'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                filter === f
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-gray-700/50 bg-gray-800/30 text-gray-400 hover:text-gray-300'
              }`}
            >
              {f === 'all' ? 'All' : f === 'code' ? 'Code' : 'Prompt'}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-gray-500 text-sm py-4">No findings detected. This package looks clean.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((finding, i) => (
            <div key={i} className="rounded-lg border border-gray-800/50 bg-gray-950/50 p-4">
              <div className="flex items-start gap-3">
                <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold uppercase rounded border ${SEV_COLORS[finding.severity]}`}>
                  {finding.severity}
                </span>
                <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium uppercase rounded border ${
                  finding.kind === 'prompt' ? 'text-purple-400 bg-purple-500/10 border-purple-500/20' : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
                }`}>
                  {finding.kind}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200">{finding.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {finding.location.file}:{finding.location.line}
                  </p>
                  {finding.snippet && (
                    <pre className="mt-2 text-xs text-gray-500 bg-gray-900/50 rounded p-2 overflow-x-auto">
                      {finding.snippet.slice(0, 200)}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length > 15 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-4 w-full py-2 text-sm text-gray-400 hover:text-emerald-400 border border-gray-800/50 rounded-lg hover:border-emerald-500/30 transition-colors"
        >
          Show all {filtered.length} findings
        </button>
      )}
    </div>
  );
}
