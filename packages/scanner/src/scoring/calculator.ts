import type {
  CodeFinding,
  PromptFinding,
  TaintFlow,
  MismatchFinding,
  ScoreBreakdown,
  Severity,
} from '@safeskill/shared';
import {
  SCORE_WEIGHTS,
  SEVERITY_MULTIPLIER,
  CRITICAL_PROMPT_INJECTION_CAP,
  CRITICAL_DEPENDENCY_CAP,
} from '@safeskill/shared';
import type { PackageType } from '../analyzers/manifest-analyzer.js';

export interface ScoreInput {
  dependencyCount: number;
  hasInstallScripts: boolean;
  hasManifest: boolean;
  hasReadme: boolean;
  hasRepository: boolean;
  hasTypes: boolean;
  packageType: PackageType;
  /** How many source files the AST layer actually analysed. When 0 the
   *  code scan produced no signal; we cannot claim the package is safe. */
  filesScanned: number;
}

// When we fail to scan any source files (published tarball ships nothing
// scannable, unreadable tree, etc.), this is the highest we're willing to
// report. The grade maps to "caution" — the report surfaces the reason
// instead of misleading consumers with a high green score.
const INCONCLUSIVE_CODE_SCAN_CAP = 50;

/**
 * Categories of findings that are EXPECTED for CLI tools.
 * These should not penalize the score when the package is a CLI.
 */
const CLI_EXPECTED_CATEGORIES = new Set([
  'process-spawn',
  'filesystem-access',
  'env-access',
]);

/**
 * Categories of findings that are EXPECTED for MCP servers.
 * MCP servers legitimately use filesystem, network, process, and env access
 * as part of their core tool functionality — penalizing these is wrong.
 */
const MCP_EXPECTED_CATEGORIES = new Set([
  'process-spawn',
  'filesystem-access',
  'env-access',
  'network-access',
]);

export interface ScoreOutput {
  overallScore: number;
  codeScore: number;
  contentScore: number;
  breakdown: ScoreBreakdown;
}

/**
 * Calculates the unified safety score (0-100) from all findings.
 *
 * Scoring approach: start at max points per category, deduct based on findings.
 * Each category has a weight (must sum to 100).
 */
