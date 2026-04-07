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

  // Detect bracket notation access to dangerous objects: process['env'], require['resolve'], etc.
  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    const obj = access.getExpression();
    const objText = obj.getText();

    if (!DANGEROUS_BRACKET_TARGETS.has(objText)) continue;

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

  // Detect very long single-line expressions (>500 chars, likely minified/obfuscated)
  const fullText = sourceFile.getFullText();
  const lines = fullText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip comments and import/require statements
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    if (trimmed.startsWith('import ') || trimmed.startsWith('require(')) continue;
    if (trimmed.startsWith('export ')) continue;

    if (line.length > 500) {
      // Skip long string literal assignments — system prompts, templates, etc.
      // These are common in constants files and are not obfuscation.
      if (/^\s*(?:const|let|var|export\s+(?:const|let|var))\s+\w+\s*=\s*['"`]/.test(trimmed)) continue;
      // Also skip lines that are predominantly a string (array of strings, object values)
      if (/^\s*['"`]/.test(trimmed) || /^\s*\[?\s*['"`]/.test(trimmed)) continue;

      findings.push({
        category: 'obfuscation',
        severity: 'critical',
        location: { file: relPath, line: i + 1, column: 1 },
        description: `Very long single-line expression (${line.length} chars) — possibly minified or obfuscated code`,
        codeSnippet: truncate(trimmed, 120),
        confidence: 0.75,
      });
    }
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
    if (unicodeMatches && unicodeMatches.length > 3) {
      findings.push({
        category: 'obfuscation',
        severity: 'critical',
        location: getLocation(sourceFile, literal.getStart(), relPath),
        description: `Unicode-escaped string with ${unicodeMatches.length} escape sequences`,
        codeSnippet: truncate(rawText, 120),
        confidence: 0.85,
      });
    }
  }

  return findings;
}
