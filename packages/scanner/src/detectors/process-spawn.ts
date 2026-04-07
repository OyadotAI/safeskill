import { SyntaxKind, type SourceFile } from 'ts-morph';
import type { CodeFinding } from '@safeskill/shared';
import { DANGEROUS_MODULES } from '@safeskill/shared';
import { truncate } from '../utils.js';

const CHILD_PROCESS_MODULES = new Set<string>(DANGEROUS_MODULES.process);
const VM_MODULES = new Set<string>(DANGEROUS_MODULES.vm);
const WORKER_MODULES = new Set(['worker_threads', 'node:worker_threads']);

const SPAWN_METHODS = new Set([
  'exec',
  'execSync',
  'spawn',
  'spawnSync',
  'execFile',
  'execFileSync',
  'fork',
]);

const VM_METHODS = new Set([
  'runInNewContext',
  'runInThisContext',
  'runInContext',
  'createContext',
  'compileFunction',
]);

function getLocation(sourceFile: SourceFile, pos: number, relPath: string) {
  const { line, column } = sourceFile.getLineAndColumnAtPos(pos);
  return { file: relPath, line, column };
}

function hasTemplateOrConcatInArgs(call: ReturnType<SourceFile['getDescendantsOfKind']>[0]): boolean {
  const args = (call as { getArguments(): { getKind(): SyntaxKind; getDescendantsOfKind(kind: SyntaxKind): unknown[] }[] }).getArguments();
  for (const arg of args) {
    // Template literals
    if (arg.getKind() === SyntaxKind.TemplateExpression) return true;
    // String concatenation via +
    if (arg.getKind() === SyntaxKind.BinaryExpression) {
      const binChildren = arg.getDescendantsOfKind(SyntaxKind.PlusToken);
      if (binChildren.length > 0) return true;
    }
  }
  return false;
}

function hasChildProcessImport(sourceFile: SourceFile): boolean {
  for (const decl of sourceFile.getImportDeclarations()) {
    if (CHILD_PROCESS_MODULES.has(decl.getModuleSpecifierValue())) return true;
  }
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.Identifier || expr.getText() !== 'require') continue;
    const args = call.getArguments();
    if (args.length === 0) continue;
    const firstArg = args[0]!;
    if (firstArg.getKind() !== SyntaxKind.StringLiteral) continue;
    if (CHILD_PROCESS_MODULES.has(firstArg.getText().slice(1, -1))) return true;
  }
  return false;
}

export function detect(sourceFile: SourceFile, relPath: string): CodeFinding[] {
  const findings: CodeFinding[] = [];
  const fileImportsChildProcess = hasChildProcessImport(sourceFile);

  // Check imports of child_process / vm
  for (const decl of sourceFile.getImportDeclarations()) {
    const mod = decl.getModuleSpecifierValue();
    if (CHILD_PROCESS_MODULES.has(mod)) {
      findings.push({
        category: 'process-spawn',
        severity: 'critical',
        location: getLocation(sourceFile, decl.getStart(), relPath),
        description: `Imports child_process module "${mod}"`,
        codeSnippet: truncate(decl.getText().trim(), 120),
        confidence: 1.0,
      });
    }
    if (VM_MODULES.has(mod)) {
      findings.push({
        category: 'process-spawn',
        severity: 'critical',
        location: getLocation(sourceFile, decl.getStart(), relPath),
        description: `Imports VM module "${mod}"`,
        codeSnippet: truncate(decl.getText().trim(), 120),
        confidence: 1.0,
      });
    }
    if (WORKER_MODULES.has(mod)) {
      findings.push({
        category: 'process-spawn',
        severity: 'high',
        location: getLocation(sourceFile, decl.getStart(), relPath),
        description: `Imports worker_threads — can execute code in isolated threads`,
        codeSnippet: truncate(decl.getText().trim(), 120),
        confidence: 0.9,
      });
    }
  }

  // Check require calls
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.Identifier || expr.getText() !== 'require') continue;

    const args = call.getArguments();
    if (args.length === 0) continue;
    const firstArg = args[0]!;
    if (firstArg.getKind() !== SyntaxKind.StringLiteral) continue;

    const modName = firstArg.getText().slice(1, -1);
    if (CHILD_PROCESS_MODULES.has(modName)) {
      findings.push({
        category: 'process-spawn',
        severity: 'critical',
        location: getLocation(sourceFile, call.getStart(), relPath),
        description: `Requires child_process module "${modName}"`,
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence: 1.0,
      });
    }
    if (VM_MODULES.has(modName)) {
      findings.push({
        category: 'process-spawn',
        severity: 'critical',
        location: getLocation(sourceFile, call.getStart(), relPath),
        description: `Requires VM module "${modName}"`,
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence: 1.0,
      });
    }
    if (WORKER_MODULES.has(modName)) {
      findings.push({
        category: 'process-spawn',
        severity: 'high',
        location: getLocation(sourceFile, call.getStart(), relPath),
        description: `Requires worker_threads — can execute code in isolated threads`,
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence: 0.9,
      });
    }
  }

  // Check spawn/exec calls
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();
    const parts = exprText.split('.');
    const methodName = parts[parts.length - 1]!;

    if (SPAWN_METHODS.has(methodName)) {
      // 'exec' is ambiguous — RegExp.exec(), ioredis Pipeline.exec(), etc.
      // Only flag receiver-qualified .exec() calls if the file imports child_process.
      if (methodName === 'exec' && parts.length > 1 && !fileImportsChildProcess) {
        continue;
      }

      const hasInjectionRisk = hasTemplateOrConcatInArgs(call);

      let description = `Spawns child process: ${methodName}()`;
      if (hasInjectionRisk) {
        description = `Command injection risk: ${methodName}() called with dynamic string argument`;
      }

      findings.push({
        category: 'process-spawn',
        severity: 'critical',
        location: getLocation(sourceFile, call.getStart(), relPath),
        description,
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence: hasInjectionRisk ? 0.95 : 0.85,
      });
    }

    // VM methods
    if (VM_METHODS.has(methodName)) {
      findings.push({
        category: 'process-spawn',
        severity: 'critical',
        location: getLocation(sourceFile, call.getStart(), relPath),
        description: `Executes code in VM context: ${exprText}()`,
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence: 0.95,
      });
    }

    // eval()
    if (exprText === 'eval') {
      const hasConcat = hasTemplateOrConcatInArgs(call);
      findings.push({
        category: 'process-spawn',
        severity: 'critical',
        location: getLocation(sourceFile, call.getStart(), relPath),
        description: hasConcat
          ? 'Uses eval() with dynamic string construction'
          : 'Uses eval() for code execution',
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence: 0.9,
      });
    }
  }

  // new Function()
  for (const newExpr of sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    if (newExpr.getExpression().getText() === 'Function') {
      findings.push({
        category: 'process-spawn',
        severity: 'critical',
        location: getLocation(sourceFile, newExpr.getStart(), relPath),
        description: 'Creates function from string via Function constructor',
        codeSnippet: truncate(newExpr.getText().trim(), 120),
        confidence: 0.95,
      });
    }
  }

  return findings;
}
