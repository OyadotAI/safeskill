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

/**
 * Detect whether the match at `index` looks like a structured-data key
 * (`User:`, `system:`, `Human:`) rather than a chat-turn marker. In a
 * YAML/JSON document the line that contains the match is composed of
 * indentation, an identifier-shaped token, a colon, and optionally a
 * value — never the imperative prose that real prompt-injection turn
 * markers sit in. Used to suppress false positives on OpenAPI schema
 * names (`User:`, `Assistant:`) and config keys (`system:`).
 */
function isYamlOrJsonFile(filePath: string): boolean {
  return /\.(?:ya?ml|json|jsonc|json5|toml)(?::\d+)?$/i.test(filePath);
}

function looksLikeStructuredDataKey(content: string, matchIndex: number, matchText: string): boolean {
  // The fake-turn-marker regexes include the preceding newline (e.g.
  // `\n\s*User\s*:`). Advance past leading whitespace/newlines in the match
  // so the line lookup lands on the line that actually contains the key.
  const leadingWs = /^\s*/.exec(matchText)?.[0].length ?? 0;
  const keyIndex = matchIndex + leadingWs;
  const lineStart = content.lastIndexOf('\n', keyIndex - 1) + 1;
  const lineEnd = content.indexOf('\n', keyIndex);
  const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  // Pure structured-data key shape: `^[\s-]*<Identifier>\s*:\s*<value-or-empty>$`
  // `-` covers YAML list items like `- User:`. We accept either
  //   `  User:` (empty value, child object follows)
  //   `  User: scalar-value`
  //   `  User: # trailing comment`
  // and reject prose-shaped lines (sentence breaks, multi-word values mid-line).
  const keyShape = /^[\s-]*[A-Za-z_][A-Za-z0-9_-]*\s*:\s*(?:#.*)?$|^[\s-]*[A-Za-z_][A-Za-z0-9_-]*\s*:\s+\S.*$/;
  return keyShape.test(line) && !/[.!?]\s+[A-Z]/.test(line);
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

  const structuredFile = isYamlOrJsonFile(filePath);

  for (const { regex, technique } of allPatterns) {
    const globalRe = new RegExp(
      regex.source,
      regex.flags.includes('g') ? regex.flags : regex.flags + 'g',
    );
    let match: RegExpExecArray | null;

    while ((match = globalRe.exec(content)) !== null) {
      // In YAML/JSON documents, `User:`, `Human:`, `Assistant:` are usually
      // schema keys (OpenAPI components, conversation-log structures), not
      // chat-turn markers. Same for ChatML-style bracket tags appearing as
      // YAML strings. Skip when the match's line has structured-data shape.
      if (
        structuredFile &&
        (technique === 'fake-turn-marker' || technique === 'chatml-marker') &&
        looksLikeStructuredDataKey(content, match.index, match[0])
      ) {
        continue;
      }

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
