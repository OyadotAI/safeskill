import { SyntaxKind, type SourceFile } from 'ts-morph';
import type { CodeFinding, Severity } from '@safeskill/shared';
import { DANGEROUS_MODULES } from '@safeskill/shared';
import { truncate } from '../utils.js';

const CRYPTO_MODULES = new Set<string>(DANGEROUS_MODULES.crypto);
const NETWORK_MODULES = new Set<string>(DANGEROUS_MODULES.network);

const CRYPTO_METHODS = new Set([
  'createCipher',
  'createCipheriv',
  'createDecipher',
  'createDecipheriv',
  'createHash',
  'createHmac',
  'createSign',
  'createVerify',
  'publicEncrypt',
  'privateDecrypt',
  'generateKeyPair',
  'generateKeyPairSync',
  'randomBytes',
  'scrypt',
  'scryptSync',
  'pbkdf2',
  'pbkdf2Sync',
]);

function getLocation(sourceFile: SourceFile, pos: number, relPath: string) {
  const { line, column } = sourceFile.getLineAndColumnAtPos(pos);
  return { file: relPath, line, column };
}

export function detect(sourceFile: SourceFile, relPath: string): CodeFinding[] {
  const findings: CodeFinding[] = [];
  let hasCryptoImport = false;
  let hasNetworkImport = false;

  // Scan imports to determine context
  for (const decl of sourceFile.getImportDeclarations()) {
    const mod = decl.getModuleSpecifierValue();
    if (CRYPTO_MODULES.has(mod)) hasCryptoImport = true;
    if (NETWORK_MODULES.has(mod)) hasNetworkImport = true;
  }

  // Also check require calls for context
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.Identifier || expr.getText() !== 'require') continue;

    const args = call.getArguments();
    if (args.length === 0) continue;
    const firstArg = args[0]!;
    if (firstArg.getKind() !== SyntaxKind.StringLiteral) continue;

    const modName = firstArg.getText().slice(1, -1);
    if (CRYPTO_MODULES.has(modName)) hasCryptoImport = true;
    if (NETWORK_MODULES.has(modName)) hasNetworkImport = true;
  }

  // Detect crypto module imports
  for (const decl of sourceFile.getImportDeclarations()) {
    const mod = decl.getModuleSpecifierValue();
    if (CRYPTO_MODULES.has(mod)) {
      const severity: Severity = hasNetworkImport ? 'high' : 'low';
      findings.push({
        category: 'crypto-usage',
        severity,
        location: getLocation(sourceFile, decl.getStart(), relPath),
        description: hasNetworkImport
          ? `Imports crypto module "${mod}" (co-occurs with network access)`
          : `Imports crypto module "${mod}"`,
        codeSnippet: truncate(decl.getText().trim(), 120),
        confidence: 0.8,
      });
    }
  }

  // Detect crypto method calls
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();
    const parts = exprText.split('.');
    const methodName = parts[parts.length - 1]!;

    if (CRYPTO_METHODS.has(methodName) && hasCryptoImport) {
      const severity: Severity = hasNetworkImport ? 'high' : 'low';
      findings.push({
        category: 'crypto-usage',
        severity,
        location: getLocation(sourceFile, call.getStart(), relPath),
        description: hasNetworkImport
          ? `Crypto operation ${methodName}() near network code (potential exfiltration prep)`
          : `Crypto operation: ${methodName}()`,
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence: hasNetworkImport ? 0.85 : 0.6,
      });
    }
  }

  // Detect base64 encoding: Buffer.from().toString('base64')
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();

    // .toString('base64')
    if (exprText.endsWith('.toString')) {
      const args = call.getArguments();
      if (args.length > 0) {
        const argText = args[0]!.getText();
        if (argText === "'base64'" || argText === '"base64"') {
          const severity: Severity = hasNetworkImport ? 'high' : 'low';
          findings.push({
            category: 'crypto-usage',
            severity,
            location: getLocation(sourceFile, call.getStart(), relPath),
            description: hasNetworkImport
              ? 'Base64 encoding near network code (potential data exfiltration)'
              : 'Base64 encoding',
            codeSnippet: truncate(call.getText().trim(), 120),
            confidence: hasNetworkImport ? 0.8 : 0.5,
          });
        }
      }
    }

    // Buffer.from(x, 'base64')
    if (exprText === 'Buffer.from') {
      const args = call.getArguments();
      if (args.length >= 2) {
        const secondArg = args[1]!.getText();
        if (secondArg === "'base64'" || secondArg === '"base64"') {
          findings.push({
            category: 'crypto-usage',
            severity: hasNetworkImport ? 'high' : 'low',
            location: getLocation(sourceFile, call.getStart(), relPath),
            description: 'Base64 decoding via Buffer.from',
            codeSnippet: truncate(call.getText().trim(), 120),
            confidence: 0.7,
          });
        }
      }
    }

    // btoa / atob
    if (exprText === 'btoa' || exprText === 'atob') {
      const severity: Severity = hasNetworkImport ? 'high' : 'low';
      findings.push({
        category: 'crypto-usage',
        severity,
        location: getLocation(sourceFile, call.getStart(), relPath),
        description: hasNetworkImport
          ? `${exprText}() near network code (potential data encoding for exfiltration)`
          : `${exprText}() encoding/decoding`,
        codeSnippet: truncate(call.getText().trim(), 120),
        confidence: hasNetworkImport ? 0.75 : 0.5,
      });
    }
  }

  return findings;
}