export function calculateScore(
  codeFindings: CodeFinding[],
  promptFindings: PromptFinding[],
  taintFlows: TaintFlow[],
  mismatches: MismatchFinding[],
  meta: ScoreInput,
): ScoreOutput {
  // For CLI tools and MCP servers, filter out expected findings from scoring.
  // CLI tools NEED child_process, fs, and env access.
  // MCP servers additionally NEED network access as core tool functionality.
  const isCli = meta.packageType === 'cli-tool';
  const isMcp = meta.packageType === 'mcp-server';
  const isToolPackage = isCli || isMcp;
  const expectedCategories = isMcp ? MCP_EXPECTED_CATEGORIES : CLI_EXPECTED_CATEGORIES;
  const contextFindings = isToolPackage
    ? codeFindings.filter(f => !expectedCategories.has(f.category))
    : codeFindings;

  // Reduce taint flow noise for tool packages (CLI/MCP servers).
  // These packages legitimately read files, env vars, and make network requests.
  const contextTaintFlows = isToolPackage
    ? taintFlows.filter(f => {
        // Tool reading its own config dir is not exfiltration
        const isOwnConfig = f.source.description.includes('readFile') &&
          !f.source.description.includes('.ssh') &&
          !f.source.description.includes('.aws') &&
          !f.source.description.includes('.gnupg');
        if (isOwnConfig) return false;

        // For tool packages, reading env vars and sending network requests is the
        // SECURE pattern (e.g. reading OPENAI_API_KEY from env to call an API).
        // Only flag env flows if they access truly sensitive non-API-key vars
        // like SSH keys or bulk access.
        const isEnvToNetwork = f.source.type === 'process.env' &&
          !f.source.description.includes('Bulk') &&
          (f.sink.type.startsWith('fetch') ||
           f.sink.type.startsWith('http') ||
           f.sink.type.startsWith('https') ||
           f.sink.type.startsWith('axios') ||
           f.sink.type.startsWith('got') ||
           f.sink.type.startsWith('request'));
        if (isEnvToNetwork) return false;

        return true;
      })
    : taintFlows;

  // Calculate each category score (0 = max weight, deductions reduce it)
  const dataFlowRisks = scoreDataFlows(contextTaintFlows, SCORE_WEIGHTS.dataFlowRisks);
  const promptInjectionRisks = scorePromptFindings(promptFindings, SCORE_WEIGHTS.promptInjectionRisks);
  const dangerousApis = scoreDangerousApis(contextFindings, SCORE_WEIGHTS.dangerousApis);
  const descriptionMismatch = scoreMismatches(mismatches, SCORE_WEIGHTS.descriptionMismatch);
  const networkBehavior = scoreNetwork(contextFindings, SCORE_WEIGHTS.networkBehavior);
  const dependencyHealth = scoreDependencies(codeFindings, meta, SCORE_WEIGHTS.dependencyHealth);
  const transparency = scoreTransparency(meta, SCORE_WEIGHTS.transparency);
  const codeQuality = scoreCodeQuality(contextFindings, SCORE_WEIGHTS.codeQuality);

  const breakdown: ScoreBreakdown = {
    dataFlowRisks,
    promptInjectionRisks,
    dangerousApis,
    descriptionMismatch,
    networkBehavior,
    dependencyHealth,
    transparency,
    codeQuality,
  };

  // Sum all category scores
  let overallScore = Math.round(
    dataFlowRisks +
    promptInjectionRisks +
    dangerousApis +
    descriptionMismatch +
    networkBehavior +
    dependencyHealth +
    transparency +
    codeQuality
  );

  // Aggressive capping for critical findings.
  // Prompt injection caps apply regardless of package type — no tool should inject.
  // Taint flow caps are relaxed for CLI tools (they legitimately read files + make requests).
  // Test fixture findings are excluded from caps — they model threats, they don't pose them.
  const criticalPrompts = promptFindings.filter(f => f.severity === 'critical' && f.confidence >= 0.8 && !f.isTestFixture);
  const criticalTaints = contextTaintFlows.filter(f => f.severity === 'critical');

  if (criticalPrompts.length >= 2) {
    overallScore = Math.min(overallScore, CRITICAL_PROMPT_INJECTION_CAP);
  } else if (criticalPrompts.length === 1) {
    overallScore = Math.min(overallScore, 60);
  }

  // Taint flow caps — only apply to non-tool packages.
  // CLI tools and MCP servers reading config and making HTTP requests is normal.
  if (!isToolPackage && criticalTaints.length >= 1) {
    overallScore = Math.min(overallScore, 50);
  }

  // Combined: critical prompt + critical taint = absolute blocked (any package type)
  if (criticalPrompts.length >= 1 && criticalTaints.length >= 1) {
    overallScore = Math.min(overallScore, 20);
  }

  // Dependency vulnerability caps — critical/high npm audit findings
  const criticalDeps = codeFindings.filter(f =>
    f.category === 'dynamic-require' &&
    f.description.includes('vulnerability') &&
    (f.severity === 'critical' || f.severity === 'high')
  );
  if (criticalDeps.length >= 1) {
    overallScore = Math.min(overallScore, CRITICAL_DEPENDENCY_CAP);
  }

  // npm security holding packages — known-malicious, taken down by npm
  const securityHolder = codeFindings.some(f =>
    f.description.includes('removed by npm for security reasons')
  );
  if (securityHolder) {
    overallScore = Math.min(overallScore, 10);
  }

  // If no source files were scannable we cannot vouch for the package. Cap
  // the score instead of letting "no findings" promote it to Verified Safe.
  if (meta.filesScanned === 0) {
    overallScore = Math.min(overallScore, INCONCLUSIVE_CODE_SCAN_CAP);
  }

  overallScore = clamp(overallScore, 0, 100);

  // Calculate sub-scores
  let codeScore = clamp(Math.round(
    (dangerousApis / SCORE_WEIGHTS.dangerousApis) * 25 +
    (dataFlowRisks / SCORE_WEIGHTS.dataFlowRisks) * 25 +
    (networkBehavior / SCORE_WEIGHTS.networkBehavior) * 20 +
    (dependencyHealth / SCORE_WEIGHTS.dependencyHealth) * 15 +
    (codeQuality / SCORE_WEIGHTS.codeQuality) * 15
  ), 0, 100);
  if (meta.filesScanned === 0) {
    codeScore = Math.min(codeScore, INCONCLUSIVE_CODE_SCAN_CAP);
  }

  const contentScore = clamp(Math.round(
    (promptInjectionRisks / SCORE_WEIGHTS.promptInjectionRisks) * 50 +
    (descriptionMismatch / SCORE_WEIGHTS.descriptionMismatch) * 30 +
    (transparency / SCORE_WEIGHTS.transparency) * 20
  ), 0, 100);

  return { overallScore, codeScore, contentScore, breakdown };
}

// --- Category scorers ---
// All use diminishing returns: each additional finding has less impact.
// Formula: deduction = rate * severity * (1 / (1 + findingIndex * 0.5))
// This means: 1st finding = full weight, 2nd = 67%, 3rd = 50%, etc.

function diminish(baseRate: number, index: number): number {
  return baseRate / (1 + index * 0.5);
}

