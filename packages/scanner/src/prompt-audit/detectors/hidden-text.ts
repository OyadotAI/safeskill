import type { PromptFinding, PromptDetectorCategory } from '@safeskill/shared';
import { PROMPT_INJECTION_PATTERNS } from '@safeskill/shared';

const CATEGORY: PromptDetectorCategory = 'hidden-text';

/**
 * Zero-width and invisible character ranges.
 */
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF\u2060\u2061\u2062\u2063\u2064]+/g;

/**
 * Bidirectional override characters.
 */
const BIDI_RE = /[\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069]+/g;

/**
 * HTML comments in markdown.
 */
const HTML_COMMENT_RE = /<!--([\s\S]*?)-->/g;

/**
 * Null bytes.
 */
const NULL_BYTE_RE = /\x00+/g;

/**
 * Instruction-like patterns that, when found inside hidden text, massively
 * increase severity.
 */
const INSTRUCTION_INDICATORS = [
  /ignore/i,
  /override/i,
  /instruction/i,
  /system/i,
  /execute/i,
  /run\s/i,
  /fetch/i,
  /send/i,
  /read\s/i,
  /write\s/i,
  /curl/i,
  /bash/i,
  /shell/i,
  /forget/i,
  /disregard/i,
  /pretend/i,
  /you\s+are/i,
  /your\s+new/i,
];

function containsInstructions(text: string): boolean {
  let hits = 0;
  for (const re of INSTRUCTION_INDICATORS) {
    if (re.test(text)) hits++;
    if (hits >= 2) return true;
  }
  return false;
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
 * Decode zero-width characters to reveal the hidden payload.
 * Some steganography encodes binary using ZWJ/ZWNJ pairs.
 */
function decodeZeroWidth(text: string): string {
  // Show unicode code points for visibility
  return [...text].map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
}

interface HiddenMatch {
  regex: RegExp;
  technique: string;
  decodeHidden: (matchText: string, captured?: string) => string;
}

const MATCHERS: HiddenMatch[] = [
  {
    regex: ZERO_WIDTH_RE,
    technique: 'unicode-smuggling',
    decodeHidden: (matchText) => decodeZeroWidth(matchText),
  },
  {
    regex: BIDI_RE,
    technique: 'bidi-override',
    decodeHidden: (matchText) => decodeZeroWidth(matchText),
  },
  {
    regex: HTML_COMMENT_RE,
    technique: 'html-comment',
    decodeHidden: (_matchText, captured) => captured?.trim() ?? '',
  },
  {
    regex: NULL_BYTE_RE,
    technique: 'null-byte',
    decodeHidden: (matchText) => `${matchText.length} null byte(s)`,
  },
];

export function detect(
  content: string,
  filePath: string,
  isPriority: boolean,
): PromptFinding[] {
  const findings: PromptFinding[] = [];

  for (const { regex, technique, decodeHidden } of MATCHERS) {
    const globalRe = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    let match: RegExpExecArray | null;

    while ((match = globalRe.exec(content)) !== null) {
      const { line, column } = lineColFromIndex(content, match.index);
      const decoded = decodeHidden(match[0], match[1]);
      const hasInstructions = technique === 'html-comment'
        ? containsInstructions(match[1] ?? '')
        : containsInstructions(decoded);

      // HTML comments with benign content (e.g. <!-- TODO --> ) are low severity
      const isBenignComment =
        technique === 'html-comment' &&
        !hasInstructions &&
        (match[1]?.trim().length ?? 0) < 40;

      let severity: PromptFinding['severity'];
      let confidence: number;

      if (hasInstructions) {
        severity = 'critical';
        confidence = 0.95;
      } else if (isBenignComment) {
        severity = 'low';
        confidence = 0.2;
      } else {
        severity = isPriority ? 'high' : 'medium';
        confidence = isPriority ? 0.8 : 0.6;
      }

      const decodedPreview = decoded.length > 80 ? decoded.slice(0, 80) + '...' : decoded;
      const description = hasInstructions
        ? `Hidden text contains instruction-like payload (${technique}): "${decodedPreview}"`
        : `Hidden/invisible text detected (${technique}) at byte offset ${match.index}: "${decodedPreview}"`;

      findings.push({
        category: CATEGORY,
        severity,
        location: { file: filePath, line, column },
        description,
        contentSnippet: snippet(content, Math.max(0, match.index - 10), match[0].length + 20),
        confidence,
        technique,
      });
    }
  }

  return findings;
}
