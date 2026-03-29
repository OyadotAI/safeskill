import type { TaintFlow, Severity } from '@safeskill/shared';
import type { FileAnalysis, CallInfo, ImportInfo } from './ast-analyzer.js';
import { DANGEROUS_MODULES, SENSITIVE_PATHS, SENSITIVE_ENV_VARS } from '@safeskill/shared';

/**
 * Taint Tracker — tracks data flow from sources to sinks.
 *
 * Layer 1: Intra-file taint (source + sink in same file)
 * Layer 2: Cross-file taint (exported source consumed by another file's sink)
 * Layer 3: Env var flows (sensitive env vars → network sinks)
 */

const SOURCE_PATTERNS: Record<string, { type: string; severity: Severity }> = {
  readFile: { type: 'fs.readFile', severity: 'high' },
  readFileSync: { type: 'fs.readFileSync', severity: 'high' },
  readdir: { type: 'fs.readdir', severity: 'medium' },
  readdirSync: { type: 'fs.readdirSync', severity: 'medium' },
  'fs.readFile': { type: 'fs.readFile', severity: 'high' },
  'fs.readFileSync': { type: 'fs.readFileSync', severity: 'high' },
  'fs.readdir': { type: 'fs.readdir', severity: 'medium' },
  'fs.readdirSync': { type: 'fs.readdirSync', severity: 'medium' },
  'fs.promises.readFile': { type: 'fs.promises.readFile', severity: 'high' },
  'fs.promises.readdir': { type: 'fs.promises.readdir', severity: 'medium' },
  homedir: { type: 'os.homedir', severity: 'medium' },
  'os.homedir': { type: 'os.homedir', severity: 'medium' },
  userInfo: { type: 'os.userInfo', severity: 'medium' },
  'os.userInfo': { type: 'os.userInfo', severity: 'medium' },
  // Worker thread sources
  'Worker': { type: 'worker_threads.Worker', severity: 'high' },
};

const SINK_PATTERNS: Record<string, { type: string; severity: Severity }> = {
  fetch: { type: 'fetch', severity: 'high' },
  'http.request': { type: 'http.request', severity: 'high' },
  'https.request': { type: 'https.request', severity: 'high' },
  'http.get': { type: 'http.get', severity: 'high' },
  'https.get': { type: 'https.get', severity: 'high' },
  'axios': { type: 'axios', severity: 'high' },
  'axios.post': { type: 'axios.post', severity: 'high' },
  'axios.get': { type: 'axios.get', severity: 'high' },
  'got': { type: 'got', severity: 'high' },
  'got.post': { type: 'got.post', severity: 'high' },
  exec: { type: 'child_process.exec', severity: 'critical' },
  execSync: { type: 'child_process.execSync', severity: 'critical' },
  spawn: { type: 'child_process.spawn', severity: 'critical' },
  spawnSync: { type: 'child_process.spawnSync', severity: 'critical' },
  'WebSocket.send': { type: 'WebSocket.send', severity: 'high' },
  // Additional sinks
  'request': { type: 'request', severity: 'high' },
  'superagent': { type: 'superagent', severity: 'high' },
  'undici.fetch': { type: 'undici.fetch', severity: 'high' },
  'undici.request': { type: 'undici.request', severity: 'high' },
};

