'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { getCachedScan, getAllCachedScans, packageToSlug } from '@/data/scan-cache';
import { getGrade, GRADE_LABELS, GRADE_COLORS } from '@safeskill/shared';
import { LiveScanBySlug } from './[slug]/live';

function ScanContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pkg = searchParams.get('pkg') ?? '';
  const packageName = decodeURIComponent(pkg);

  // Detect if we're served as a SPA fallback for /scan/<slug>
  // usePathname() returns the Next.js route (/scan), not the browser URL,
  // so we read window.location.pathname directly.
  const [slugFromPath, setSlugFromPath] = useState<string | null>(null);
  useEffect(() => {
    const match = window.location.pathname.match(/^\/scan\/(.+)$/);
    if (match) setSlugFromPath(match[1]);
  }, []);

  // If ?pkg= is set and cached, redirect to static page
  useEffect(() => {
    if (packageName) {
      const cached = getCachedScan(packageName);
      if (cached) {
        router.replace(`/scan/${packageToSlug(cached.packageName)}`);
      }
    }
  }, [packageName, router]);

  // SPA fallback: /scan/<slug> for a slug that wasn't pre-rendered
  if (slugFromPath) {
    return <LiveScanBySlug slug={slugFromPath} />;
  }

  // ?pkg= for uncached package
  if (packageName && !getCachedScan(packageName)) {
    return <LiveScanBySlug slug={packageToSlug(packageName)} packageName={packageName} />;
  }

  // ?pkg= for cached — redirecting
  if (packageName) {
    return <div className="mx-auto max-w-7xl px-4 py-16 text-center text-gray-500">Redirecting...</div>;
  }

  // No package — show search + recently scanned
  const cached = getAllCachedScans();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold mb-4">Scan a Package</h1>
        <p className="text-gray-400 mb-8">Enter an npm package name to get a full security report.</p>
        <div className="max-w-lg mx-auto">
          <SearchBar size="large" placeholder="Search any npm package..." />
        </div>
      </div>

      {cached.length > 0 && (
        <div className="mt-16">
          <h2 className="text-xl font-semibold mb-6">Recently scanned</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cached.map((r) => {
              const g = getGrade(r.overallScore);
              const c = GRADE_COLORS[g];
              const l = GRADE_LABELS[g];
              const findings = r.codeFindings.length + r.promptFindings.length;
              const slug = packageToSlug(r.packageName);
              return (
                <a
                  key={r.packageName}
                  href={`/scan/${slug}`}
                  className="group rounded-xl border border-gray-800/80 bg-gray-900/50 p-5 hover:border-emerald-500/30 hover:bg-gray-900/80 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-gray-100 truncate group-hover:text-emerald-400 transition-colors">
                        {r.packageName}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">{r.packageVersion}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs px-1.5 py-0.5 rounded border" style={{ color: c, borderColor: `${c}33`, backgroundColor: `${c}11` }}>
                          {l}
                        </span>
                        <span className="text-xs text-gray-600">{findings} findings</span>
                      </div>
                    </div>
                    <ScoreDisplay score={r.overallScore} size="sm" />
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-16 text-center text-gray-500">Loading...</div>}>
      <ScanContent />
    </Suspense>
  );
}
