'use client';

import { useEffect, useState } from 'react';
import type { ScanResult } from '@safeskill/shared';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { SearchBar } from '@/components/SearchBar';
import { FindingsList } from '@/components/FindingsList';
import { TaintFlowList } from '@/components/TaintFlowList';
import { PermissionGrid } from '@/components/PermissionGrid';

interface Props {
  packageName: string;
}

type ScanState =
  | { status: 'loading' }
  | { status: 'success'; result: ScanResult }
  | { status: 'error'; message: string };

export function ScanPageClient({ packageName }: Props) {
  const [state, setState] = useState<ScanState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function runScan() {
      setState({ status: 'loading' });
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ package: packageName }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const result: ScanResult = await res.json();
        if (!cancelled) setState({ status: 'success', result });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Scan failed',
          });
        }
      }
    }

    runScan();
    return () => { cancelled = true; };
  }, [packageName]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{packageName}</h1>
            <p className="text-sm text-gray-500">npm package</p>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {state.status === 'loading' && (
        <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-6 animate-pulse">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400 animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Scanning {packageName}...</h2>
          <p className="text-gray-400 text-sm">Downloading package, analyzing code and content for security risks.</p>
          <div className="mt-6 flex justify-center gap-8 text-xs text-gray-500">
            <span>Downloading package...</span>
            <span>Running 8 code detectors</span>
            <span>Running 8 prompt detectors</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {state.status === 'error' && (
        <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Scan Failed</h2>
          <p className="text-gray-400 text-sm mb-6">{state.message}</p>
          <div className="inline-block rounded-xl border border-gray-700/80 bg-gray-950 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-gray-900/50">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
              </div>
              <span className="text-xs text-gray-500">Terminal</span>
            </div>
            <div className="p-4 font-mono text-sm text-left">
              <span className="text-emerald-400 select-none">$ </span>
              <span className="text-gray-50">npx skillsafe scan {packageName}</span>
            </div>
          </div>
        </div>
      )}

      {/* Success state */}
      {state.status === 'success' && (
        <div className="space-y-8">
          {/* Score cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6 flex flex-col items-center">
              <ScoreDisplay score={state.result.overallScore} label="Overall" size="lg" />
            </div>
            <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6 flex flex-col items-center">
              <ScoreDisplay score={state.result.codeScore} label="Code Safety" size="md" />
            </div>
            <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6 flex flex-col items-center">
              <ScoreDisplay score={state.result.contentScore} label="Content Safety" size="md" />
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex flex-wrap gap-4 text-sm text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {state.result.filesScanned} code files scanned
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {state.result.contentFilesScanned} content files scanned
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {state.result.duration}ms scan time
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-gray-500" />
              {state.result.dependencyCount} dependencies
            </span>
          </div>

          {/* Findings */}
          {(state.result.codeFindings.length > 0 || state.result.promptFindings.length > 0) && (
            <FindingsList
              codeFindings={state.result.codeFindings}
              promptFindings={state.result.promptFindings}
            />
          )}

          {/* Taint Flows */}
          {state.result.taintFlows.length > 0 && (
            <TaintFlowList flows={state.result.taintFlows} />
          )}

          {/* Permission Manifest */}
          <PermissionGrid permissions={state.result.permissions} />

          {/* Badge embed */}
          <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6">
            <h3 className="text-lg font-semibold mb-4">Add badge to your README</h3>
            <div className="bg-gray-950 rounded-lg p-4 font-mono text-xs text-gray-400 overflow-x-auto">
              [![SafeSkill](https://safeskill.dev/api/badge/{encodeURIComponent(packageName)})](https://safeskill.dev/scan/{encodeURIComponent(packageName)})
            </div>
          </div>
        </div>
      )}

      {/* Search another */}
      <div className="mt-12 text-center">
        <p className="text-sm text-gray-500 mb-4">Scan another package</p>
        <div className="max-w-lg mx-auto">
          <SearchBar placeholder="Search any npm package..." />
        </div>
      </div>
    </div>
  );
}
