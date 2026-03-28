import { SyntaxKind, type SourceFile } from 'ts-morph';
import type { CodeFinding, Severity } from '@safeskill/shared';
import { SENSITIVE_ENV_VARS } from '@safeskill/shared';
import { truncate } from '../utils.js';

const SENSITIVE_VARS = new Set<string>(SENSITIVE_ENV_VARS);

function getLocation(sourceFile: SourceFile, pos: number, relPath: string) {
  const { line, column } = sourceFile.getLineAndColumnAtPos(pos);
  return { file: relPath, line, column };
}

function isSensitiveVar(name: string): boolean {
  if (SENSITIVE_VARS.has(name)) return true;
  // Also flag patterns that look like secrets
  const upper = name.toUpperCase();
  return (
    upper.includes('SECRET') ||
    upper.includes('PASSWORD') ||
    upper.includes('PRIVATE_KEY') ||
    upper.includes('TOKEN') && !upper.includes('TOKENIZE') ||
    upper.includes('API_KEY')
  );
}

export function detect(sourceFile: SourceFile, relPath: string): CodeFinding[] {
  const findings: CodeFinding[] = [];

  // Detect process.env.VAR_NAME (property access)
  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const expr = access.getExpression();
    if (expr.getText() !== 'process.env') continue;

    const varName = access.getName();

    let severity: Severity;
    let description: string;

    if (isSensitiveVar(varName)) {
      severity = 'critical';
      description = `Accesses sensitive environment variable: ${varName}`;
    } else {
      severity = 'medium';
      description = `Accesses environment variable: ${varName}`;
    }

    findings.push({
      category: 'env-access',
      severity,
      location: getLocation(sourceFile, access.getStart(), relPath),
      description,
      codeSnippet: truncate(access.getText().trim(), 120),
      confidence: 0.95,
    });
  }

  // Detect process.env['VAR_NAME'] or process.env[variable] (element access)
  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    const expr = access.getExpression();
    if (expr.getText() !== 'process.env') continue;

    const argExpr = access.getArgumentExpression();
    if (!argExpr) continue;

    if (argExpr.getKind() === SyntaxKind.StringLiteral) {
      const varName = argExpr.getText().slice(1, -1);

      let severity: Severity;
      let description: string;

      if (isSensitiveVar(varName)) {
        severity = 'critical';
        description = `Accesses sensitive environment variable via bracket notation: ${varName}`;
      } else {
        severity = 'medium';
        description = `Accesses environment variable via bracket notation: ${varName}`;
      }

      findings.push({
        category: 'env-access',
        severity,
        location: getLocation(sourceFile, access.getStart(), relPath),
        description,
        codeSnippet: truncate(access.getText().trim(), 120),
        confidence: 0.95,
      });
    } else {
      // Dynamic access — variable key
      findings.push({
        category: 'env-access',
        severity: 'high',
        location: getLocation(sourceFile, access.getStart(), relPath),
        description: 'Dynamic environment variable access with computed key',
        codeSnippet: truncate(access.getText().trim(), 120),
        confidence: 0.9,
      });
    }
  }

  // Detect destructuring of process.env: const { X, Y } = process.env
  for (const decl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer();
    if (!init || init.getText() !== 'process.env') continue;

    const nameNode = decl.getNameNode();
    if (nameNode.getKind() === SyntaxKind.ObjectBindingPattern) {
      const elements = nameNode.asKind(SyntaxKind.ObjectBindingPattern)?.getElements() ?? [];
      const varNames = elements.map((e) => e.getName());

      const hasSensitive = varNames.some(isSensitiveVar);
      const isBulk = varNames.length > 5;

      let severity: Severity;
      let description: string;

      if (hasSensitive) {
        severity = 'critical';
        description = `Destructures sensitive vars from process.env: ${varNames.filter(isSensitiveVar).join(', ')}`;
      } else if (isBulk) {
        severity = 'high';
        description = `Bulk destructuring of process.env (${varNames.length} variables)`;
      } else {
        severity = 'medium';
        description = `Destructures process.env: ${varNames.join(', ')}`;
      }

      findings.push({
        category: 'env-access',
        severity,
        location: getLocation(sourceFile, decl.getStart(), relPath),
        description,
        codeSnippet: truncate(decl.getText().trim(), 120),
        confidence: 0.95,
      });
    } else if (nameNode.getKind() === SyntaxKind.Identifier) {
      // const env = process.env (bulk alias)
      findings.push({
        category: 'env-access',
        severity: 'high',
        location: getLocation(sourceFile, decl.getStart(), relPath),
        description: 'Assigns entire process.env to a variable (bulk access)',
        codeSnippet: truncate(decl.getText().trim(), 120),
        confidence: 0.9,
      });
    }
  }

  // Detect Object.keys(process.env), Object.entries(process.env), Object.values(process.env)
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();
    if (!['Object.keys', 'Object.entries', 'Object.values'].includes(exprText)) continue;

    const args = call.getArguments();
    if (args.length === 0) continue;

    if (args[0]!.getText() === 'process.env') {
      findings.push({
        category: 'env-access',
        severity: 'high',
        location: getLocation(sourceFile, call.getStart(), relPath),
        description: `Enumerates all environment variables via ${exprText}(process.env)`,
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence: 0.95,
      });
    }
  }

  // Detect spread of process.env: { ...process.env }
  for (const spread of sourceFile.getDescendantsOfKind(SyntaxKind.SpreadAssignment)) {
    if (spread.getExpression().getText() === 'process.env') {
      findings.push({
        category: 'env-access',
        severity: 'high',
        location: getLocation(sourceFile, spread.getStart(), relPath),
        description: 'Spreads entire process.env (bulk access)',
        codeSnippet: truncate(spread.getText().trim(), 120),
        confidence: 0.9,
      });
    }
  }

  return findings;
}
