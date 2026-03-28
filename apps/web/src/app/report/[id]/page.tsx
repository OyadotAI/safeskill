import type { Metadata } from 'next';
import type { ScanResult } from '@safeskill/shared';
import { getGrade, GRADE_LABELS } from '@safeskill/shared';
import { readFile } from 'fs/promises';
import path from 'path';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { FindingsList } from '@/components/FindingsList';
import { TaintFlowList } from '@/components/TaintFlowList';
import { PermissionGrid } from '@/components/PermissionGrid';

const REPORTS_DIR = '/tmp/safeskill-reports';

interface ReportPageProps {
  params: Promise<{ id: string }>;
}

async function loadReport(id: string): Promise<ScanResult | null> {
  // Sanitize: only allow alphanumeric IDs
  if (!/^[a-zA-Z0-9]+$/.test(id)) return null;

  try {
    const filePath = path.join(REPORTS_DIR, `${id}.json`);
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as ScanResult;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: ReportPageProps): Promise<Metadata> {
  const { id } = await params;
  const report = await loadReport(id);

  if (!report) {
    return {
      title: 'Report Not Found — SafeSkill',
      description: 'This report was not found or has expired.',
    };
  }

  const grade = getGrade(report.overallScore);
  const gradeLabel = GRADE_LABELS[grade];

  return {
    title: `SafeSkill Report: ${report.packageName} — ${report.overallScore}/100`,
    description: `Security grade: ${gradeLabel}. Code score ${report.codeScore}/100, content score ${report.contentScore}/100. ${report.codeFindings.length + report.promptFindings.length} findings detected.`,
    openGraph: {
      title: `SafeSkill Report: ${report.packageName} — ${report.overallScore}/100`,
      description: `Security grade: ${gradeLabel}. Code score ${report.codeScore}/100, content score ${report.contentScore}/100. ${report.codeFindings.length + report.promptFindings.length} findings detected.`,
      type: 'website',
      siteName: 'SafeSkill',
    },
    twitter: {
      card: 'summary',
      title: `SafeSkill Report: ${report.packageName} — ${report.overallScore}/100`,
      description: `Security grade: ${gradeLabel}. Code score ${report.codeScore}/100, content score ${report.contentScore}/100.`,
    },
  };
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { id } = await params;
  const report = await loadReport(id);

  if (!report) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Report not found or expired</h2>
          <p className="text-gray-400 text-sm">
            This report may have been removed or the link is invalid. Reports are stored temporarily.
          </p>
        </div>
      </div>
    );
  }

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
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{report.packageName}</h1>
            <p className="text-sm text-gray-500">
              {report.packageVersion ? `v${report.packageVersion} — ` : ''}Shared report
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Score cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6 flex flex-col items-center">
            <ScoreDisplay score={report.overallScore} label="Overall" size="lg" />
          </div>
          <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6 flex flex-col items-center">
            <ScoreDisplay score={report.codeScore} label="Code Safety" size="md" />
          </div>
          <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6 flex flex-col items-center">
            <ScoreDisplay score={report.contentScore} label="Content Safety" size="md" />
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-4 text-sm text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {report.filesScanned} code files scanned
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {report.contentFilesScanned} content files scanned
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {report.duration}ms scan time
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-500" />
            {report.dependencyCount} dependencies
          </span>
        </div>

        {/* Findings */}
        {(report.codeFindings.length > 0 || report.promptFindings.length > 0) && (
          <FindingsList
            codeFindings={report.codeFindings}
            promptFindings={report.promptFindings}
          />
        )}

        {/* Taint Flows */}
        {report.taintFlows.length > 0 && (
          <TaintFlowList flows={report.taintFlows} />
        )}

        {/* Permission Manifest */}
        <PermissionGrid permissions={report.permissions} />
      </div>
    </div>
  );
}
