import { SyntaxKind, type SourceFile } from 'ts-morph';
import type { CodeFinding } from '@safeskill/shared';
import { truncate } from '../utils.js';

/**
 * Install-scripts detector (AST level).
 *
 * The manifest-analyzer already checks package.json for install script declarations.
 * This detector analyzes the actual code files that install scripts reference,
 * looking for dangerous patterns like:
 * - Downloading and executing remote content (fetch -> eval, http.get -> pipe -> exec)
 * - Writing to system paths during install
 * - Spawning shells with inline scripts
 * - Deobfuscating and executing code
 */

const DOWNLOAD_FUNCTIONS = new Set([
  'fetch',
  'http.get',
  'https.get',
  'http.request',
  'https.request',
  'axios.get',
  'axios.post',
  'got',
  'got.get',
  'request',
  'request.get',
]);

const EXECUTE_FUNCTIONS = new Set([
  'eval',
  'exec',
  'execSync',
  'spawn',
  'spawnSync',
  'execFile',
  'execFileSync',
]);

const PIPE_METHODS = new Set([
  'pipe',
  'pipeline',
]);

function getLocation(sourceFile: SourceFile, pos: number, relPath: string) {
  const { line, column } = sourceFile.getLineAndColumnAtPos(pos);
  return { file: relPath, line, column };
}

/**
 * Whether a file path looks like it's referenced by an install script.
 * Install scripts typically reference files like `scripts/postinstall.js`,
 * `install.js`, etc. Files that aren't install scripts get reduced severity
 * for download-and-execute patterns since the same patterns are common in
 * legitimate tools (SSRF guards, browser automation, API clients).
 */
function looksLikeInstallScriptFile(relPath: string): boolean {
  const lower = relPath.toLowerCase();
  return (
    lower.includes('postinstall') ||
    lower.includes('preinstall') ||
    lower.includes('install.') ||
    lower.includes('scripts/setup') ||
    lower.includes('scripts/prepare')
  );
}

/**
 * SSRF guard / security validation patterns.
 * When functions with these names appear near fetch+exec code, it's a strong
 * signal that the code is VALIDATING requests, not maliciously executing them.
 * The security mechanism should not be flagged as the vulnerability.
 */
const SECURITY_GUARD_PATTERNS = /\b(validate|isPrivate|isLocal|blockList|blocklist|allowList|allowlist|denyList|denylist|ssrf|sanitize|safelist|safeList|isAllowed|isBlocked|checkUrl|verifyUrl|filterUrl)\b/i;

