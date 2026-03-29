import type { ScanResult, PermissionManifest, CodeFinding, PromptFinding, TaintFlow, MismatchFinding, ScoreBreakdown } from '@safeskill/shared';
import { analyzePatterns } from './analyzers/pattern-matcher.js';
import { analyzeManifest } from './analyzers/manifest-analyzer.js';
import { analyzeDependencies } from './analyzers/dependency-analyzer.js';
import { discoverContent } from './analyzers/content-scanner.js';
import { analyzeAST } from './analyzers/ast-analyzer.js';
import { detectPromptInjection } from './prompt-audit/index.js';
import { trackTaint } from './analyzers/taint-tracker.js';
import { correlateCodeContent } from './analyzers/correlation.js';
import { calculateScore } from './scoring/calculator.js';
import { inferPermissions } from './analyzers/permission-inferrer.js';
import { nanoid } from './utils.js';

export interface ScanOptions {
  /** Directory path to scan */
  dir: string;
  /** Package name (for display) */
  packageName?: string;
  /** Package version */
  packageVersion?: string;
  /** Skip dependency analysis (faster) */
  skipDeps?: boolean;
}

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const startTime = Date.now();
  const { dir, packageName = 'unknown', packageVersion = null } = options;

  // === LAYER 1: Fast Pass (parallel) ===
  const [patternResults, manifestResults, depResults, contentFiles] = await Promise.all([
    analyzePatterns(dir),
    analyzeManifest(dir),
    options.skipDeps ? Promise.resolve({ findings: [], dependencyCount: 0 }) : analyzeDependencies(dir),
    discoverContent(dir),
  ]);

  // === LAYER 2 + 2B: Deep Analysis (parallel) ===
  const [astResults, promptResults] = await Promise.all([
    analyzeAST(dir, patternResults.flaggedFiles),
    detectPromptInjection(contentFiles),
  ]);

  // === Combine code findings from all layers ===
  const codeFindings: CodeFinding[] = [
    ...patternResults.findings,
    ...manifestResults.findings,
    ...depResults.findings,
    ...astResults.findings,
  ];

  // === LAYER 2 continued: Taint tracking on AST results ===
  const taintFlows: TaintFlow[] = trackTaint(astResults.fileAnalyses);

  // === LAYER 3: Cross-file intelligence ===
  const mismatches: MismatchFinding[] = correlateCodeContent(
    codeFindings,
    promptResults.findings,
    contentFiles,
  );

  const promptFindings: PromptFinding[] = promptResults.findings;

  // === Infer permissions ===
  const permissions: PermissionManifest = inferPermissions(
    codeFindings,
    promptFindings,
    taintFlows,
    mismatches,
  );

  // === Calculate unified score ===
  const { overallScore, codeScore, contentScore, breakdown } = calculateScore(
    codeFindings,
    promptFindings,
    taintFlows,
    mismatches,
    {
      dependencyCount: depResults.dependencyCount,
      hasInstallScripts: manifestResults.hasInstallScripts,
      hasManifest: manifestResults.hasSkillManifest,
      hasReadme: manifestResults.hasReadme,
      hasRepository: manifestResults.hasRepository,
      hasTypes: manifestResults.hasTypes,
      packageType: manifestResults.packageType,
    },
  );

  return {
    packageName,
    packageVersion,
    scanId: nanoid(),
    timestamp: Date.now(),
    duration: Date.now() - startTime,
    overallScore,
    codeScore,
    contentScore,
    scoreBreakdown: breakdown,
    codeFindings,
    promptFindings,
    taintFlows,
    mismatches,
    permissions,
    filesScanned: astResults.filesScanned,
    contentFilesScanned: contentFiles.length,
    dependencyCount: depResults.dependencyCount,
    hasInstallScripts: manifestResults.hasInstallScripts,
  };
}

export { type ScanResult } from '@safeskill/shared';
