import type { PromptFinding, PromptDetectorCategory } from '@safeskill/shared';
import { PROMPT_INJECTION_PATTERNS } from '@safeskill/shared';

const CATEGORY: PromptDetectorCategory = 'tool-abuse';

/**
 * Additional patterns for detecting tool/shell abuse instructions.
 */
// Extra patterns — only match AI-directed instructions, not user documentation.
// "npm install X" in a README = normal. "Use the bash tool to run npm install" = tool abuse.
const EXTRA_PATTERNS: Array<{ regex: RegExp; technique: string }> = [
  // Sensitive location writes (these are dangerous regardless of context)
  { regex: /write\s+(to|into)\s+[~\/][^\s]+\.(bashrc|zshrc|profile|bash_profile|ssh)/i, technique: 'dotfile-modification' },
  { regex: /echo\s+.*?>>\s*~?\/?\.(?:bashrc|zshrc|profile|ssh\/)/i, technique: 'dotfile-modification' },
  { regex: /append\s+(to|into)\s+[~\/]?\.(bashrc|zshrc|profile|ssh)/i, technique: 'dotfile-modification' },
  // Sensitive directory writes
  { regex: /write\s+(to|into)\s+\/etc\//i, technique: 'system-write' },
  { regex: /write\s+(to|into)\s+~\/\.ssh/i, technique: 'ssh-write' },
  { regex: /write\s+(to|into)\s+~\/\.aws/i, technique: 'aws-config-write' },
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
    ...PROMPT_INJECTION_PATTERNS.toolAbuse.map((r) => ({
      regex: r,
      technique: 'tool-abuse-pattern',
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

      // Tool abuse is always critical
      const severity = 'critical' as const;
      const confidence = isPriority ? 0.95 : 0.8;

      findings.push({
        category: CATEGORY,
        severity,
        location: { file: filePath, line, column },
        description: `Tool/shell abuse instruction detected (${technique}): "${match[0].trim().slice(0, 80)}"`,
        contentSnippet: snippet(content, match.index, match[0].length + 40),
        confidence,
        technique,
      });
    }
  }

  return findings;
}