export function detect(sourceFile: SourceFile, relPath: string): CodeFinding[] {
  const findings: CodeFinding[] = [];
  const isInstallScript = looksLikeInstallScriptFile(relPath);

  // Check if the file contains security guard patterns (SSRF validation, allowlists, etc.)
  // If so, the fetch+exec combination is likely defensive, not malicious.
  const fileText = sourceFile.getFullText();
  const hasSecurityGuards = SECURITY_GUARD_PATTERNS.test(fileText);

  const allCalls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  // Build sets of what's present in the file
  const hasDownload = new Set<number>();
  const hasExecute = new Set<number>();
  const hasPipe = new Set<number>();

  for (const call of allCalls) {
    const exprText = call.getExpression().getText();
    const parts = exprText.split('.');
    const methodName = parts[parts.length - 1]!;

    if (DOWNLOAD_FUNCTIONS.has(exprText) || DOWNLOAD_FUNCTIONS.has(methodName)) {
      hasDownload.add(call.getStart());
    }
    if (EXECUTE_FUNCTIONS.has(exprText) || EXECUTE_FUNCTIONS.has(methodName)) {
      hasExecute.add(call.getStart());
    }
    if (PIPE_METHODS.has(methodName)) {
      hasPipe.add(call.getStart());
    }
  }

  // Pattern 1: fetch/http.get followed by eval — download-and-execute
  // In actual install scripts this is critical. In regular source files (CLI tools,
  // MCP servers, browser automation) fetch+exec co-occurrence is common and benign.
  // If security guards (SSRF validators, allowlists) are present, the code is
  // likely defensive — the security mechanism should not be flagged as malicious.
  if (hasDownload.size > 0 && hasExecute.size > 0) {
    // Skip entirely if security guard patterns are present in a non-install file
    if (isInstallScript || !hasSecurityGuards) {
      for (const call of allCalls) {
        const exprText = call.getExpression().getText();
        const parts = exprText.split('.');
        const methodName = parts[parts.length - 1]!;

        if (DOWNLOAD_FUNCTIONS.has(exprText) || DOWNLOAD_FUNCTIONS.has(methodName)) {
          findings.push({
            category: 'install-scripts',
            severity: isInstallScript ? 'critical' : 'low',
            location: getLocation(sourceFile, call.getStart(), relPath),
            description: isInstallScript
              ? `Download-and-execute pattern: ${exprText}() with subsequent code execution in install script`
              : `File has both network fetch and code execution (common in tools/servers)`,
            codeSnippet: truncate(call.getText().trim(), 120),
            confidence: isInstallScript ? 0.9 : 0.3,
          });
          break; // report once per file
        }
      }
    }
  }

  // Pattern 2: http.get -> pipe -> exec (streaming download to execution)
  if (hasDownload.size > 0 && hasPipe.size > 0) {
    for (const call of allCalls) {
      const exprText = call.getExpression().getText();
      const parts = exprText.split('.');
      const methodName = parts[parts.length - 1]!;

      if (PIPE_METHODS.has(methodName)) {
        // Check if the pipe target involves execution or writing
        const pipeArgs = call.getArguments();
        for (const arg of pipeArgs) {
          const argText = arg.getText();
          if (
            argText.includes('exec') ||
            argText.includes('spawn') ||
            argText.includes('createWriteStream')
          ) {
            findings.push({
              category: 'install-scripts',
              severity: 'critical',
              location: getLocation(sourceFile, call.getStart(), relPath),
              description: 'Pipes downloaded content to execution or file write',
              codeSnippet: truncate(call.getText().trim(), 120),
              confidence: 0.9,
            });
            break;
          }
        }
      }
    }
  }

  // Pattern 3: Fetching a URL then calling .then(eval) or response.text().then(eval)
  for (const call of allCalls) {
    const exprText = call.getExpression().getText();
    const parts = exprText.split('.');
    const methodName = parts[parts.length - 1]!;

    if (methodName === 'then' || methodName === 'catch') {
      const args = call.getArguments();
      for (const arg of args) {
        const argText = arg.getText();
        if (argText === 'eval' || argText.includes('eval(') || argText.includes('Function(')) {
          findings.push({
            category: 'install-scripts',
            severity: 'critical',
            location: getLocation(sourceFile, call.getStart(), relPath),
            description: 'Promise chain passes downloaded content directly to eval/Function',
            codeSnippet: truncate(call.getText().trim(), 120),
            confidence: 0.95,
          });
        }
      }
    }
  }

  // Pattern 4: Dynamic script construction with download URLs in exec/spawn
  for (const call of allCalls) {
    const exprText = call.getExpression().getText();
    const parts = exprText.split('.');
    const methodName = parts[parts.length - 1]!;

    if (!EXECUTE_FUNCTIONS.has(methodName) && !EXECUTE_FUNCTIONS.has(exprText)) continue;

    for (const arg of call.getArguments()) {
      const argText = arg.getText();
      if (
        argText.includes('curl ') ||
        argText.includes('wget ') ||
        argText.includes('http://') ||
        argText.includes('https://')
      ) {
        findings.push({
          category: 'install-scripts',
          severity: 'critical',
          location: getLocation(sourceFile, call.getStart(), relPath),
          description: `Shell execution with download command: ${methodName}() contains URL or curl/wget`,
          codeSnippet: truncate(call.getText().trim(), 120),
          confidence: 0.95,
        });
        break;
      }
    }
  }

  // Pattern 5: Writing downloaded content to disk then executing it
  const hasCreateWriteStream = allCalls.some((call) => {
    const exprText = call.getExpression().getText();
    return exprText.includes('createWriteStream');
  });

  if (hasDownload.size > 0 && hasCreateWriteStream && hasExecute.size > 0) {
    findings.push({
      category: 'install-scripts',
      severity: isInstallScript ? 'critical' : 'medium',
      location: { file: relPath, line: 1, column: 1 },
      description: isInstallScript
        ? 'Install script downloads content to disk and executes it (download-write-execute pattern)'
        : 'File has download, write, and execute calls (common in build tools)',
      codeSnippet: '',
      confidence: isInstallScript ? 0.85 : 0.3,
    });
  }

  return findings;
}
