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

interface ArgNode {
  getKind(): SyntaxKind;
  getText(): string;
  getDescendantsOfKind(kind: SyntaxKind): unknown[];
  getProperties?(): Array<{
    getKind(): SyntaxKind;
    getName?(): string;
    getInitializer?(): { getKind(): SyntaxKind } | undefined;
  }>;
  getElements?(): Array<{ getKind(): SyntaxKind }>;
}

function getCallArgs(call: ReturnType<SourceFile['getDescendantsOfKind']>[0]): ArgNode[] {
  return (call as { getArguments(): ArgNode[] }).getArguments();
}

function hasTemplateOrConcatInArgs(call: ReturnType<SourceFile['getDescendantsOfKind']>[0]): boolean {
  for (const arg of getCallArgs(call)) {
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

/**
 * Hardcoded literal arg: a string/numeric literal, a no-substitution template,
 * or an array literal whose elements are all such literals. Anything else
 * (identifier, member access, function call, object) returns false.
 */
function isLiteralOrLiteralArray(arg: ArgNode): boolean {
  const kind = arg.getKind();
  if (
    kind === SyntaxKind.StringLiteral ||
    kind === SyntaxKind.NoSubstitutionTemplateLiteral ||
    kind === SyntaxKind.NumericLiteral
  ) {
    return true;
  }
  if (kind === SyntaxKind.ArrayLiteralExpression && arg.getElements) {
    for (const el of arg.getElements()) {
      const ek = el.getKind();
      if (
        ek !== SyntaxKind.StringLiteral &&
        ek !== SyntaxKind.NoSubstitutionTemplateLiteral &&
        ek !== SyntaxKind.NumericLiteral
      ) {
        return false;
      }
    }
    return true;
  }
  return false;
}

/**
 * Detect `{ shell: false }` (or the absence of any `shell` property) in the
 * options object passed to spawn-family calls. Returns true when the options
 * arg is an object literal that does NOT enable shell interpretation.
 */
function optionsExplicitlyDisableShell(arg: ArgNode): boolean {
  if (arg.getKind() !== SyntaxKind.ObjectLiteralExpression || !arg.getProperties) {
    return false;
  }
  let sawShellFalse = false;
  for (const prop of arg.getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment || !prop.getName || !prop.getInitializer) continue;
    if (prop.getName() !== 'shell') continue;
    const init = prop.getInitializer();
    if (!init) continue;
    if (init.getKind() === SyntaxKind.FalseKeyword) {
      sawShellFalse = true;
    } else {
      // Any non-`false` value (true, identifier, string) — not bounded.
      return false;
    }
  }
  return sawShellFalse;
}

/**
 * Bounded-subprocess pattern: command and argv are hardcoded literals AND
 * either (a) the options object sets `shell: false`, or (b) the method is
 * one of the execFile family which doesn't spawn a shell by default.
 *
 * Used to downgrade severity for npm wrappers and similar legitimate
 * subprocess uses where shell-injection is structurally impossible.
 */
const SHELLLESS_BY_DEFAULT = new Set(['execFile', 'execFileSync', 'fork']);

function isBoundedSubprocessCall(
  call: ReturnType<SourceFile['getDescendantsOfKind']>[0],
  methodName: string,
): boolean {
  const args = getCallArgs(call);
  if (args.length === 0) return false;

  // First arg = command. Must be a hardcoded literal — anything dynamic
  // here means the binary itself could be attacker-controlled, which
  // shell:false does not protect against.
  if (!isLiteralOrLiteralArray(args[0]!)) return false;

  // Locate the options object (last arg if it's an ObjectLiteralExpression).
  let optionsArg: ArgNode | undefined;
  for (const arg of args) {
    if (arg.getKind() === SyntaxKind.ObjectLiteralExpression) {
      optionsArg = arg;
    }
  }

  if (SHELLLESS_BY_DEFAULT.has(methodName)) {
    // execFile/execFileSync/fork don't invoke a shell by default. The argv
    // values pass through as discrete arguments to the target binary, so
    // dynamic argv can't produce shell injection. Ensure options (if any)
    // don't opt into a shell.
    if (optionsArg) {
      const props = optionsArg.getProperties?.() ?? [];
      const shellProp = props.find((p) =>
        p.getKind() === SyntaxKind.PropertyAssignment &&
        p.getName?.() === 'shell',
      );
      if (shellProp) {
        const init = shellProp.getInitializer?.();
        if (!init || init.getKind() !== SyntaxKind.FalseKeyword) return false;
      }
    }
    return true;
  }

  // spawn / spawnSync / exec / execSync: must explicitly set shell: false.
  // With a literal command and shell:false, dynamic argv is still safe from
  // shell-metacharacter injection — the values become discrete argv to the
  // spawned binary without shell interpretation.
  return optionsArg ? optionsExplicitlyDisableShell(optionsArg) : false;
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
      // 'spawn' is also ambiguous on a receiver — cytoscape's `cy.spawn()`
      // returns a graph collection; eventemitters expose `.spawn()`; some
      // worker pools use it too. Same rule as exec(): only flag a
      // member-call `x.spawn()` when the file actually imports child_process.
      // Bare `spawn(...)` (no receiver) is almost always the destructured
      // child_process API, so it still fires regardless.
      if (
        (methodName === 'spawn' || methodName === 'spawnSync') &&
        parts.length > 1 &&
        !fileImportsChildProcess
      ) {
        continue;
      }

      const hasInjectionRisk = hasTemplateOrConcatInArgs(call);
      const isBounded = !hasInjectionRisk && isBoundedSubprocessCall(call, methodName);
      // Hardcoded literal args without an explicit `shell: false` (e.g.
      // `execSync('python3 --version')`) — a shell IS spawned, but with no
      // user input there's no injection surface. Mark as low-confidence.
      const args = getCallArgs(call);
      const isLiteralOnlyExec =
        !hasInjectionRisk &&
        !isBounded &&
        args.length > 0 &&
        args.every((a) => isLiteralOrLiteralArray(a) || a.getKind() === SyntaxKind.ObjectLiteralExpression);

      let description = `Spawns child process: ${methodName}()`;
      let severity: 'critical' | 'high' | 'medium' = 'critical';
      let confidence = 0.85;

      if (hasInjectionRisk) {
        description = `Command injection risk: ${methodName}() called with dynamic string argument`;
        confidence = 0.95;
      } else if (isBounded) {
        // Bounded pattern: literal command + argv, shell explicitly disabled
        // (or shell-less by default for execFile family). No injection vector.
        description = `Spawns child process: ${methodName}() with hardcoded args and shell disabled`;
        severity = 'medium';
        confidence = 0.5;
      } else if (isLiteralOnlyExec) {
        description = `Spawns child process: ${methodName}() with hardcoded command literal`;
        severity = 'high';
        confidence = 0.6;
      }

      findings.push({
        category: 'process-spawn',
        severity,
        location: getLocation(sourceFile, call.getStart(), relPath),
        description,
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence,
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
