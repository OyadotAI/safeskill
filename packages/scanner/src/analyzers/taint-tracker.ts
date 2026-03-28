import type { TaintFlow, Severity } from '@safeskill/shared';
import type { FileAnalysis, CallInfo, ImportInfo } from './ast-analyzer.js';
import { DANGEROUS_MODULES, SENSITIVE_PATHS, SENSITIVE_ENV_VARS } from '@safeskill/shared';

/**
 * Taint Tracker — tracks data flow from sources to sinks.
 *
 * Sources: fs.readFile, process.env, os.homedir, os.userInfo, child_process output
 * Sinks: fetch, http.request, exec, WebSocket.send, fs.writeFile (to external paths)
 *
 * This is a simplified forward-taint analysis that works at the file level
 * by correlating sources and sinks found in the same file's call expressions.
 * A full interprocedural analysis would require a constraint solver — this is
 * a pragmatic first pass that catches the most common exfiltration patterns.
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
};

export function trackTaint(fileAnalyses: FileAnalysis[]): TaintFlow[] {
  const flows: TaintFlow[] = [];

  for (const file of fileAnalyses) {
    const fileSources = findSources(file);
    const fileSinks = findSinks(file);

    // For each source in this file, check if there's a sink
    // This is a co-occurrence heuristic: source + sink in same file = potential flow
    for (const source of fileSources) {
      for (const sink of fileSinks) {
        // Skip if source comes after sink (naive ordering by line number)
        if (source.location.line > sink.location.line) continue;

        const severity = combineSeverity(source.severity, sink.severity);

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
          severity,
        });
      }
    }

    // Also check env accesses flowing to sinks
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

    // Also catch standalone fetch
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

  // Look for encoding/serialization calls between source and sink
  for (const call of file.callExpressions) {
    if (call.location.line <= source.location.line) continue;
    if (call.location.line >= sink.location.line) continue;

    const isEncoding = /toString.*base64|btoa|JSON\.stringify|encodeURI|Buffer\.from/.test(call.expression);
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

  // Take the higher severity, but bump up if both are high+
  if (sourceIdx >= 3 && sinkIdx >= 3) return 'critical';
  return order[Math.max(sourceIdx, sinkIdx)]!;
}
