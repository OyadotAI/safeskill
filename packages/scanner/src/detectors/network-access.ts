import { SyntaxKind, type SourceFile } from 'ts-morph';
import type { CodeFinding, Severity } from '@safeskill/shared';
import { DANGEROUS_MODULES } from '@safeskill/shared';
import { truncate } from '../utils.js';

const NETWORK_MODULES = new Set<string>(DANGEROUS_MODULES.network);
const FS_MODULES = new Set<string>(DANGEROUS_MODULES.filesystem);

const NETWORK_CALL_PATTERNS = new Set([
  'fetch',
  'request',
  'get',
  'post',
  'put',
  'patch',
  'delete',
]);

const QUALIFIED_NETWORK_CALLS = new Set([
  'http.request',
  'http.get',
  'https.request',
  'https.get',
  'http.createServer',
  'https.createServer',
  'net.createConnection',
  'net.connect',
  'net.createServer',
  'dgram.createSocket',
  'axios.get',
  'axios.post',
  'axios.put',
  'axios.patch',
  'axios.delete',
  'axios.request',
  'got.get',
  'got.post',
  'got.put',
  'got.patch',
  'got.delete',
]);

const SAFE_URL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'example.com',
  'schema.org',
  'json-schema.org',
  'w3.org',
  'github.com',
  'npmjs.com',
  'nodejs.org',
]);

function getLocation(sourceFile: SourceFile, pos: number, relPath: string) {
  const { line, column } = sourceFile.getLineAndColumnAtPos(pos);
  return { file: relPath, line, column };
}

export function detect(sourceFile: SourceFile, relPath: string): CodeFinding[] {
  const findings: CodeFinding[] = [];
  let hasNetworkImport = false;
  let hasFsImport = false;

  // Check imports
  for (const decl of sourceFile.getImportDeclarations()) {
    const mod = decl.getModuleSpecifierValue();
    if (NETWORK_MODULES.has(mod)) {
      hasNetworkImport = true;
      findings.push({
        category: 'network-access',
        severity: 'medium',
        location: getLocation(sourceFile, decl.getStart(), relPath),
        description: `Imports network module "${mod}"`,
        codeSnippet: truncate(decl.getText().trim(), 120),
        confidence: 1.0,
      });
    }
    if (FS_MODULES.has(mod)) {
      hasFsImport = true;
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
    if (NETWORK_MODULES.has(modName)) {
      hasNetworkImport = true;
      findings.push({
        category: 'network-access',
        severity: 'medium',
        location: getLocation(sourceFile, call.getStart(), relPath),
        description: `Requires network module "${modName}"`,
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence: 1.0,
      });
    }
    if (FS_MODULES.has(modName)) {
      hasFsImport = true;
    }
  }

  // Check for fetch(), http.request(), etc.
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();

    let isNetworkCall = false;
    let description = '';

    if (QUALIFIED_NETWORK_CALLS.has(exprText)) {
      isNetworkCall = true;
      description = `Network call: ${exprText}()`;
    } else if (exprText === 'fetch') {
      isNetworkCall = true;
      description = 'Makes HTTP request via fetch()';
    } else if (NETWORK_CALL_PATTERNS.has(exprText) && hasNetworkImport) {
      isNetworkCall = true;
      description = `Network call: ${exprText}()`;
    }

    if (!isNetworkCall) continue;

    // Check if it contains a URL with external host
    let hasExternalUrl = false;
    for (const arg of call.getArguments()) {
      const argText = arg.getText();
      const urlMatch = argText.match(/https?:\/\/([^/'"\s:]+)/);
      if (urlMatch) {
        const host = urlMatch[1]!;
        if (!SAFE_URL_HOSTS.has(host)) {
          hasExternalUrl = true;
        }
      }
    }

    // Co-occurrence: fs import + network call = critical
    const severity: Severity = hasFsImport ? 'critical' : hasExternalUrl ? 'high' : 'medium';

    if (hasFsImport && severity === 'critical') {
      description += ' (co-occurs with filesystem access — potential data exfiltration)';
    }

    findings.push({
      category: 'network-access',
      severity,
      location: getLocation(sourceFile, call.getStart(), relPath),
      description,
      codeSnippet: truncate(call.getText().trim(), 120),
      confidence: severity === 'critical' ? 0.9 : 0.8,
    });
  }

  // WebSocket connections
  for (const newExpr of sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    const exprText = newExpr.getExpression().getText();
    if (exprText === 'WebSocket' || exprText === 'WebSocket.Server' || exprText === 'Server') {
      findings.push({
        category: 'network-access',
        severity: 'high',
        location: getLocation(sourceFile, newExpr.getStart(), relPath),
        description: 'Opens WebSocket connection',
        codeSnippet: truncate(newExpr.getText().trim(), 120),
        confidence: 0.9,
      });
    }
  }

  // new URL() with external hosts
  for (const newExpr of sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    const exprText = newExpr.getExpression().getText();
    if (exprText !== 'URL') continue;

    const args = newExpr.getArguments();
    if (args.length === 0) continue;
    const firstArg = args[0]!;
    const argText = firstArg.getText();

    const urlMatch = argText.match(/https?:\/\/([^/'"\s:]+)/);
    if (urlMatch) {
      const host = urlMatch[1]!;
      if (!SAFE_URL_HOSTS.has(host)) {
        findings.push({
          category: 'network-access',
          severity: 'medium',
          location: getLocation(sourceFile, newExpr.getStart(), relPath),
          description: `Constructs URL to external host: ${host}`,
          codeSnippet: truncate(newExpr.getText().trim(), 120),
          confidence: 0.7,
        });
      }
    }
  }

  return findings;
}
