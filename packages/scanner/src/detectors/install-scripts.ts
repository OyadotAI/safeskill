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

export function detect(sourceFile: SourceFile, relPath: string): CodeFinding[] {
  const findings: CodeFinding[] = [];

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
  if (hasDownload.size > 0 && hasExecute.size > 0) {
    // Find the download call for location
    for (const call of allCalls) {
      const exprText = call.getExpression().getText();
      const parts = exprText.split('.');
      const methodName = parts[parts.length - 1]!;

      if (DOWNLOAD_FUNCTIONS.has(exprText) || DOWNLOAD_FUNCTIONS.has(methodName)) {
        findings.push({
          category: 'install-scripts',
          severity: 'critical',
          location: getLocation(sourceFile, call.getStart(), relPath),
          description: `Download-and-execute pattern: ${exprText}() with subsequent code execution in same file`,
          codeSnippet: truncate(call.getText().trim(), 120),
          confidence: 0.9,
        });
        break; // report once per file
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
      severity: 'critical',
      location: { file: relPath, line: 1, column: 1 },
      description: 'File downloads content to disk and executes it (download-write-execute pattern)',
      codeSnippet: '',
      confidence: 0.85,
    });
  }

  return findings;
}
