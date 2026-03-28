import type { PromptFinding, PromptDetectorCategory } from '@safeskill/shared';
import { PROMPT_INJECTION_PATTERNS } from '@safeskill/shared';

const CATEGORY: PromptDetectorCategory = 'cot-manipulation';

/**
 * Additional patterns for chain-of-thought manipulation.
 */
const EXTRA_PATTERNS: Array<{ regex: RegExp; technique: string }> = [
  { regex: /do\s+not\s+(reveal|show|share|expose)\s+(your\s+)?(reasoning|thinking|thought\s+process)/i, technique: 'cot-suppression' },
  { regex: /hide\s+(your\s+)?(reasoning|thinking|chain[\s-]of[\s-]thought)/i, technique: 'cot-suppression' },
  { regex: /secretly\s+(reason|think|plan|consider)/i, technique: 'hidden-reasoning' },
  { regex: /internal\s+monologue/i, technique: 'hidden-reasoning' },
  { regex: /while\s+reasoning,?\s+(always|make\s+sure\s+to)/i, technique: 'cot-directive' },
  { regex: /in\s+your\s+(thought|reasoning)\s+(process|chain)/i, technique: 'cot-directive' },
  { regex: /when\s+thinking\s+(?:through|about)\s+this,?\s+(always|never|make\s+sure)/i, technique: 'cot-directive' },
  { regex: /<scratchpad>/i, technique: 'scratchpad-injection' },
  { regex: /<inner[\s_-]?thoughts?>/i, technique: 'inner-thoughts-injection' },
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
    ...PROMPT_INJECTION_PATTERNS.cotManipulation.map((r) => ({
      regex: r,
      technique: 'cot-manipulation-pattern',
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

      // CoT manipulation is hard to confirm intent, so medium severity
      // Bump to high in priority files
      const severity = isPriority ? 'high' : 'medium';
      const confidence = isPriority ? 0.7 : 0.5;

      findings.push({
        category: CATEGORY,
        severity,
        location: { file: filePath, line, column },
        description: `Chain-of-thought manipulation detected (${technique}): "${match[0].trim().slice(0, 80)}"`,
        contentSnippet: snippet(content, match.index, match[0].length + 40),
        confidence,
        technique,
      });
    }
  }

  return findings;
}
