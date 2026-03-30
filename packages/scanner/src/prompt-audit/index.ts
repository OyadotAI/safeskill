import type { ContentFile } from '../analyzers/content-scanner.js';
import type { PromptFinding, Severity } from '@safeskill/shared';
import { TEST_FIXTURE_CONFIDENCE_FACTOR } from '@safeskill/shared';

import { detect as detectInstructionOverride } from './detectors/instruction-override.js';
import { detect as detectHiddenText } from './detectors/hidden-text.js';
import { detect as detectDataExfiltration } from './detectors/data-exfiltration-prompt.js';
import { detect as detectToolAbuse } from './detectors/tool-abuse.js';
import { detect as detectPersonaHijack } from './detectors/persona-hijack.js';
import { detect as detectCotManipulation } from './detectors/cot-manipulation.js';
import { detect as detectDelimiterEscape } from './detectors/delimiter-escape.js';
import { detect as detectIndirectInjection } from './detectors/indirect-injection.js';

export interface PromptAuditResult {
  findings: PromptFinding[];
}

/**
 * All 8 prompt injection detectors.
 */
const DETECTORS: Array<(content: string, filePath: string, isPriority: boolean) => PromptFinding[]> = [
  detectInstructionOverride,
  detectHiddenText,
  detectDataExfiltration,
  detectToolAbuse,
  detectPersonaHijack,
  detectCotManipulation,
  detectDelimiterEscape,
  detectIndirectInjection,
];

/**
 * Severity downgrade map for test fixture findings.
 * critical → medium, high → low. Keeps them visible but non-dominant.
 */
const FIXTURE_SEVERITY_DOWNGRADE: Record<Severity, Severity> = {
  critical: 'medium',
  high: 'low',
  medium: 'low',
  low: 'info',
  info: 'info',
};

/**
 * Runs all prompt injection detectors on a single file.
 * Returns findings with severity bumps applied for priority files,
 * and confidence/severity reductions for test fixture files.
 */
function auditSingleFile(file: ContentFile): PromptFinding[] {
  const allFindings: PromptFinding[] = [];

  for (const detector of DETECTORS) {
    const findings = detector(file.content, file.relativePath, file.isPriority);
    allFindings.push(...findings);
  }

  // Apply test fixture reduction centrally — affects all 8 detectors uniformly
  if (file.isTestFixture) {
    for (const f of allFindings) {
      f.confidence *= TEST_FIXTURE_CONFIDENCE_FACTOR;
      f.severity = FIXTURE_SEVERITY_DOWNGRADE[f.severity];
      f.isTestFixture = true;
    }
  }

  return allFindings;
}

/**
 * De-duplicate findings that overlap on the same location and category.
 * Keep the higher-severity / higher-confidence one.
 */
function deduplicateFindings(findings: PromptFinding[]): PromptFinding[] {
  const severityRank: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    info: 0,
  };

  const seen = new Map<string, PromptFinding>();

  for (const f of findings) {
    // Key by file + line + category to avoid duplicate reports for the same spot
    const key = `${f.location.file}:${f.location.line}:${f.location.column}:${f.category}:${f.technique}`;
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, f);
    } else {
      // Keep the one with higher severity, or higher confidence if equal
      const existingRank = severityRank[existing.severity] ?? 0;
      const newRank = severityRank[f.severity] ?? 0;
      if (newRank > existingRank || (newRank === existingRank && f.confidence > existing.confidence)) {
        seen.set(key, f);
      }
    }
  }

  return [...seen.values()];
}

/**
 * Main entry point: runs all 8 prompt injection detectors on each file in parallel.
 * Priority files (skills.md, CLAUDE.md, etc.) get higher severity bumps.
 */
export async function detectPromptInjection(files: ContentFile[]): Promise<PromptAuditResult> {
  // Run all files in parallel — each file's detectors run synchronously (they're CPU-bound regex)
  const perFileResults = await Promise.all(
    files.map((file) =>
      // Wrap in a microtask so large file sets don't block the event loop in one tick
      Promise.resolve().then(() => auditSingleFile(file)),
    ),
  );

  // Flatten and deduplicate
  const allFindings = perFileResults.flat();
  const deduplicated = deduplicateFindings(allFindings);

  // Sort by severity (critical first) then by file path
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };

  deduplicated.sort((a, b) => {
    const sevDiff = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
    if (sevDiff !== 0) return sevDiff;
    return a.location.file.localeCompare(b.location.file);
  });

  return { findings: deduplicated };
}
