'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { SearchBar } from '@/components/SearchBar';
import type { ScanResult } from '@safeskill/shared';
import { ScanReportClient } from './client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

/**
 * Guess npm package names from a URL slug.
 * "modelcontextprotocol-server-filesystem" → tries "@modelcontextprotocol/server-filesystem", etc.
 */
function slugToPackageGuesses(slug: string): string[] {
  const guesses: string[] = [];
  const parts = slug.split('-');
  if (parts.length >= 2) {
    for (let i = 1; i < Math.min(parts.length, 4); i++) {
      const scope = parts.slice(0, i).join('-');
      const name = parts.slice(i).join('-');
      guesses.push(`@${scope}/${name}`);
    }
  }
  guesses.push(slug);
  return guesses;
}

type ScanStatus = 'resolving' | 'queued' | 'scanning' | 'completed' | 'failed';

const STATUS_LABELS: Record<ScanStatus, string> = {
  resolving: 'Resolving package name...',
  queued: 'Queued for scanning...',
  scanning: 'Analyzing code and content...',
  completed: 'Scan complete',
  failed: 'Scan failed',
};

export function LiveScanBySlug({ slug, packageName, forceRescan }: { slug: string; packageName?: string; forceRescan?: boolean }) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [status, setStatus] = useState<ScanStatus>('resolving');
  const [error, setError] = useState('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRescan, setIsRescan] = useState(forceRescan ?? false);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const runScan = useCallback(async () => {
    setStatus('resolving');
    setError('');
    stopPolling();

    // 1. Try fetching cached result (skip if rescan requested)
    if (!isRescan) {
      try {
        const cachedRes = await fetch(`${API_BASE}/api/scan/${slug}`);
        if (cachedRes.ok) {
          const data = await cachedRes.json();
          if (data.overallScore != null) {
            setResult(data as ScanResult);
            setStatus('completed');
            return;
          }
        }
      } catch {
        // not cached, continue to scan
      }
    }

    // 2. Trigger a scan (with rescan flag if forced)
    const guesses = packageName ? [packageName] : slugToPackageGuesses(slug);

    for (const pkg of guesses) {
      try {
        const res = await fetch(`${API_BASE}/api/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ package: pkg, rescan: isRescan || undefined }),
        });

        const data = await res.json();

        if (res.status === 200 && data.status === 'completed' && data.result) {
          setResult(data.result as ScanResult);
          setStatus('completed');
          return;
        }

        if (res.status === 202 && data.jobId) {
          // Queued — start polling
          setStatus('queued');
          const jobId = data.jobId as string;

          pollingRef.current = setInterval(async () => {
            try {
              const statusRes = await fetch(`${API_BASE}/api/scan-status/${jobId}`);
              const statusData = await statusRes.json();

              if (statusData.status === 'scanning') {
                setStatus('scanning');
              } else if (statusData.status === 'completed') {
                stopPolling();
                // Fetch the full result
                const resultRes = await fetch(`${API_BASE}/api/scan/${slug}`);
                if (resultRes.ok) {
                  const scanResult = await resultRes.json() as ScanResult;
                  setResult(scanResult);
                  setStatus('completed');
                }
              } else if (statusData.status === 'failed') {
                stopPolling();
                setError(statusData.error ?? 'Scan failed');
                setStatus('failed');
              }
            } catch {
              // Polling error — keep trying
            }
          }, 3000);

          return;
        }

        // If 400/404, try next guess
        if (res.status >= 400) continue;
      } catch {
        continue;
      }
    }

    setError(`Could not find package for "${slug}" on npm`);
    setStatus('failed');
  }, [slug, packageName, isRescan, stopPolling]);

  useEffect(() => {
    runScan();
    return stopPolling;
  }, [runScan, stopPolling]);

  if (status === 'completed' && result) {
    return <ScanReportClient result={result} />;
  }

  if (status === 'failed') {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{slug}</h1>
              <p className="text-sm text-gray-500">Scan failed</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 sm:p-12">
          <div className="max-w-lg mx-auto text-center">
            <h2 className="text-xl font-semibold mb-3 text-red-400">Scan failed</h2>
            <p className="text-gray-400 mb-2 text-sm">{error}</p>
            <div className="text-left rounded-lg bg-gray-950 border border-gray-800 p-4 mb-6">
              <p className="text-xs text-gray-400 mb-2">Make sure the name is correct:</p>
              <ul className="text-xs text-gray-500 space-y-1">
                <li><span className="text-gray-400">npm package:</span> <code className="text-emerald-400/70">@scope/package-name</code> or <code className="text-emerald-400/70">package-name</code></li>
                <li><span className="text-gray-400">GitHub repo:</span> <code className="text-emerald-400/70">owner/repo-name</code></li>
              </ul>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button onClick={runScan} className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-semibold rounded-lg text-sm transition-colors">
                Retry
              </button>
              <a href="/scan" className="px-5 py-2.5 border border-gray-700 hover:border-gray-600 text-gray-300 rounded-lg text-sm transition-colors">
                Search packages
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 text-center">
          <p className="text-sm text-gray-500 mb-4">Try scanning a different package</p>
          <div className="max-w-lg mx-auto">
            <SearchBar placeholder="Search any npm package..." />
          </div>
        </div>
      </div>
    );
  }

  // Scanning / queued / resolving states
  const activeStep = status === 'resolving' ? 0 : status === 'queued' ? 1 : status === 'scanning' ? 2 : 3;
  const steps = [
    'Resolving package name...',
    'Queued — waiting for worker...',
    'Analyzing code & content...',
    'Computing safety score...',
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400 animate-pulse">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{slug}</h1>
            <p className="text-sm text-gray-500">{STATUS_LABELS[status]}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-8 sm:p-12">
        <div className="max-w-md mx-auto text-center">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <svg width="96" height="96" viewBox="0 0 96 96" className="animate-spin-slow">
              <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-800" />
              <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="251" strokeDashoffset="188" strokeLinecap="round" className="text-emerald-500" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
          </div>

          <h2 className="text-xl font-semibold mb-6">Scanning package...</h2>

          <div className="text-left space-y-3 max-w-xs mx-auto">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                {i < activeStep ? (
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-400">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                ) : i === activeStep ? (
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gray-800 border border-gray-700" />
                )}
                <span className={`text-sm ${i <= activeStep ? 'text-gray-400' : 'text-gray-600'}`}>
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
