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
import { loadIgnoreRules, applyIgnoreRules } from './analyzers/ignore-file.js';
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
  /** Extra glob patterns to exclude from file discovery (in addition to
   *  the built-in defaults and anything declared in .safeskillignore). */
  excludePaths?: string[];
}

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const startTime = Date.now();
  const { dir, packageName = 'unknown', packageVersion = null } = options;

  // Load .safeskillignore up front so file-level excludes apply to discovery,
  // not just to post-scan filtering.
  const ignoreRules = await loadIgnoreRules(dir);
  const extraIgnores = [
    ...(options.excludePaths ?? []),
    ...(ignoreRules?.fileGlobs ?? []),
  ];

  // === LAYER 1: Fast Pass (parallel) ===
  const [patternResults, manifestResults, depResults, contentFiles] = await Promise.all([
    analyzePatterns(dir, extraIgnores),
    analyzeManifest(dir),
    options.skipDeps ? Promise.resolve({ findings: [], dependencyCount: 0 }) : analyzeDependencies(dir),
    discoverContent(dir, extraIgnores),
  ]);

  // === LAYER 2 + 2B: Deep Analysis (parallel) ===
  const [astResults, promptResults] = await Promise.all([
    analyzeAST(dir, patternResults.flaggedFiles, extraIgnores),
    detectPromptInjection(contentFiles),
  ]);

  // === Combine code findings from all layers ===
  let codeFindings: CodeFinding[] = [
    ...patternResults.findings,
    ...manifestResults.findings,
    ...depResults.findings,
    ...astResults.findings,
  ];

  // === LAYER 2 continued: Taint tracking on AST results ===
  let taintFlows: TaintFlow[] = trackTaint(astResults.fileAnalyses);

  let promptFindings: PromptFinding[] = promptResults.findings;

  // === Apply .safeskillignore rules (if present) ===
  if (ignoreRules) {
    const filtered = applyIgnoreRules(codeFindings, promptFindings, taintFlows, ignoreRules);
    codeFindings = filtered.codeFindings;
    promptFindings = filtered.promptFindings;
    taintFlows = filtered.taintFlows;
  }

  // === LAYER 3: Cross-file intelligence ===
  const mismatches: MismatchFinding[] = correlateCodeContent(
    codeFindings,
    promptFindings,
    contentFiles,
  );

  // === Infer permissions ===
  const permissions: PermissionManifest = inferPermissions(
    codeFindings,
    promptFindings,
    taintFlows,
    mismatches,
  );

  // If the AST layer couldn't read any source files, surface that loudly as a
  // finding so consumers see why the score is capped instead of wondering why
  // a package with no findings got a "caution" grade.
  if (astResults.filesScanned === 0) {
    codeFindings.push({
      category: 'obfuscation',
      severity: 'medium',
      location: { file: 'package.json', line: 0, column: 0 },
      description:
        'Inconclusive: scanner found no analysable source files. The published artifact may ship only compiled bundles, non-JS code, or documentation. Score capped accordingly.',
      codeSnippet: '',
      confidence: 1.0,
    });
  }

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
      filesScanned: astResults.filesScanned,
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
    packageType: manifestResults.packageType,
  };
}

export { type ScanResult } from '@safeskill/shared';
