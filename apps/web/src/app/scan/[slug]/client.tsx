'use client';

import { useState, useEffect } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { FindingsList } from '@/components/FindingsList';
import { PermissionGrid } from '@/components/PermissionGrid';
import { TaintFlowList } from '@/components/TaintFlowList';
import type { ScanResult } from '@safeskill/shared';
import { packageToSlug } from '@/data/scan-cache';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function ScanReportClient({ result: initialResult }: { result: ScanResult }) {
  // Hydrate with build-time data, then refresh from API for latest packageName
  const [result, setResult] = useState(initialResult);

  useEffect(() => {
    if (!API_BASE) return;
    const slug = packageToSlug(initialResult.packageName);
    fetch(`${API_BASE}/api/scan/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.packageName) setResult(data); })
      .catch(() => {});
  }, [initialResult.packageName]);
  const totalFindings = result.codeFindings.length + result.promptFindings.length;
  const criticalCount = [...result.codeFindings, ...result.promptFindings].filter(f => f.severity === 'critical').length;
  const highCount = [...result.codeFindings, ...result.promptFindings].filter(f => f.severity === 'high').length;
  const mediumCount = [...result.codeFindings, ...result.promptFindings].filter(f => f.severity === 'medium').length;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{result.packageName}</h1>
              <p className="text-sm text-gray-500">
                {result.packageVersion && <span>v{result.packageVersion} &middot; </span>}
                Scanned {new Date(result.timestamp).toLocaleDateString()} &middot; {(result.duration / 1000).toFixed(1)}s
              </p>
            </div>
          </div>
          <a
            href={`/scan?pkg=${encodeURIComponent(result.packageName)}`}
            className="shrink-0 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Rescan
          </a>
        </div>
      </div>

      {/* Score overview */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <div className="lg:col-span-1 rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6 flex flex-col items-center justify-center">
          <ScoreDisplay score={result.overallScore} label="Overall" size="lg" />
        </div>

        <div className="lg:col-span-3 rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Score Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <ScoreDisplay score={result.codeScore} label="Code" size="sm" />
            </div>
            <div className="text-center">
              <ScoreDisplay score={result.contentScore} label="Content" size="sm" />
            </div>
            <div className="text-center p-3 rounded-lg bg-gray-950/50">
              <div className="text-2xl font-bold text-gray-200">{totalFindings}</div>
              <div className="text-xs text-gray-500 mt-1">Findings</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-gray-950/50">
              <div className="text-2xl font-bold text-gray-200">{result.taintFlows.length}</div>
              <div className="text-xs text-gray-500 mt-1">Taint flows</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {criticalCount > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
                {criticalCount} critical
              </span>
            )}
            {highCount > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
                {highCount} high
              </span>
            )}
            {mediumCount > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                {mediumCount} medium
              </span>
            )}
            <span className="text-xs px-2.5 py-1 rounded-lg bg-gray-800/50 text-gray-400 border border-gray-700/50">
              {result.filesScanned} files scanned
            </span>
            <span className="text-xs px-2.5 py-1 rounded-lg bg-gray-800/50 text-gray-400 border border-gray-700/50">
              {result.dependencyCount} dependencies
            </span>
          </div>

          <div className="mt-6 space-y-2">
            {(Object.entries(result.scoreBreakdown) as [string, number][]).map(([key, value]) => {
              const maxes: Record<string, number> = {
                dataFlowRisks: 25, promptInjectionRisks: 20, dangerousApis: 15,
                descriptionMismatch: 10, networkBehavior: 10, dependencyHealth: 8,
                transparency: 7, codeQuality: 5,
              };
              const max = maxes[key] ?? 10;
              const pct = (value / max) * 100;
              const labels: Record<string, string> = {
                dataFlowRisks: 'Data flow risks',
                promptInjectionRisks: 'Prompt injection',
                dangerousApis: 'Dangerous APIs',
                descriptionMismatch: 'Description match',
                networkBehavior: 'Network behavior',
                dependencyHealth: 'Dependency health',
                transparency: 'Transparency',
                codeQuality: 'Code quality',
              };
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-[11px] text-gray-500 w-32 shrink-0 text-right">{labels[key] ?? key}</span>
                  <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: pct > 70 ? '#4caf50' : pct > 40 ? '#ffc107' : '#f44336',
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500 w-10 shrink-0">{Math.round(value)}/{max}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Findings + Permissions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <FindingsList codeFindings={result.codeFindings} promptFindings={result.promptFindings} />
        <PermissionGrid permissions={result.permissions} />
      </div>

      {/* Taint flows */}
      {result.taintFlows.length > 0 && (
        <div className="mb-8">
          <TaintFlowList flows={result.taintFlows} />
        </div>
      )}

      {/* Mismatches */}
      {result.mismatches.length > 0 && (
        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-6 mb-8">
          <h3 className="text-lg font-semibold mb-1">
            Description Mismatches
            <span className="text-sm font-normal text-gray-500 ml-2">({result.mismatches.length})</span>
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            What the content claims vs. what the code actually does.
          </p>
          <div className="space-y-3">
            {result.mismatches.map((m, i) => (
              <div key={i} className="rounded-lg border border-orange-500/20 bg-gray-950/50 p-4">
                <p className="text-sm text-gray-200 mb-2">{m.description}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500">Claims: </span>
                    <span className="text-gray-300">&ldquo;{m.claimed}&rdquo;</span>
                    <p className="text-gray-600 mt-0.5">{m.contentLocation.file}:{m.contentLocation.line}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Actually: </span>
                    <span className="text-orange-300">{m.actual}</span>
                    <p className="text-gray-600 mt-0.5">{m.codeLocation.file}:{m.codeLocation.line}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CLI command */}
      <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6 mb-8">
        <p className="text-sm text-gray-400 mb-3">Run this scan yourself:</p>
        <div className="rounded-lg bg-gray-950 border border-gray-800 p-4 font-mono text-sm">
          <span className="text-emerald-400 select-none">$ </span>
          <span className="text-gray-50">npx skillsafe scan {result.packageName}</span>
        </div>
      </div>

      {/* Badge */}
      <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6 mb-8">
        <p className="text-sm text-gray-400 mb-4">Add a safety badge to your README:</p>
        {/* Badge preview */}
        <div className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${API_BASE}/api/badge/${packageToSlug(result.packageName)}`}
            alt={`SafeSkill score for ${result.packageName}`}
            height={20}
          />
        </div>
        {/* Markdown */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">Markdown</span>
            <CopyButton text={`[![SafeSkill](https://safeskill.dev/api/badge/${packageToSlug(result.packageName)})](https://safeskill.dev/scan/${packageToSlug(result.packageName)})`} />
          </div>
          <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 font-mono text-xs text-gray-400 overflow-x-auto">
            [![SafeSkill](https://safeskill.dev/api/badge/{packageToSlug(result.packageName)})](https://safeskill.dev/scan/{packageToSlug(result.packageName)})
          </div>
        </div>
        {/* HTML */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">HTML</span>
            <CopyButton text={`<a href="https://safeskill.dev/scan/${packageToSlug(result.packageName)}"><img src="https://safeskill.dev/api/badge/${packageToSlug(result.packageName)}" alt="SafeSkill"></a>`} />
          </div>
          <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 font-mono text-xs text-gray-400 overflow-x-auto">
            {'<a href="https://safeskill.dev/scan/'}{packageToSlug(result.packageName)}{'"><img src="https://safeskill.dev/api/badge/'}{packageToSlug(result.packageName)}{'" alt="SafeSkill"></a>'}
          </div>
        </div>
      </div>

      {/* Search another */}
      <div className="text-center">
        <p className="text-sm text-gray-500 mb-4">Scan another package</p>
        <div className="max-w-lg mx-auto">
          <SearchBar placeholder="Search any npm package..." />
        </div>
      </div>
    </div>
  );
}
