import { readFile, access } from 'fs/promises';
import path from 'path';
import type { CodeFinding } from '@safeskill/shared';

/** Files whose presence indicates a non-JavaScript/TypeScript project. */
const NON_JS_PROJECT_MARKERS = [
  'pyproject.toml',
  'setup.py',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'Gemfile',
  'mix.exs',
  'composer.json',
];

async function isNonJsProject(dir: string): Promise<boolean> {
  for (const marker of NON_JS_PROJECT_MARKERS) {
    try {
      await access(path.join(dir, marker));
      return true;
    } catch {
      // file doesn't exist, continue
    }
  }
  return false;
}

/** Detected package type — affects scoring expectations. */
export type PackageType = 'cli-tool' | 'mcp-server' | 'library' | 'skill' | 'unknown';

export interface ManifestResult {
  findings: CodeFinding[];
  hasInstallScripts: boolean;
  hasSkillManifest: boolean;
  hasReadme: boolean;
  hasRepository: boolean;
  hasTypes: boolean;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  /** Detected package type — CLI tools get different scoring expectations. */
  packageType: PackageType;
}

const DANGEROUS_INSTALL_PATTERNS = [
  /curl\s/,
  /wget\s/,
  /node\s+-e\s/,
  /npx\s/,
  /sh\s+-c\s/,
  /bash\s+-c\s/,
  /powershell/i,
];

/**
 * Install scripts that are benign — common build/setup commands that
 * do not download, execute remote code, or modify system state.
 * These get severity 'info' instead of the default 'high'.
 */
const BENIGN_INSTALL_PATTERNS = [
  /^\s*echo\s/,                // echo "Done!", echo "Install complete"
  /^\s*echo$/,                 // bare echo (prints newline)
  /^\s*true\s*$/,              // no-op
  /^\s*exit\s+0\s*$/,          // explicit success exit
  /^\s*tsc\b/,                 // TypeScript compilation
  /^\s*node\s+[\w./\-]+\.m?[jt]s/,  // node build.js, node scripts/postinstall.js (not -e)
  /^\s*husky\s/,               // husky install
  /^\s*patch-package\b/,       // patch-package
  /^\s*ngcc\b/,                // Angular compiler
  /^\s*prisma\s+generate\b/,   // Prisma client generation
  /^\s*esbuild\b/,             // esbuild
  /^\s*rimraf\b/,              // rimraf (cleanup)
  /^\s*shx\s/,                 // shx (shell commands cross-platform)
  /^\s*opencollective\b/,      // opencollective postinstall
  /^\s*is-ci\b/,               // is-ci && ... (conditional CI scripts)
];

