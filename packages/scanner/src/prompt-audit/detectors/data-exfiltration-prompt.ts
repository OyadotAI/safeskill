import type { PromptFinding, PromptDetectorCategory } from '@safeskill/shared';
import { PROMPT_INJECTION_PATTERNS, SENSITIVE_PATHS } from '@safeskill/shared';

const CATEGORY: PromptDetectorCategory = 'data-exfiltration-prompt';

/**
 * Extra patterns beyond the shared constants.
 */
const EXTRA_PATTERNS: Array<{ regex: RegExp; technique: string }> = [
  // Read-then-send composite pattern
  {
    regex: /read\s+.{1,80}?\s+(?:and|then)\s+(?:send|post|upload|transmit|forward)\s+/i,
    technique: 'read-send-chain',
  },
  // Compress/encode before exfil
  { regex: /(?:compress|zip|tar|gzip|encode)\s+.{1,60}?\s+(?:and|then)\s+(?:send|upload|post)/i, technique: 'encode-exfil' },
  // Base64 wrapping
  { regex: /base64\s+encode/i, technique: 'encoding-request' },
  { regex: /btoa\s*\(/i, technique: 'encoding-request' },
  // Direct credential mention + exfil action (must include a destination like URL/server/endpoint)
  { regex: /(?:send|post|upload|transmit|forward|exfiltrate)\s+(?:the\s+)?(?:api[_\s-]?key|token|password|secret|credential)s?\s+(?:to|via)\s+/i, technique: 'credential-exfil' },
  { regex: /(?:api[_\s-]?key|token|password|secret|credential)s?\s+.{0,20}?(?:send|post|upload|transmit|forward)\s+(?:to|via)\s+https?:\/\//i, technique: 'credential-exfil' },
];

/**
 * Regex patterns that detect references to sensitive file paths.
 */
function buildSensitivePathPatterns(): Array<{ regex: RegExp; technique: string }> {
  const patterns: Array<{ regex: RegExp; technique: string }> = [];
  for (const p of SENSITIVE_PATHS) {
    // Escape the path for regex use
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    patterns.push({
      regex: new RegExp(escaped, 'g'),
      technique: 'sensitive-path-ref',
    });
  }
  return patterns;
}

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
 * Check if a match is inside a benign documentation context (setup, config, usage instructions).
 */
function isInBenignContext(content: string, matchIndex: number): boolean {
  // Look at the ~500 chars before the match for section headers
  const before = content.slice(Math.max(0, matchIndex - 500), matchIndex).toLowerCase();

  const benignSections = [
    /##?\s*(?:setup|install|configuration|config|usage|getting\s*started|prerequisites|requirements)/,
    /##?\s*(?:environment|env|variables|tokens?|api\s*keys?|authentication|auth)/,
    /##?\s*(?:how\s*to|quick\s*start|tutorial|guide|step)/,
    /create\s+(?:a\s+)?(?:personal\s+)?(?:access\s+)?token/,
    /generate\s+(?:a\s+)?(?:new\s+)?(?:api\s+)?key/,
    /you(?:'ll)?\s+need\s+(?:a\s+)?token/,
  ];

  return benignSections.some(p => p.test(before));
}

export function detect(
  content: string,
  filePath: string,
  isPriority: boolean,
): PromptFinding[] {
  const findings: PromptFinding[] = [];

  // Combine shared patterns + extra patterns + sensitive path patterns
  const allPatterns: Array<{ regex: RegExp; technique: string }> = [
    ...PROMPT_INJECTION_PATTERNS.dataExfiltration.map((r) => ({
      regex: r,
      technique: 'data-exfil-pattern',
    })),
    ...EXTRA_PATTERNS,
    ...buildSensitivePathPatterns(),
  ];

  for (const { regex, technique } of allPatterns) {
    const globalRe = new RegExp(
      regex.source,
      regex.flags.includes('g') ? regex.flags : regex.flags + 'g',
    );
    let match: RegExpExecArray | null;

    while ((match = globalRe.exec(content)) !== null) {
      const { line, column } = lineColFromIndex(content, match.index);

      // Skip matches in setup/installation/configuration sections — normal docs
      if (isInBenignContext(content, match.index)) continue;

      // Data exfiltration is always critical
      const severity = 'critical' as const;
      const confidence = isPriority ? 0.95 : 0.85;

      findings.push({
        category: CATEGORY,
        severity,
        location: { file: filePath, line, column },
        description: `Data exfiltration pattern detected (${technique}): "${match[0].trim().slice(0, 80)}"`,
        contentSnippet: snippet(content, match.index, match[0].length + 40),
        confidence,
        technique,
      });
    }
  }

  return findings;
}