function scoreDataFlows(flows: TaintFlow[], maxPoints: number): number {
  if (flows.length === 0) return maxPoints;

  let deduction = 0;
  // Deduplicate: only count unique source→sink type pairs
  const seen = new Set<string>();
  let i = 0;
  for (const flow of flows) {
    const key = `${flow.source.type}→${flow.sink.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mult = SEVERITY_MULTIPLIER[flow.severity];
    deduction += maxPoints * diminish(0.3, i) * mult;
    i++;
  }

  return Math.max(0, maxPoints - deduction);
}

function scorePromptFindings(findings: PromptFinding[], maxPoints: number): number {
  if (findings.length === 0) return maxPoints;

  let deduction = 0;
  // Deduplicate by category (don't penalize 5 instruction-overrides 5x)
  const seen = new Set<string>();
  let i = 0;
  for (const finding of findings) {
    const key = `${finding.category}:${finding.location.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mult = SEVERITY_MULTIPLIER[finding.severity];
    deduction += maxPoints * diminish(0.2, i) * mult * finding.confidence;
    i++;
  }

  return Math.max(0, maxPoints - deduction);
}

function scoreDangerousApis(findings: CodeFinding[], maxPoints: number): number {
  const dangerous = findings.filter(f =>
    f.category === 'process-spawn' ||
    f.category === 'install-scripts' ||
    f.category === 'obfuscation'
  );

  if (dangerous.length === 0) return maxPoints;

  let deduction = 0;
  // Deduplicate by category per file
  const seen = new Set<string>();
  let i = 0;
  for (const finding of dangerous) {
    const key = `${finding.category}:${finding.location.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mult = SEVERITY_MULTIPLIER[finding.severity];
    deduction += maxPoints * diminish(0.2, i) * mult * finding.confidence;
    i++;
  }

  return Math.max(0, maxPoints - deduction);
}

function scoreMismatches(mismatches: MismatchFinding[], maxPoints: number): number {
  if (mismatches.length === 0) return maxPoints;

  // Deduplicate: one claim type should only count once
  const seen = new Set<string>();
  let deduction = 0;
  let i = 0;
  for (const m of mismatches) {
    const key = m.description;
    if (seen.has(key)) continue;
    seen.add(key);
    const mult = SEVERITY_MULTIPLIER[m.severity];
    deduction += maxPoints * diminish(0.25, i) * mult;
    i++;
  }

  return Math.max(0, maxPoints - deduction);
}

function scoreNetwork(findings: CodeFinding[], maxPoints: number): number {
  const networkFindings = findings.filter(f => f.category === 'network-access');
  if (networkFindings.length === 0) return maxPoints;

  let deduction = 0;
  const seen = new Set<string>();
  let i = 0;
  for (const finding of networkFindings) {
    const key = `${finding.description}:${finding.location.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mult = SEVERITY_MULTIPLIER[finding.severity];
    deduction += maxPoints * diminish(0.15, i) * mult * finding.confidence;
    i++;
  }

  return Math.max(0, maxPoints - deduction);
}

function scoreDependencies(findings: CodeFinding[], meta: ScoreInput, maxPoints: number): number {
  let score = maxPoints;

  // Deduct for dependency-related findings (vulns, typosquatting)
  const depFindings = findings.filter(f =>
    f.category === 'dynamic-require' && f.description.includes('dependency')
  );
  let i = 0;
  for (const finding of depFindings) {
    score -= maxPoints * diminish(0.15, i) * SEVERITY_MULTIPLIER[finding.severity];
    i++;
  }

  // Deduct for high dep count (mild)
  if (meta.dependencyCount > 100) {
    score -= maxPoints * 0.2;
  } else if (meta.dependencyCount > 50) {
    score -= maxPoints * 0.1;
  }

  // Deduct for install scripts (mild — many legit packages have them)
  if (meta.hasInstallScripts) {
    score -= maxPoints * 0.15;
  }

  return Math.max(0, score);
}

function scoreTransparency(meta: ScoreInput, maxPoints: number): number {
  let score = 0;
  const perItem = maxPoints / 5;

  if (meta.hasManifest) score += perItem; // safeskill.manifest.json
  if (meta.hasReadme) score += perItem;
  if (meta.hasRepository) score += perItem;
  if (meta.hasTypes) score += perItem;
  // 5th point: having all of the above (completeness bonus)
  if (meta.hasManifest && meta.hasReadme && meta.hasRepository && meta.hasTypes) {
    score += perItem;
  }

  return Math.min(maxPoints, score);
}

function scoreCodeQuality(findings: CodeFinding[], maxPoints: number): number {
  const qualityFindings = findings.filter(f =>
    f.category === 'obfuscation' || f.category === 'dynamic-require'
  );

  if (qualityFindings.length === 0) return maxPoints;

  let deduction = 0;
  for (const finding of qualityFindings) {
    deduction += maxPoints * 0.25 * SEVERITY_MULTIPLIER[finding.severity];
  }

  return Math.max(0, maxPoints - deduction);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
