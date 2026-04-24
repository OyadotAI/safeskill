import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import type { CodeFinding } from '@safeskill/shared';
import { truncate } from '../utils.js';

function getLocation(sourceFile: SourceFile, pos: number, relPath: string) {
  const { line, column } = sourceFile.getLineAndColumnAtPos(pos);
  return { file: relPath, line, column };
}

/**
 * Returns true when `arg` is (or wraps) a compile-time string literal that
 * can be resolved without executing user code. Parenthesized expressions,
 * `as const` assertions, satisfies clauses, and non-null assertions all
 * preserve the underlying literal and should not be flagged as dynamic.
 */
function isLiteralArgument(arg: Node): boolean {
  const kind = arg.getKind();
  if (kind === SyntaxKind.StringLiteral || kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
    return true;
  }
  if (
    kind === SyntaxKind.ParenthesizedExpression ||
    kind === SyntaxKind.AsExpression ||
    kind === SyntaxKind.TypeAssertionExpression ||
    kind === SyntaxKind.SatisfiesExpression ||
    kind === SyntaxKind.NonNullExpression
  ) {
    const inner =
      (arg as unknown as { getExpression?: () => Node }).getExpression?.();
    return inner ? isLiteralArgument(inner) : false;
  }
  return false;
}

export function detect(sourceFile: SourceFile, relPath: string): CodeFinding[] {
  const findings: CodeFinding[] = [];

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    const exprText = expr.getText();

    // Dynamic require()
    if (exprText === 'require') {
      const args = call.getArguments();
      if (args.length === 0) continue;

      const firstArg = args[0]!;
      if (!isLiteralArgument(firstArg)) {
        findings.push({
          category: 'dynamic-require',
          severity: 'high',
          location: getLocation(sourceFile, call.getStart(), relPath),
          description: 'Dynamic require() with non-literal argument — module path determined at runtime',
          codeSnippet: truncate(call.getText().trim(), 120),
          confidence: 0.85,
        });
      }
    }

    // Dynamic require.resolve()
    if (exprText === 'require.resolve') {
      const args = call.getArguments();
      if (args.length === 0) continue;

      const firstArg = args[0]!;
      if (!isLiteralArgument(firstArg)) {
        findings.push({
          category: 'dynamic-require',
          severity: 'high',
          location: getLocation(sourceFile, call.getStart(), relPath),
          description: 'Dynamic require.resolve() with computed path',
          codeSnippet: truncate(call.getText().trim(), 120),
          confidence: 0.8,
        });
      }
    }

    // Dynamic import() — appears as CallExpression with ImportKeyword
    if (expr.getKind() === SyntaxKind.ImportKeyword) {
      const args = call.getArguments();
      if (args.length === 0) continue;

      const firstArg = args[0]!;
      if (!isLiteralArgument(firstArg)) {
        findings.push({
          category: 'dynamic-require',
          severity: 'high',
          location: getLocation(sourceFile, call.getStart(), relPath),
          description: 'Dynamic import() with non-literal argument — module path determined at runtime',
          codeSnippet: truncate(call.getText().trim(), 120),
          confidence: 0.85,
        });
      }
    }
  }

  // Also detect import() via template expressions or binary expressions as arguments
  // ts-morph may represent dynamic import differently depending on the TS version
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();

    // Handle cases where import is aliased: const _import = import; _import(x)
    // or where a variable holds 'require': const r = require; r(x)
    if (exprText === 'import') {
      const args = call.getArguments();
      if (args.length === 0) continue;

      const firstArg = args[0]!;
      if (!isLiteralArgument(firstArg)) {
        findings.push({
          category: 'dynamic-require',
          severity: 'high',
          location: getLocation(sourceFile, call.getStart(), relPath),
          description: 'Dynamic import() with computed module specifier',
          codeSnippet: truncate(call.getText().trim(), 120),
          confidence: 0.85,
        });
      }
    }
  }

  // Detect require with path.join/path.resolve (common pattern for dynamic paths)
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();
    if (exprText !== 'require') continue;

    const args = call.getArguments();
    if (args.length === 0) continue;

    const firstArg = args[0]!;
    const argText = firstArg.getText();

    // Check if the argument is a call to path.join, path.resolve, or similar
    if (
      argText.includes('path.join') ||
      argText.includes('path.resolve') ||
      argText.includes('__dirname') ||
      argText.includes('__filename')
    ) {
      findings.push({
        category: 'dynamic-require',
        severity: 'medium',
        location: getLocation(sourceFile, call.getStart(), relPath),
        description: 'require() with computed path (path.join/resolve or __dirname)',
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence: 0.6,
      });
    }
  }

  return findings;
}
