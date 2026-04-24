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

/**
 * Returns true if the character offset falls inside a fenced code block
 * (```lang ... ```). Markdown instructions that target an AI agent almost
 * always live inside a code fence; human-onboarding prose does not.
 */
function isInsideCodeFence(content: string, offset: number): boolean {
  let inFence = false;
  const re = /```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index >= offset) break;
    inFence = !inFence;
  }
  return inFence;
}

/**
 * Signals that the surrounding paragraph is AI-directed rather than human-
 * directed onboarding prose. "Run this", "execute the following", "tell the
 * agent" — yes. "Add it to your shell profile" — no.
 */
const AI_DIRECTED_SIGNALS = /\b(?:agent|assistant|llm|claude|chatgpt|ai|run\s+this|execute\s+(?:this|the\s+following)|ignore\s+(?:previous|prior|all)|you\s+(?:must|should|will)\s+(?:run|execute|send|write|fetch))\b/i;

function isMarkdownFile(filePath: string): boolean {
  return /\.(?:md|mdx|markdown)(?::\d+)?$/i.test(filePath);
}

export function detect(
  content: string,
  filePath: string,
  isPriority: boolean,
): PromptFinding[] {
  const findings: PromptFinding[] = [];
  const isMarkdown = isMarkdownFile(filePath);

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

      // In markdown prose, a sentence like "Add it to your shell profile
      // (~/.zshrc, ~/.bashrc) to persist across sessions" is user-facing
      // onboarding, not an agent instruction. Require the match to live
      // inside a code fence OR in a nearby window that is plausibly
      // AI-directed. `dotfile-modification` / system-write patterns
      // describing writes to /etc or ~/.ssh remain critical regardless
      // of markdown context — those are specific, exploitable actions.
      if (
        isMarkdown &&
        technique === 'tool-abuse-pattern' &&
        !isInsideCodeFence(content, match.index)
      ) {
        const windowStart = Math.max(0, match.index - 120);
        const windowEnd = Math.min(content.length, match.index + match[0].length + 120);
        const windowText = content.slice(windowStart, windowEnd);
        if (!AI_DIRECTED_SIGNALS.test(windowText)) {
          continue;
        }
      }

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
