import type { PromptFinding, PromptDetectorCategory } from '@safeskill/shared';
import { PROMPT_INJECTION_PATTERNS } from '@safeskill/shared';

const CATEGORY: PromptDetectorCategory = 'delimiter-escape';

/**
 * Additional patterns for context boundary / delimiter escape attacks.
 */
const EXTRA_PATTERNS: Array<{ regex: RegExp; technique: string }> = [
  // Token boundary markers from various models
  { regex: /<\|im_start\|>/gi, technique: 'token-boundary' },
  { regex: /<\|system\|>/gi, technique: 'token-boundary' },
  { regex: /<\|user\|>/gi, technique: 'token-boundary' },
  { regex: /<\|assistant\|>/gi, technique: 'token-boundary' },
  // YAML document separators used as injection vectors
  { regex: /^---\s*\n\s*role\s*:\s*(system|assistant)/m, technique: 'yaml-role-injection' },
  // Fake conversation turn markers
  { regex: /\n\s*Human\s*:\s*/g, technique: 'fake-turn-marker' },
  { regex: /\n\s*Assistant\s*:\s*/g, technique: 'fake-turn-marker' },
  { regex: /\n\s*User\s*:\s*/g, technique: 'fake-turn-marker' },
  // XML-style tags that mimic system boundaries
  { regex: /<\/?(?:message|turn|context|prompt)\s*>/gi, technique: 'fake-xml-boundary' },
  // ChatML-style markers
  { regex: /\[(?:SYSTEM|USER|ASSISTANT)\]/gi, technique: 'chatml-marker' },
  // Anthropic-style markers
  { regex: /\\n\\nHuman:\s/g, technique: 'anthropic-turn-marker' },
  { regex: /\\n\\nAssistant:\s/g, technique: 'anthropic-turn-marker' },
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
    ...PROMPT_INJECTION_PATTERNS.delimiterEscape.map((r) => ({
      regex: r,
      technique: 'delimiter-escape-pattern',
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

      // Delimiter escapes are clearly intentional manipulation
      const severity = isPriority ? 'critical' : 'high';
      const confidence = isPriority ? 0.92 : 0.8;

      findings.push({
        category: CATEGORY,
        severity,
        location: { file: filePath, line, column },
        description: `Context boundary escape detected (${technique}): "${match[0].trim().slice(0, 80)}"`,
        contentSnippet: snippet(content, match.index, match[0].length + 40),
        confidence,
        technique,
      });
    }
  }

  return findings;
}
