import { readFile } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import type { CodeFinding } from '@safeskill/shared';
import { distance } from 'fastest-levenshtein';

const execFileAsync = promisify(execFile);

// Top npm packages to check for typosquatting
const POPULAR_PACKAGES = [
  'express', 'react', 'lodash', 'axios', 'moment', 'chalk', 'commander',
  'webpack', 'typescript', 'eslint', 'prettier', 'jest', 'mocha', 'vite',
  'next', 'vue', 'angular', 'svelte', 'fastify', 'koa', 'hapi',
  'mongoose', 'sequelize', 'prisma', 'typeorm', 'knex',
  'dotenv', 'cors', 'helmet', 'passport', 'jsonwebtoken', 'bcrypt',
  'socket.io', 'redis', 'pg', 'mysql2', 'mongodb',
  'node-fetch', 'got', 'superagent', 'request', 'undici',
  'cheerio', 'puppeteer', 'playwright',
  'fs-extra', 'glob', 'globby', 'rimraf', 'mkdirp',
  'debug', 'winston', 'pino', 'bunyan',
  'uuid', 'nanoid', 'crypto-js',
  'zod', 'joi', 'yup', 'ajv',
  'ora', 'inquirer', 'prompts', 'yargs',
  'date-fns', 'dayjs', 'luxon',
  'sharp', 'jimp', 'canvas',
  'ts-morph', 'ts-node', 'tsx', 'esbuild', 'swc',
];

export interface DependencyResult {
  findings: CodeFinding[];
  dependencyCount: number;
}

export async function analyzeDependencies(dir: string): Promise<DependencyResult> {
  const findings: CodeFinding[] = [];
  let dependencyCount = 0;

  // Parse package.json deps
  let deps: Record<string, string> = {};
  try {
    const raw = await readFile(path.join(dir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    deps = {
      ...((pkg.dependencies as Record<string, string>) ?? {}),
      ...((pkg.devDependencies as Record<string, string>) ?? {}),
    };
    dependencyCount = Object.keys(deps).length;
  } catch {
    return { findings, dependencyCount };
  }

  // Check for typosquatting
  const depNames = Object.keys(deps);
  for (const dep of depNames) {
    // Strip scope for comparison
    const baseName = dep.startsWith('@') ? dep.split('/')[1] ?? dep : dep;

    for (const popular of POPULAR_PACKAGES) {
      if (baseName === popular) continue;
      const dist = distance(baseName, popular);
      if (dist === 1 && baseName.length >= 3) {
        findings.push({
          category: 'dynamic-require',
          severity: 'high',
          location: { file: 'package.json', line: 0, column: 0 },
          description: `Dependency "${dep}" is suspiciously similar to popular package "${popular}" (possible typosquatting)`,
          codeSnippet: `"${dep}": "${deps[dep]}"`,
          confidence: 0.75,
        });
      }
    }
  }

  // High dependency count warning
  if (dependencyCount > 50) {
    findings.push({
      category: 'dynamic-require',
      severity: 'medium',
      location: { file: 'package.json', line: 0, column: 0 },
      description: `High dependency count: ${dependencyCount} (increases supply chain attack surface)`,
      codeSnippet: '',
      confidence: 0.7,
    });
  }

  // Try npm audit
  try {
    const { stdout } = await execFileAsync('npm', ['audit', '--json'], {
      cwd: dir,
      timeout: 30000,
    });

    const audit = JSON.parse(stdout) as {
      vulnerabilities?: Record<string, {
        severity: string;
        via: unknown[];
        fixAvailable: boolean;
      }>;
    };

    if (audit.vulnerabilities) {
      for (const [name, vuln] of Object.entries(audit.vulnerabilities)) {
        const severity = vuln.severity === 'critical' ? 'critical'
          : vuln.severity === 'high' ? 'high'
          : vuln.severity === 'moderate' ? 'medium'
          : 'low';

        findings.push({
          category: 'dynamic-require',
          severity: severity as CodeFinding['severity'],
          location: { file: 'package.json', line: 0, column: 0 },
          description: `Known vulnerability in dependency "${name}" (${vuln.severity})`,
          codeSnippet: `${name}: ${vuln.severity}`,
          confidence: 1.0,
        });
      }
    }
  } catch {
    // npm audit may fail if no lock file — that's okay
  }

  return { findings, dependencyCount };
}
