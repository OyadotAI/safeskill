import type { Metadata } from 'next';
import { getAllCachedSlugs, getCachedScanBySlug } from '@/data/scan-cache';
import { getGrade, GRADE_LABELS } from '@safeskill/shared';
import type { ScanResult } from '@safeskill/shared';
import { ScanReportClient } from './client';
import { LiveScanBySlug } from './live';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Static export: only pre-scanned slugs get pages.
// Uncached packages are handled client-side via the API worker.
export const dynamicParams = false;

export async function generateStaticParams() {
  return getAllCachedSlugs().map((slug) => ({ slug }));
}

function buildMetadata(slug: string, result: ScanResult): Metadata {
  const grade = getGrade(result.overallScore);
  const gradeLabel = GRADE_LABELS[grade];
  const totalFindings = result.codeFindings.length + result.promptFindings.length;
  const desc = `${result.packageName} scored ${result.overallScore}/100 (${gradeLabel}). ${totalFindings} finding${totalFindings !== 1 ? 's' : ''} detected. Full security report: code analysis, prompt injection, taint tracking.`;

  return {
    title: `${result.packageName} — Security Scan — SafeSkill`,
    description: desc,
    keywords: [result.packageName, 'security scan', 'MCP server', 'npm security', 'prompt injection', gradeLabel],
    openGraph: {
      title: `${result.packageName} — ${result.overallScore}/100 (${gradeLabel})`,
      description: desc,
      url: `https://safeskill.dev/scan/${slug}`,
      siteName: 'SafeSkill',
      type: 'article',
    },
    twitter: {
      card: 'summary',
      title: `${result.packageName} — ${result.overallScore}/100`,
      description: desc,
    },
    alternates: { canonical: `https://safeskill.dev/scan/${slug}` },
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = getCachedScanBySlug(slug);

  if (!result) {
    const readable = slug.replace(/-/g, ' ');
    return {
      title: `${readable} — Security Scan — SafeSkill`,
      description: `Security scan for ${readable}. Analyzing code, prompt injection, and data exfiltration risks.`,
      alternates: { canonical: `https://safeskill.dev/scan/${slug}` },
    };
  }

  return buildMetadata(slug, result);
}

export default async function ScanSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const result = getCachedScanBySlug(slug);

  if (!result) {
    // Not in build-time cache — render client-side live scanner
    return <LiveScanBySlug slug={slug} />;
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'TechArticle',
            headline: `${result.packageName} Security Scan`,
            description: `Security analysis of ${result.packageName}. Score: ${result.overallScore}/100.`,
            url: `https://safeskill.dev/scan/${slug}`,
            datePublished: new Date(result.timestamp).toISOString(),
            author: { '@type': 'Organization', name: 'SafeSkill', url: 'https://safeskill.dev' },
            publisher: { '@type': 'Organization', name: 'SafeSkill', url: 'https://safeskill.dev' },
          }),
        }}
      />
      <ScanReportClient result={result} />
    </>
  );
}
