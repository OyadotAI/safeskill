import type { PromptFinding, PromptDetectorCategory, Severity } from '@safeskill/shared';
import { PROMPT_INJECTION_PATTERNS, SENSITIVE_PATHS } from '@safeskill/shared';

const CATEGORY: PromptDetectorCategory = 'data-exfiltration-prompt';

/**
 * Extra patterns beyond the shared constants.
 */
const EXTRA_PATTERNS: Array<{ regex: RegExp; technique: string }> = [
  // Read-then-send composite pattern (must be imperative/instructional)
  {
    regex: /read\s+.{1,80}?\s+(?:and|then)\s+(?:send|post|upload|transmit|forward)\s+/i,
    technique: 'read-send-chain',
  },
  // Compress/encode before exfil
  { regex: /(?:compress|zip|tar|gzip|encode)\s+.{1,60}?\s+(?:and|then)\s+(?:send|upload|post)/i, technique: 'encode-exfil' },
  // Base64 wrapping in imperative context
  { regex: /base64\s+encode/i, technique: 'encoding-request' },
  // Direct credential mention + exfil action (must include a destination)
  { regex: /(?:send|post|upload|transmit|forward|exfiltrate)\s+(?:the\s+)?(?:api[_\s-]?key|token|password|secret|credential)s?\s+(?:to|via)\s+/i, technique: 'credential-exfil' },
  { regex: /(?:api[_\s-]?key|token|password|secret|credential)s?\s+.{0,20}?(?:send|post|upload|transmit|forward)\s+(?:to|via)\s+https?:\/\//i, technique: 'credential-exfil' },
];

/**
 * Regex patterns for sensitive file paths — only flag when combined with
 * an action verb (read, send, access, steal, etc.), not standalone mentions.
 */
function buildSensitivePathPatterns(): Array<{ regex: RegExp; technique: string }> {
  const patterns: Array<{ regex: RegExp; technique: string }> = [];
  // Only flag the most dangerous paths, and only with action context
  const dangerousPaths = ['~/.ssh', '~/.aws', '~/.gnupg', '~/.git-credentials'];
  for (const p of dangerousPaths) {
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Must be preceded by an action verb within 50 chars
    patterns.push({
      regex: new RegExp(`(?:read|access|steal|copy|send|upload|exfiltrate|include|cat|open)\\s+.{0,50}?${escaped}`, 'gi'),
      technique: 'sensitive-path-access',
    });
  }
  return patterns;
}

function lineColFromIndex(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  const lines = before.split('\n');
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

function snippetAt(content: string, index: number, length: number): string {
  const raw = content.slice(index, index + Math.min(length, 120));
  return raw.replace(/\n/g, '\\n');
}

/**
 * Check if a match is in a documentation/descriptive context (not an instruction).
 */
function isDocumentationContext(content: string, matchIndex: number): boolean {
  // Look at ~500 chars before and the line containing the match
  const before = content.slice(Math.max(0, matchIndex - 500), matchIndex).toLowerCase();
  const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
  const lineEnd = content.indexOf('\n', matchIndex);
  const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).toLowerCase();

  // Documentation section headers
  const docSections = [
    /##?\s*(?:setup|install|configuration|config|usage|getting\s*started|prerequisites|requirements)/,
    /##?\s*(?:environment|env|variables|tokens?|api\s*keys?|authentication|auth)/,
    /##?\s*(?:how\s*to|quick\s*start|tutorial|guide|steps?|example)/,
    /##?\s*(?:security|threat|risk|warning|caution|note|about)/,
    /##?\s*(?:features?|description|overview|what|tools?|capabilities)/,
    /##?\s*(?:changelog|changes|history|release)/,
  ];
  if (docSections.some(p => p.test(before))) return true;

  // Line is a markdown list item describing a tool/feature (common in awesome-lists)
  if (/^\s*[-*]\s*\[/.test(line)) return true;

  // Line contains a markdown link (likely a tool listing)
  if (/\[[^\]]+\]\([^)]+\)/.test(line)) return true;

  // Talking about security risks, warnings, or protection (not instructions to do it)
  const warningContext = [
    /(?:protect|prevent|guard|defend|mitigat|warn|risk|threat|vulnerab|attack|danger|avoid)\w*/,
    /(?:do\s+not|don'?t|never|should\s+not|must\s+not|be\s+careful)/,
    /(?:security\s+(?:policy|advisory|issue|concern|best\s+practice))/,
  ];
  if (warningContext.some(p => p.test(before.slice(-200)) || p.test(line))) return true;

  // The file itself is a security policy, changelog, or contributing guide
  const docFiles = ['security.md', 'changelog.md', 'changes.md', 'contributing.md', 'history.md', 'code_of_conduct.md'];
  const fileName = content.includes('SECURITY') ? 'security.md' : ''; // crude but effective
  // Better: check from filePath (handled in the detect function below)

  return false;
}

/**
 * Check if the file path is a documentation-only file.
 */
function isDocFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  const docNames = [
    'security.md', 'security.txt',
    'changelog.md', 'changelog',
    'changes.md', 'history.md',
    'contributing.md', 'contributors.md',
    'code_of_conduct.md',
    'license.md', 'license',
    'authors.md',
  ];
  return docNames.some(d => lower.endsWith(d));
}

export function detect(
  content: string,
  filePath: string,
  isPriority: boolean,
): PromptFinding[] {
  const findings: PromptFinding[] = [];

  // Skip security policy and changelog files entirely — they describe threats, not instruct them
  if (isDocFile(filePath)) return findings;

  // Build patterns — exclude overly broad ones from shared constants
  const sharedPatterns = PROMPT_INJECTION_PATTERNS.dataExfiltration
    .filter(r => {
      const src = r.source;
      // Drop the standalone "exfiltrate" pattern — too many false positives in docs
      if (src === 'exfiltrate') return false;
      return true;
    })
    .map((r) => ({ regex: r, technique: 'data-exfil-pattern' }));

  const allPatterns: Array<{ regex: RegExp; technique: string }> = [
    ...sharedPatterns,
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

      // Skip if in a documentation/descriptive context
      if (isDocumentationContext(content, match.index)) continue;

      // Determine severity based on confidence signals
      let severity: Severity = 'high';
      let confidence = isPriority ? 0.90 : 0.75;

      // Upgrade to critical only for high-confidence compound patterns
      if (technique === 'read-send-chain' || technique === 'credential-exfil' || technique === 'encode-exfil') {
        severity = 'critical';
        confidence = isPriority ? 0.95 : 0.85;
      }

      // If it's in a README (not a priority skill file), lower confidence
      if (filePath.toLowerCase().includes('readme')) {
        confidence *= 0.7;
        if (severity === 'critical') severity = 'high';
      }

      findings.push({
        category: CATEGORY,
        severity,
        location: { file: filePath, line, column },
        description: `Data exfiltration pattern detected (${technique}): "${match[0].trim().slice(0, 80)}"`,
        contentSnippet: snippetAt(content, match.index, match[0].length + 40),
        confidence,
        technique,
      });
    }
  }

  return findings;
}
