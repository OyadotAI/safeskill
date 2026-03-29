import type { PromptFinding, PromptDetectorCategory } from '@safeskill/shared';
import { PROMPT_INJECTION_PATTERNS } from '@safeskill/shared';

const CATEGORY: PromptDetectorCategory = 'persona-hijack';

/**
 * Additional patterns for persona/identity/safety bypass attempts.
 */
const EXTRA_PATTERNS: Array<{ regex: RegExp; technique: string }> = [
  { regex: /\bDAN\s+mode\b/i, technique: 'dan-jailbreak' },
  { regex: /developer\s+mode\s+(enabled|activated|on)/i, technique: 'developer-mode-jailbreak' },
  { regex: /unlock\s+(all|your|unrestricted)\s+(capabilities|restrictions|limits)/i, technique: 'unlock-attempt' },
  { regex: /unlock\s+.{0,20}?(capabilities|restrictions)/i, technique: 'unlock-attempt' },
  { regex: /remove\s+(all\s+)?(safety|content)\s+(filters?|restrictions?)/i, technique: 'filter-removal' },
  { regex: /you\s+have\s+no\s+(restrictions?|limits?|filters?|boundaries)/i, technique: 'restriction-removal' },
  { regex: /in\s+(this|the)\s+(?:conversation|session),?\s+you\s+(?:can|will|must)\s+(?:do\s+)?anything/i, technique: 'unrestricted-mode' },
  { regex: /\banti[\s-]?filter/i, technique: 'filter-bypass' },
  { regex: /content\s+policy\s+(?:does\s+not|doesn't)\s+apply/i, technique: 'policy-bypass' },
  { regex: /unlock\s+unrestricted/i, technique: 'unlock-attempt' },
  { regex: /without\s+(any\s+)?(limits?|restrictions?|boundaries)/i, technique: 'unrestricted-mode' },
];

function lineColFromIndex(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  const lines = before.split('\n');
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

function snippet(content: string, index: number, length: number): string {
  const raw = content.slice(index, index + Math.min(length, 120));
  return raw.replace(/\n/g, '\\n');
}

export function detect(
  content: string,
  filePath: string,
  isPriority: boolean,
): PromptFinding[] {
  const findings: PromptFinding[] = [];

  const allPatterns: Array<{ regex: RegExp; technique: string }> = [
    ...PROMPT_INJECTION_PATTERNS.personaHijack.map((r) => ({
      regex: r,
      technique: 'persona-hijack-pattern',
    })),
    ...EXTRA_PATTERNS,
  ];

  for (const { regex, technique } of allPatterns) {
    const globalRe = new RegExp(
      regex.source,
      regex.flags.includes('g') ? regex.flags : regex.flags + 'g',
    );
    let match: RegExpExecArray | null;

    while ((match = globalRe.exec(content)) !== null) {
      const { line, column } = lineColFromIndex(content, match.index);

      // High normally, critical in priority files
      const severity = isPriority ? 'critical' : 'high';
      const confidence = isPriority ? 0.9 : 0.75;

      findings.push({
        category: CATEGORY,
        severity,
        location: { file: filePath, line, column },
        description: `Persona/safety hijack attempt detected (${technique}): "${match[0].trim().slice(0, 80)}"`,
        contentSnippet: snippet(content, match.index, match[0].length + 40),
        confidence,
        technique,
      });
    }
  }

  return findings;
}