export async function analyzeManifest(dir: string): Promise<ManifestResult> {
  const findings: CodeFinding[] = [];
  let hasInstallScripts = false;
  let hasSkillManifest = false;
  let hasReadme = false;
  let hasRepository = false;
  let hasTypes = false;
  let dependencies: Record<string, string> = {};
  let devDependencies: Record<string, string> = {};

  // Read package.json
  let pkg: Record<string, unknown>;
  try {
    const raw = await readFile(path.join(dir, 'package.json'), 'utf-8');
    pkg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Only flag missing package.json for JavaScript/TypeScript projects
    if (!(await isNonJsProject(dir))) {
      findings.push({
        category: 'install-scripts',
        severity: 'medium',
        location: { file: 'package.json', line: 0, column: 0 },
        description: 'Missing or invalid package.json',
        codeSnippet: '',
        confidence: 1.0,
      });
    }
    return { findings, hasInstallScripts, hasSkillManifest, hasReadme, hasRepository, hasTypes, dependencies, devDependencies, packageType: 'unknown' as PackageType };
  }

  dependencies = (pkg.dependencies as Record<string, string>) ?? {};
  devDependencies = (pkg.devDependencies as Record<string, string>) ?? {};

  // Detect npm security holding packages — these replaced known-malicious packages
  const description = ((pkg.description as string) ?? '').toLowerCase();
  const version = (pkg.version as string) ?? '';
  const repo = typeof pkg.repository === 'string' ? pkg.repository : ((pkg.repository as Record<string, string>)?.url ?? '');
  if (
    description.includes('security holding package') ||
    version.endsWith('-security') ||
    repo === 'npm/security-holder'
  ) {
    findings.push({
      category: 'install-scripts',
      severity: 'critical',
      location: { file: 'package.json', line: 0, column: 0 },
      description: `This package was removed by npm for security reasons and replaced with a placeholder (version: ${version})`,
      codeSnippet: `"description": "${pkg.description}"`,
      confidence: 1.0,
    });
  }

  // Check install scripts
  const scripts = (pkg.scripts as Record<string, string>) ?? {};
  const dangerousScriptKeys = ['preinstall', 'postinstall', 'preuninstall', 'postuninstall', 'prepare'];

  for (const key of dangerousScriptKeys) {
    const script = scripts[key];
    if (!script) continue;

    hasInstallScripts = true;
    let severity: CodeFinding['severity'] = 'high';
    let description = `Has ${key} script: "${script}"`;

    // Check for dangerous patterns first (highest priority)
    let isDangerous = false;
    for (const pattern of DANGEROUS_INSTALL_PATTERNS) {
      if (pattern.test(script)) {
        severity = 'critical';
        description = `${key} script downloads/executes remote code: "${script}"`;
        isDangerous = true;
        break;
      }
    }

    // If not dangerous, check if it's a known benign pattern
    if (!isDangerous && BENIGN_INSTALL_PATTERNS.some(p => p.test(script))) {
      severity = 'info';
      description = `Has ${key} script (benign): "${script}"`;
    }

    findings.push({
      category: 'install-scripts',
      severity,
      location: { file: 'package.json', line: 0, column: 0 },
      description,
      codeSnippet: `"${key}": "${script}"`,
      confidence: 1.0,
    });
  }

  // Check for binary declarations (can be suspicious)
  if (pkg.bin) {
    const binEntries = typeof pkg.bin === 'string' ? 1 : Object.keys(pkg.bin as object).length;
    if (binEntries > 5) {
      findings.push({
        category: 'install-scripts',
        severity: 'medium',
        location: { file: 'package.json', line: 0, column: 0 },
        description: `Declares ${binEntries} binary executables (unusually high)`,
        codeSnippet: JSON.stringify(pkg.bin).slice(0, 120),
        confidence: 0.6,
      });
    }
  }

  // Check metadata
  hasRepository = !!(pkg.repository || (typeof pkg.repository === 'object' && (pkg.repository as Record<string, string>).url));
  hasTypes = !!(pkg.types || pkg.typings);

  // Check for safeskill manifest
  try {
    await readFile(path.join(dir, 'safeskill.manifest.json'), 'utf-8');
    hasSkillManifest = true;
  } catch {
    // no manifest
  }

  // Check for README
  try {
    const readmeNames = ['README.md', 'readme.md', 'README', 'README.txt'];
    for (const name of readmeNames) {
      try {
        await readFile(path.join(dir, name), 'utf-8');
        hasReadme = true;
        break;
      } catch {
        // try next
      }
    }
  } catch {
    // no readme
  }

  // Missing metadata warnings
  if (!hasRepository) {
    findings.push({
      category: 'install-scripts',
      severity: 'low',
      location: { file: 'package.json', line: 0, column: 0 },
      description: 'No repository URL in package.json (reduced transparency)',
      codeSnippet: '',
      confidence: 0.8,
    });
  }

  if (!hasReadme) {
    findings.push({
      category: 'install-scripts',
      severity: 'low',
      location: { file: 'package.json', line: 0, column: 0 },
      description: 'No README file (reduced transparency)',
      codeSnippet: '',
      confidence: 0.8,
    });
  }

  // Detect package type — affects scoring expectations
  const packageType = detectPackageType(pkg, dependencies);

  return {
    findings,
    hasInstallScripts,
    hasSkillManifest,
    hasReadme,
    hasRepository,
    hasTypes,
    dependencies,
    devDependencies,
    packageType,
  };
}

/**
 * Detect what type of package this is based on metadata, dependencies, and keywords.
 * CLI tools and dev tools are EXPECTED to use child_process and filesystem —
 * these capabilities should not penalize their score.
 */
function detectPackageType(pkg: Record<string, unknown>, deps: Record<string, string>): PackageType {
  const name = ((pkg.name as string) ?? '').toLowerCase();
  const desc = ((pkg.description as string) ?? '').toLowerCase();
  const keywords = ((pkg.keywords as string[]) ?? []).map(k => k.toLowerCase());
  const hasBin = !!pkg.bin;
  const allText = `${name} ${desc} ${keywords.join(' ')}`;

  // MCP-server indicators come FIRST. Most MCP servers ship a `bin` entry
  // so clients can `npx` them, which previously caused them to be classified
  // as CLI tools and have their code scan short-circuited in scoring.
  // Check the strongest signal — actually depending on the MCP SDK — before
  // any keyword heuristics so tools that merely mention "mcp" in their
  // description (e.g. a tool that scans MCP servers) aren't miscategorized.
  if (deps['@modelcontextprotocol/sdk'] || deps['mcp-framework']) return 'mcp-server';
  if (keywords.some(k => k === 'mcp-server' || k === 'mcp_server' || k === 'modelcontextprotocol')) {
    return 'mcp-server';
  }
  if (/\bmcp\s+server\b/.test(allText) || /-mcp($|-)/.test(name) || /^mcp-/.test(name)) {
    return 'mcp-server';
  }

  // CLI tool indicators
  if (hasBin) return 'cli-tool';
  if (keywords.some(k => ['cli', 'command-line', 'terminal', 'shell', 'devtool', 'dev-tool'].includes(k))) return 'cli-tool';
  if (allText.includes('cli') && (allText.includes('tool') || allText.includes('command'))) return 'cli-tool';
  if (deps['commander'] || deps['yargs'] || deps['meow'] || deps['cac'] || deps['clipanion'] || deps['oclif']) return 'cli-tool';

  // Skill indicators
  if (keywords.some(k => ['claude-skill', 'claude-code', 'openclaw', 'ai-skill'].includes(k))) return 'skill';
  if (allText.includes('skill') && (allText.includes('claude') || allText.includes('ai'))) return 'skill';

  return 'library';
}
