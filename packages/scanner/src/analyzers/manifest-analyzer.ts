import { readFile } from 'fs/promises';
import path from 'path';
import type { CodeFinding } from '@safeskill/shared';

export interface ManifestResult {
  findings: CodeFinding[];
  hasInstallScripts: boolean;
  hasSkillManifest: boolean;
  hasReadme: boolean;
  hasRepository: boolean;
  hasTypes: boolean;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
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
    findings.push({
      category: 'install-scripts',
      severity: 'medium',
      location: { file: 'package.json', line: 0, column: 0 },
      description: 'Missing or invalid package.json',
      codeSnippet: '',
      confidence: 1.0,
    });
    return { findings, hasInstallScripts, hasSkillManifest, hasReadme, hasRepository, hasTypes, dependencies, devDependencies };
  }

  dependencies = (pkg.dependencies as Record<string, string>) ?? {};
  devDependencies = (pkg.devDependencies as Record<string, string>) ?? {};

  // Check install scripts
  const scripts = (pkg.scripts as Record<string, string>) ?? {};
  const dangerousScriptKeys = ['preinstall', 'postinstall', 'preuninstall', 'postuninstall', 'prepare'];

  for (const key of dangerousScriptKeys) {
    const script = scripts[key];
    if (!script) continue;

    hasInstallScripts = true;
    let severity: CodeFinding['severity'] = 'high';
    let description = `Has ${key} script: "${script}"`;

    for (const pattern of DANGEROUS_INSTALL_PATTERNS) {
      if (pattern.test(script)) {
        severity = 'critical';
        description = `${key} script downloads/executes remote code: "${script}"`;
        break;
      }
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

  return {
    findings,
    hasInstallScripts,
    hasSkillManifest,
    hasReadme,
    hasRepository,
    hasTypes,
    dependencies,
    devDependencies,
  };
}
