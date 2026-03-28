import { SyntaxKind, type SourceFile } from 'ts-morph';
import type { CodeFinding, Severity } from '@safeskill/shared';
import { SENSITIVE_PATHS, DANGEROUS_MODULES } from '@safeskill/shared';
import { truncate } from '../utils.js';

const FS_MODULES = new Set<string>(DANGEROUS_MODULES.filesystem);

const WRITE_DELETE_OPS = new Set([
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'unlink',
  'unlinkSync',
  'rmdir',
  'rmdirSync',
  'rm',
  'rmSync',
  'rename',
  'renameSync',
  'copyFile',
  'copyFileSync',
  'mkdir',
  'mkdirSync',
  'chmod',
  'chmodSync',
  'chown',
  'chownSync',
  'truncate',
  'truncateSync',
  'createWriteStream',
]);

const READ_OPS = new Set([
  'readFile',
  'readFileSync',
  'readdir',
  'readdirSync',
  'stat',
  'statSync',
  'lstat',
  'lstatSync',
  'access',
  'accessSync',
  'exists',
  'existsSync',
  'realpath',
  'realpathSync',
  'createReadStream',
  'open',
  'openSync',
  'opendir',
  'opendirSync',
  'watch',
  'watchFile',
]);

const ALL_FS_OPS = new Set([...WRITE_DELETE_OPS, ...READ_OPS]);

function isSensitivePath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/');
  return SENSITIVE_PATHS.some((sp) => normalized.includes(sp.replace('~/', '')));
}

function getLocation(sourceFile: SourceFile, pos: number, relPath: string) {
  const { line, column } = sourceFile.getLineAndColumnAtPos(pos);
  return { file: relPath, line, column };
}

export function detect(sourceFile: SourceFile, relPath: string): CodeFinding[] {
  const findings: CodeFinding[] = [];
  let hasfsImport = false;

  // Check imports
  for (const decl of sourceFile.getImportDeclarations()) {
    const mod = decl.getModuleSpecifierValue();
    if (FS_MODULES.has(mod)) {
      hasfsImport = true;
      findings.push({
        category: 'filesystem-access',
        severity: 'medium',
        location: getLocation(sourceFile, decl.getStart(), relPath),
        description: `Imports filesystem module "${mod}"`,
        codeSnippet: truncate(decl.getText().trim(), 120),
        confidence: 1.0,
      });
    }
  }

  // Check require calls for fs modules
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.Identifier || expr.getText() !== 'require') continue;

    const args = call.getArguments();
    if (args.length === 0) continue;
    const firstArg = args[0]!;
    if (firstArg.getKind() !== SyntaxKind.StringLiteral) continue;

    const modName = firstArg.getText().slice(1, -1); // strip quotes
    if (FS_MODULES.has(modName)) {
      hasfsImport = true;
      findings.push({
        category: 'filesystem-access',
        severity: 'medium',
        location: getLocation(sourceFile, call.getStart(), relPath),
        description: `Requires filesystem module "${modName}"`,
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence: 1.0,
      });
    }
  }

  // Check call expressions for fs operations
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();

    // Extract the method name (e.g. "fs.readFileSync" -> "readFileSync")
    const parts = exprText.split('.');
    const methodName = parts[parts.length - 1]!;

    if (!ALL_FS_OPS.has(methodName)) continue;

    // Only flag if there's an fs import or the expression looks like fs.method / fsPromises.method
    const isQualifiedCall =
      hasfsImport ||
      /^(?:fs|fsp|fsPromises|fse|gracefulFs)\b/.test(exprText) ||
      /^(?:promises)\b/.test(parts.length > 1 ? parts[parts.length - 2]! : '');

    if (!isQualifiedCall && parts.length === 1) continue; // bare function name without import context

    const isWrite = WRITE_DELETE_OPS.has(methodName);

    // Check args for sensitive paths
    let hasSensitivePath = false;
    let sensitivePathValue = '';
    for (const arg of call.getArguments()) {
      if (arg.getKind() === SyntaxKind.StringLiteral || arg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
        const val = arg.getText().slice(1, -1);
        if (isSensitivePath(val)) {
          hasSensitivePath = true;
          sensitivePathValue = val;
          break;
        }
      }
      if (arg.getKind() === SyntaxKind.TemplateExpression) {
        const templateText = arg.getText();
        if (isSensitivePath(templateText)) {
          hasSensitivePath = true;
          sensitivePathValue = truncate(templateText, 60);
          break;
        }
      }
    }

    let severity: Severity;
    let description: string;

    if (hasSensitivePath && isWrite) {
      severity = 'critical';
      description = `Writes/deletes to sensitive path: ${sensitivePathValue}`;
    } else if (hasSensitivePath) {
      severity = 'high';
      description = `Reads from sensitive path: ${sensitivePathValue}`;
    } else if (isWrite) {
      severity = 'medium';
      description = `Filesystem write/delete operation: ${methodName}()`;
    } else {
      severity = 'medium';
      description = `Filesystem read operation: ${methodName}()`;
    }

    findings.push({
      category: 'filesystem-access',
      severity,
      location: getLocation(sourceFile, call.getStart(), relPath),
      description,
      codeSnippet: truncate(call.getText().trim(), 120),
      confidence: hasSensitivePath ? 0.95 : 0.85,
    });
  }

  // Check for sensitive path string literals even outside fs calls
  for (const literal of sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    const val = literal.getLiteralValue();
    if (isSensitivePath(val)) {
      // Skip if already in an fs call (avoid duplicates) - check parent
      const parent = literal.getParent();
      if (parent?.getKind() === SyntaxKind.CallExpression) continue;
      const grandparent = parent?.getParent();
      if (grandparent?.getKind() === SyntaxKind.CallExpression) continue;

      findings.push({
        category: 'filesystem-access',
        severity: 'high',
        location: getLocation(sourceFile, literal.getStart(), relPath),
        description: `References sensitive path: ${truncate(val, 60)}`,
        codeSnippet: truncate(literal.getText().trim(), 120),
        confidence: 0.8,
      });
    }
  }

  return findings;
}