export function trackTaint(fileAnalyses: FileAnalysis[]): TaintFlow[] {
  const flows: TaintFlow[] = [];

  // === Layer 1: Intra-file taint ===
  for (const file of fileAnalyses) {
    const fileSources = findSources(file);
    const fileSinks = findSinks(file);

    for (const source of fileSources) {
      for (const sink of fileSinks) {
        if (source.location.line > sink.location.line) continue;

        flows.push({
          source: {
            type: source.type,
            location: { file: file.filePath, line: source.location.line, column: source.location.column },
            description: source.description,
          },
          sink: {
            type: sink.type,
            location: { file: file.filePath, line: sink.location.line, column: sink.location.column },
            description: sink.description,
          },
          intermediateSteps: findIntermediateSteps(file, source, sink),
          severity: combineSeverity(source.severity, sink.severity),
        });
      }
    }

    // Env var flows
    for (const envAccess of file.envAccesses) {
      const isSensitive = envAccess.variable
        ? (SENSITIVE_ENV_VARS as readonly string[]).includes(envAccess.variable)
        : envAccess.isBulk;
      if (!isSensitive) continue;

      for (const sink of fileSinks) {
        if (envAccess.location.line > sink.location.line) continue;
        flows.push({
          source: {
            type: 'process.env',
            location: { file: file.filePath, line: envAccess.location.line, column: envAccess.location.column },
            description: envAccess.variable
              ? `Reads sensitive env var: ${envAccess.variable}`
              : 'Bulk access to process.env',
          },
          sink: {
            type: sink.type,
            location: { file: file.filePath, line: sink.location.line, column: sink.location.column },
            description: sink.description,
          },
          intermediateSteps: [],
          severity: 'critical',
        });
      }
    }
  }

  // === Layer 2: Cross-file taint ===
  // Build a map of files that have sources (fs/env) and files that have sinks (network)
  const filesWithSources: Array<{ file: FileAnalysis; sources: SourceInfo[] }> = [];
  const filesWithSinks: Array<{ file: FileAnalysis; sinks: SourceInfo[] }> = [];

  for (const file of fileAnalyses) {
    const sources = findSources(file);
    const sinks = findSinks(file);
    // Also consider files with sensitive env access as sources
    const envSources: SourceInfo[] = file.envAccesses
      .filter(e => e.variable ? (SENSITIVE_ENV_VARS as readonly string[]).includes(e.variable) : e.isBulk)
      .map(e => ({
        type: 'process.env',
        description: e.variable ? `Reads ${e.variable}` : 'Bulk env access',
        location: e.location,
        severity: 'high' as Severity,
      }));

    if (sources.length > 0 || envSources.length > 0) {
      filesWithSources.push({ file, sources: [...sources, ...envSources] });
    }
    if (sinks.length > 0) {
      filesWithSinks.push({ file, sinks });
    }
  }

  // Check if sink-files import from source-files (cross-file exfiltration)
  for (const sinkFile of filesWithSinks) {
    for (const imp of sinkFile.file.imports) {
      // Check if this import points to a file that has sources
      const importPath = imp.module.replace(/^\.\/|\.ts$|\.js$|\.mjs$/g, '');

      for (const sourceFile of filesWithSources) {
        if (sinkFile.file.filePath === sourceFile.file.filePath) continue;

        const sourceName = sourceFile.file.filePath.replace(/\.ts$|\.js$|\.mjs$/g, '');
        const matches = sourceName.endsWith(importPath) ||
          importPath.endsWith(sourceName.split('/').pop()!.replace(/\.\w+$/, ''));

        if (!matches) continue;

        // Cross-file flow detected
        for (const source of sourceFile.sources) {
          for (const sink of sinkFile.sinks) {
            flows.push({
              source: {
                type: source.type,
                location: { file: sourceFile.file.filePath, line: source.location.line, column: source.location.column },
                description: `${source.description} (cross-file)`,
              },
              sink: {
                type: sink.type,
                location: { file: sinkFile.file.filePath, line: sink.location.line, column: sink.location.column },
                description: `${sink.description} (via import from ${sourceFile.file.filePath})`,
              },
              intermediateSteps: [{
                description: `Data flows across module boundary: ${sourceFile.file.filePath} → ${sinkFile.file.filePath}`,
                location: { file: sinkFile.file.filePath, line: imp.location.line, column: imp.location.column },
              }],
              severity: 'critical',
            });
          }
        }
      }
    }
  }

  return flows;
}

interface SourceInfo {
  type: string;
  description: string;
  location: { line: number; column: number };
  severity: Severity;
}

function findSources(file: FileAnalysis): SourceInfo[] {
  const sources: SourceInfo[] = [];

  for (const call of file.callExpressions) {
    const match = SOURCE_PATTERNS[call.expression];
    if (match) {
      const isSensitivePath = call.arguments.some(arg =>
        SENSITIVE_PATHS.some(sp => arg.includes(sp.replace('~/', '')))
      );

      sources.push({
        type: match.type,
        description: isSensitivePath
          ? `${match.type}() reading sensitive path: ${call.arguments[0] ?? ''}`
          : `${match.type}() call`,
        location: { line: call.location.line, column: call.location.column },
        severity: isSensitivePath ? 'critical' : match.severity,
      });
    }
  }

  return sources;
}

function findSinks(file: FileAnalysis): SourceInfo[] {
  const sinks: SourceInfo[] = [];
  const networkModules: readonly string[] = DANGEROUS_MODULES.network;
  const hasNetworkImport = file.imports.some(imp =>
    networkModules.includes(imp.module)
  );

  for (const call of file.callExpressions) {
    const match = SINK_PATTERNS[call.expression];
    if (match) {
      sinks.push({
        type: match.type,
        description: `${match.type}() call`,
        location: { line: call.location.line, column: call.location.column },
        severity: match.severity,
      });
    }

    if (call.expression === 'fetch' || (hasNetworkImport && call.expression.includes('request'))) {
      if (!sinks.some(s => s.location.line === call.location.line)) {
        sinks.push({
          type: call.expression,
          description: `${call.expression}() network call`,
          location: { line: call.location.line, column: call.location.column },
          severity: 'high',
        });
      }
    }
  }

  return sinks;
}

function findIntermediateSteps(
  file: FileAnalysis,
  source: SourceInfo,
  sink: SourceInfo,
): TaintFlow['intermediateSteps'] {
  const steps: TaintFlow['intermediateSteps'] = [];

  for (const call of file.callExpressions) {
    if (call.location.line <= source.location.line) continue;
    if (call.location.line >= sink.location.line) continue;

    const isEncoding = /toString.*base64|btoa|atob|JSON\.stringify|encodeURI|Buffer\.from|Buffer\.alloc|\.toString\(|createHash|createHmac/.test(call.expression);
    if (isEncoding) {
      steps.push({
        description: `Data transformation: ${call.expression}`,
        location: { file: file.filePath, line: call.location.line, column: call.location.column },
      });
    }
  }

  return steps;
}

function combineSeverity(sourceSev: Severity, sinkSev: Severity): Severity {
  const order: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];
  const sourceIdx = order.indexOf(sourceSev);
  const sinkIdx = order.indexOf(sinkSev);
  if (sourceIdx >= 3 && sinkIdx >= 3) return 'critical';
  return order[Math.max(sourceIdx, sinkIdx)]!;
}
