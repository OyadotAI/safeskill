import { SyntaxKind, type SourceFile } from 'ts-morph';
import type { CodeFinding } from '@safeskill/shared';
import { truncate } from '../utils.js';

const DANGEROUS_BRACKET_TARGETS = new Set([
  'process',
  'global',
  'globalThis',
  'window',
  'require',
  'module',
  'exports',
  'constructor',
]);

function getLocation(sourceFile: SourceFile, pos: number, relPath: string) {
  const { line, column } = sourceFile.getLineAndColumnAtPos(pos);
  return { file: relPath, line, column };
}

export function detect(sourceFile: SourceFile, relPath: string): CodeFinding[] {
  const findings: CodeFinding[] = [];

  // Detect String.fromCharCode chains (>3 calls in the same statement or expression)
  const fromCharCodeCalls = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const expr = call.getExpression().getText();
      return expr === 'String.fromCharCode';
    });

  if (fromCharCodeCalls.length > 3) {
    // Report once for the file, pointing to the first occurrence
    const first = fromCharCodeCalls[0]!;
    findings.push({
      category: 'obfuscation',
      severity: 'critical',
      location: getLocation(sourceFile, first.getStart(), relPath),
      description: `Heavy String.fromCharCode usage (${fromCharCodeCalls.length} calls) — likely obfuscated strings`,
      codeSnippet: truncate(first.getText().trim(), 120),
      confidence: 0.9,
    });
  } else {
    // Report individual calls if <= 3 — still suspicious but lower confidence
    for (const call of fromCharCodeCalls) {
      findings.push({
        category: 'obfuscation',
        severity: 'high',
        location: getLocation(sourceFile, call.getStart(), relPath),
        description: 'Uses String.fromCharCode (potential string obfuscation)',
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence: 0.6,
      });
    }
  }

  // Collect locally declared variable and parameter names so we don't confuse
  // a local `window` array (etc.) with the browser global.
  const localDeclarations = new Set<string>();
  for (const decl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    localDeclarations.add(decl.getName());
  }
  for (const param of sourceFile.getDescendantsOfKind(SyntaxKind.Parameter)) {
    localDeclarations.add(param.getName());
  }

  // Detect bracket notation access to dangerous objects: process['env'], require['resolve'], etc.
  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    const obj = access.getExpression();
    const objText = obj.getText();

    if (!DANGEROUS_BRACKET_TARGETS.has(objText)) continue;

    // Skip if this name is a locally declared variable/parameter, not the global
    if (localDeclarations.has(objText)) continue;

    const arg = access.getArgumentExpression();
    if (!arg) continue;

    // Only flag string literal bracket access (process['env'] vs process[var])
    if (arg.getKind() === SyntaxKind.StringLiteral) {
      const propName = arg.getText().slice(1, -1);
      findings.push({
        category: 'obfuscation',
        severity: 'critical',
        location: getLocation(sourceFile, access.getStart(), relPath),
        description: `Bracket notation access: ${objText}['${propName}'] (obfuscation technique to evade static analysis)`,
        codeSnippet: truncate(access.getText().trim(), 120),
        confidence: 0.9,
      });
    } else {
      // Dynamic bracket access
      findings.push({
        category: 'obfuscation',
        severity: 'critical',
        location: getLocation(sourceFile, access.getStart(), relPath),
        description: `Dynamic bracket notation access on ${objText} (obfuscation technique)`,
        codeSnippet: truncate(access.getText().trim(), 120),
        confidence: 0.85,
      });
    }
  }

  // Detect hex-escaped strings: strings containing \x patterns
  for (const literal of sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    const rawText = literal.getText();
    const hexMatches = rawText.match(/\\x[0-9a-fA-F]{2}/g);
    if (hexMatches && hexMatches.length > 3) {
      findings.push({
        category: 'obfuscation',
        severity: 'critical',
        location: getLocation(sourceFile, literal.getStart(), relPath),
        description: `Hex-escaped string with ${hexMatches.length} escape sequences (obfuscated content)`,
        codeSnippet: truncate(rawText, 120),
        confidence: 0.85,
      });
    }
  }

  // Also check template literals for hex escapes
  for (const literal of sourceFile.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    const rawText = literal.getText();
    const hexMatches = rawText.match(/\\x[0-9a-fA-F]{2}/g);
    if (hexMatches && hexMatches.length > 3) {
      findings.push({
        category: 'obfuscation',
        severity: 'critical',
        location: getLocation(sourceFile, literal.getStart(), relPath),
        description: `Hex-escaped template literal with ${hexMatches.length} escape sequences`,
        codeSnippet: truncate(rawText, 120),
        confidence: 0.85,
      });
    }
  }

  // Detect very long single-line expressions (likely minified/obfuscated).
  // Heuristic: minified code is code — packed with operators, semicolons, and
  // identifier punctuation. A long line that is predominantly inside a single
  // string literal is a long prompt or help text, not obfuscation.
  const fullText = sourceFile.getFullText();
  const lines = fullText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip comments and import/require statements
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    if (trimmed.startsWith('import ') || trimmed.startsWith('require(')) continue;
    if (trimmed.startsWith('export ')) continue;

    // Raise the minimum length — 500 fires on long prompts and MCP tool
    // descriptions; 800 avoids most prose while still catching packed code.
    if (line.length <= 800) continue;

    // Skip long string literal assignments — system prompts, templates, etc.
    if (/^\s*(?:const|let|var|export\s+(?:const|let|var))\s+\w+\s*(?::\s*[\w<>,|\s]+\s*)?=\s*['"`]/.test(trimmed)) continue;
    // Skip object property / argument values where the RHS is a string.
    // Covers MCP tool definitions like  `description: 'Retrieve a symbol...'`
    // and inline return statements like `return \`<long prompt>\`;`.
    if (/^\s*(?:['"][\w$-]+['"]|\w+)\s*:\s*['"`]/.test(trimmed)) continue;
    if (/^\s*return\s+['"`]/.test(trimmed)) continue;
    // Lines that start with a string/array/template literal.
    if (/^\s*['"`]/.test(trimmed) || /^\s*\[?\s*['"`]/.test(trimmed)) continue;

    // Measure how much of the line is inside string/template literals. If most
    // characters are inside quotes, this is prose, not code.
    const nonStringLen = measureNonStringLength(line);
    if (nonStringLen < line.length * 0.3) continue;

    // Require code-like density: multiple operators / semicolons / punctuation.
    // A true minified line hits these hundreds of times; prose hits them few.
    const codePunct = (line.match(/[;{}()=+\-*/&|<>!?:,]/g) ?? []).length;
    if (codePunct < 20) continue;

    findings.push({
      category: 'obfuscation',
      severity: 'critical',
      location: { file: relPath, line: i + 1, column: 1 },
      description: `Very long single-line expression (${line.length} chars) — possibly minified or obfuscated code`,
      codeSnippet: truncate(trimmed, 120),
      confidence: 0.75,
    });
  }

  // Detect eval with string concatenation
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();
    if (exprText !== 'eval') continue;

    const args = call.getArguments();
    if (args.length === 0) continue;
    const firstArg = args[0]!;

    const hasConcatenation =
      firstArg.getKind() === SyntaxKind.BinaryExpression ||
      firstArg.getKind() === SyntaxKind.TemplateExpression;

    if (hasConcatenation) {
      findings.push({
        category: 'obfuscation',
        severity: 'critical',
        location: getLocation(sourceFile, call.getStart(), relPath),
        description: 'eval() with string concatenation/template — obfuscated code execution',
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence: 0.95,
      });
    }
  }

  // Detect Unicode escape sequences in identifiers (\u0070\u0072\u006f\u0063\u0065\u0073\u0073 = "process")
  const unicodeIdentifierPattern = /\\u[0-9a-fA-F]{4}/g;
  for (const literal of sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    const rawText = literal.getText();
    const unicodeMatches = rawText.match(unicodeIdentifierPattern);
    if (!unicodeMatches || unicodeMatches.length <= 3) continue;

    // Only flag when escapes decode to printable ASCII — the classic
    // identifier-obfuscation shape. Box-drawing banners (U+2500–U+259F),
    // bullets (U+2022), and other non-ASCII display characters are legitimate.
    const ascii = countAsciiPrintableEscapes(unicodeMatches);
    if (ascii <= 3) continue;

    findings.push({
      category: 'obfuscation',
      severity: 'critical',
      location: getLocation(sourceFile, literal.getStart(), relPath),
      description: `Unicode-escaped string with ${ascii} ASCII-identifier escapes (string obfuscation)`,
      codeSnippet: truncate(rawText, 120),
      confidence: 0.85,
    });
  }

  return findings;
}

/**
 * Counts how many chars of `line` lie outside single/double/backtick string
 * literals. Rough lexer — enough to distinguish a 900-char template-literal
 * prompt from a 900-char minified statement.
 */
function measureNonStringLength(line: string): number {
  let inStr: '"' | "'" | '`' | null = null;
  let escape = false;
  let nonStr = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === inStr) { inStr = null; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    nonStr++;
  }
  return nonStr;
}

/**
 * Counts \uXXXX escapes whose code point is a printable ASCII character
 * (U+0020..U+007E). These are the shapes used to obfuscate identifiers like
 * "process" or "require".
 */
function countAsciiPrintableEscapes(matches: RegExpMatchArray): number {
  let n = 0;
  for (const m of matches) {
    const cp = parseInt(m.slice(2), 16);
    if (cp >= 0x20 && cp <= 0x7e) n++;
  }
  return n;
}
