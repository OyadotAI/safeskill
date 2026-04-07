import type { PromptFinding, PromptDetectorCategory } from '@safeskill/shared';
import { PROMPT_INJECTION_PATTERNS } from '@safeskill/shared';

const CATEGORY: PromptDetectorCategory = 'instruction-override';

/**
 * Additional patterns beyond what PROMPT_INJECTION_PATTERNS provides.
 */
const EXTRA_PATTERNS: Array<{ regex: RegExp; technique: string }> = [
  { regex: /new\s+system\s+prompt/i, technique: 'instruction-pattern' },
  { regex: /updated\s+instructions?\b/i, technique: 'instruction-pattern' },
  { regex: /role\s+reassignment/i, technique: 'role-reassignment' },
  { regex: /\bact\s+as\s+(my|a|the)\s+/i, technique: 'role-reassignment' },
  { regex: /switch\s+(to|into)\s+(a\s+)?new\s+(role|mode|persona)/i, technique: 'role-reassignment' },
  { regex: /replace\s+(your|the)\s+(current\s+)?(instructions?|prompt|directives?)/i, technique: 'instruction-pattern' },
  { regex: /(?:^|\n)\s*SYSTEM\s*:/m, technique: 'system-marker' },
];

/**
 * Section headers that reduce suspicion when instruction-like patterns appear
 * inside them (e.g. a README discussing security topics).
 */
const BENIGN_SECTION_RE =
  /^#{1,4}\s+(security\s+notes?|known\s+issues?|troubleshooting|caveats?|limitations?|disclaimer|api|usage|options?|configuration|methods?|class|interface|examples?|features?|getting\s+started|install|setup)/im;

/**
 * Check if match is in a code block (``` fenced) — code documentation is not prompt injection.
 */
function isInsideCodeBlock(content: string, matchIndex: number): boolean {
  const before = content.slice(0, matchIndex);
  const fenceCount = (before.match(/```/g) || []).length;
  return fenceCount % 2 === 1; // odd = inside a code block
}

/**
 * Check if surrounding context is technical documentation (method descriptions, API docs).
 */
function isInTechnicalContext(content: string, matchIndex: number): boolean {
  const nearby = content.slice(Math.max(0, matchIndex - 200), matchIndex + 100).toLowerCase();
  const techIndicators = [
    /\bfunction\b/, /\bmethod\b/, /\bclass\b/, /\bparam(?:eter)?\b/, /\breturn(?:s)?\b/,
    /\bdefault\b/, /\bcallback\b/, /\bcustomis[ez]\b/, /\bconfigur/,
    /\bapi\b/, /\boption(?:s|al)?\b/, /\bproperty/, /\b@param\b/, /\b@returns?\b/,
    /\bsubcommand/, /\bflag\b/, /\bargument\b/,
  ];
  return techIndicators.filter(p => p.test(nearby)).length >= 2;
}

/**
 * Check if a "SYSTEM:" match is mid-sentence (i.e. preceded by non-trivial text
 * on the same line).  Real prompt injection places "SYSTEM:" at the start of a
 * line; mid-sentence occurrences like "error type for the entire system:" are
 * always documentation prose.
 */
function isMidSentenceSystemMarker(content: string, matchIndex: number): boolean {
  const lineStart = content.lastIndexOf('\n', matchIndex - 1) + 1;
  const textBefore = content.slice(lineStart, matchIndex).trim();
  return textBefore.length > 0;
}

function isInsideBenignSection(content: string, matchIndex: number): boolean {
  if (isInsideCodeBlock(content, matchIndex)) return true;
  if (isInTechnicalContext(content, matchIndex)) return true;

  const before = content.slice(0, matchIndex);
  const headings = [...before.matchAll(/^#{1,4}\s+.+$/gm)];
  if (headings.length === 0) return false;
  const lastHeading = headings[headings.length - 1]![0];
  return BENIGN_SECTION_RE.test(lastHeading);
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

export function detect(
  content: string,
  filePath: string,
  isPriority: boolean,
): PromptFinding[] {
  const findings: PromptFinding[] = [];

  // Build a combined list of patterns to check
  const allPatterns: Array<{ regex: RegExp; technique: string }> = [
    ...PROMPT_INJECTION_PATTERNS.instructionOverride.map((r) => ({
      regex: r,
      technique: 'instruction-pattern',
    })),
    ...EXTRA_PATTERNS,
  ];

  for (const { regex, technique } of allPatterns) {
    // Create a global copy so we can use exec() iteratively
    const globalRe = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    let match: RegExpExecArray | null;

    while ((match = globalRe.exec(content)) !== null) {
      // Skip "system:" that appears mid-sentence — it's documentation prose,
      // not a prompt injection marker (e.g. "error type for the entire system:")
      if (technique === 'instruction-pattern' && /\bSYSTEM\s*:/i.test(match[0]) && isMidSentenceSystemMarker(content, match.index)) {
        continue;
      }

      const { line, column } = lineColFromIndex(content, match.index);
      const benign = isInsideBenignSection(content, match.index);

      // In benign sections, lower both severity and confidence
      const severity = benign ? 'medium' : isPriority ? 'critical' : 'high';
      const confidence = benign ? 0.3 : isPriority ? 0.9 : 0.7;

      findings.push({
        category: CATEGORY,
        severity,
        location: { file: filePath, line, column },
        description: `Detected instruction-override attempt: "${match[0].trim()}"`,
        contentSnippet: snippet(content, match.index, match[0].length + 40),
        confidence,
        technique,
      });
    }
  }

  return findings;
}
