import type {
  CodeFinding,
  PromptFinding,
  TaintFlow,
  MismatchFinding,
  PermissionManifest,
} from '@safeskill/shared';

/**
 * Synthesizes all findings into a structured permission manifest.
 */
export function inferPermissions(
  codeFindings: CodeFinding[],
  promptFindings: PromptFinding[],
  taintFlows: TaintFlow[],
  mismatches: MismatchFinding[],
): PermissionManifest {
  const manifest: PermissionManifest = {
    filesystem: { read: [], write: [], delete: [] },
    network: { outbound: [], inbound: false, domains: [] },
    environment: { variables: [], bulkAccess: false },
    process: { spawn: false, commands: [] },
    system: { crypto: false, nativeModules: false, installScripts: [] },
    dataFlows: taintFlows,
    promptRisks: {
      injectionAttempts: [],
      hiddenContent: [],
      descriptionMismatches: mismatches,
      manipulationPatterns: [],
    },
  };

  // Process code findings
  for (const finding of codeFindings) {
    switch (finding.category) {
      case 'filesystem-access':
        categorizeFilesystemFinding(finding, manifest);
        break;
      case 'network-access':
        categorizeNetworkFinding(finding, manifest);
        break;
      case 'env-access':
        categorizeEnvFinding(finding, manifest);
        break;
      case 'process-spawn':
        manifest.process.spawn = true;
        extractCommand(finding, manifest);
        break;
      case 'crypto-usage':
        manifest.system.crypto = true;
        break;
      case 'install-scripts':
        if (finding.codeSnippet) {
          manifest.system.installScripts.push(finding.codeSnippet);
        }
        break;
      case 'dynamic-require':
        manifest.system.nativeModules = true;
        break;
    }
  }

  // Process prompt findings
  for (const finding of promptFindings) {
    switch (finding.category) {
      case 'instruction-override':
      case 'persona-hijack':
      case 'delimiter-escape':
        manifest.promptRisks.injectionAttempts.push(finding);
        break;
      case 'hidden-text':
        manifest.promptRisks.hiddenContent.push(finding);
        break;
      case 'data-exfiltration-prompt':
      case 'tool-abuse':
      case 'indirect-injection':
        manifest.promptRisks.manipulationPatterns.push(finding);
        break;
      case 'cot-manipulation':
        manifest.promptRisks.manipulationPatterns.push(finding);
        break;
    }
  }

  // Deduplicate arrays
  manifest.filesystem.read = [...new Set(manifest.filesystem.read)];
  manifest.filesystem.write = [...new Set(manifest.filesystem.write)];
  manifest.filesystem.delete = [...new Set(manifest.filesystem.delete)];
  manifest.network.outbound = [...new Set(manifest.network.outbound)];
  manifest.network.domains = [...new Set(manifest.network.domains)];
  manifest.environment.variables = [...new Set(manifest.environment.variables)];
  manifest.process.commands = [...new Set(manifest.process.commands)];

  return manifest;
}

function categorizeFilesystemFinding(finding: CodeFinding, manifest: PermissionManifest): void {
  const snippet = finding.codeSnippet + ' ' + finding.description;

  if (/write|mkdir|appendFile|createWriteStream/i.test(snippet)) {
    manifest.filesystem.write.push(extractPath(snippet));
  } else if (/unlink|rmdir|rm|rmSync|delete/i.test(snippet)) {
    manifest.filesystem.delete.push(extractPath(snippet));
  } else {
    manifest.filesystem.read.push(extractPath(snippet));
  }
}

function categorizeNetworkFinding(finding: CodeFinding, manifest: PermissionManifest): void {
  const snippet = finding.codeSnippet + ' ' + finding.description;

  // Check for server/inbound indicators
  if (/createServer|listen\(|\.listen/i.test(snippet)) {
    manifest.network.inbound = true;
    return;
  }

  manifest.network.outbound.push(finding.description);

  // Extract domains from URLs in snippet
  const urlMatch = snippet.match(/https?:\/\/([^\/\s'"]+)/);
  if (urlMatch?.[1]) {
    manifest.network.domains.push(urlMatch[1]);
  }
}

function categorizeEnvFinding(finding: CodeFinding, manifest: PermissionManifest): void {
  const snippet = finding.codeSnippet + ' ' + finding.description;

  if (/Object\.keys|Object\.entries|\.\.\.process\.env|bulk/i.test(snippet)) {
    manifest.environment.bulkAccess = true;
  }

  // Extract specific env var names
  const envMatch = snippet.match(/process\.env\.(\w+)/);
  if (envMatch?.[1]) {
    manifest.environment.variables.push(envMatch[1]);
  }

  const bracketMatch = snippet.match(/process\.env\[['"](\w+)['"]\]/);
  if (bracketMatch?.[1]) {
    manifest.environment.variables.push(bracketMatch[1]);
  }
}

function extractCommand(finding: CodeFinding, manifest: PermissionManifest): void {
  const snippet = finding.codeSnippet;
  // Try to extract the command from exec/spawn calls
  const cmdMatch = snippet.match(/(?:exec|spawn|execSync|spawnSync|execFile)\s*\(\s*['"`]([^'"`]+)/);
  if (cmdMatch?.[1]) {
    manifest.process.commands.push(cmdMatch[1]);
  }
}

function extractPath(text: string): string {
  // Try to extract a file path from the text
  const pathMatch = text.match(/['"`]((?:~\/|\/|\.\/)[^'"`]+)['"`]/);
  if (pathMatch?.[1]) return pathMatch[1];

  const sensitiveMatch = text.match(/(~\/\.\w+[^\s'"]*)/);
  if (sensitiveMatch?.[1]) return sensitiveMatch[1];

  return 'unknown path';
}
