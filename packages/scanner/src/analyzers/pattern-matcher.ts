import { readFile } from 'fs/promises';
import { globby } from 'globby';
import path from 'path';
import type { CodeFinding, Severity } from '@safeskill/shared';
import { truncate, getLineContent } from '../utils.js';

interface PatternRule {
  pattern: RegExp;
  category: CodeFinding['category'];
  severity: Severity;
  description: string;
  confidence: number;
}

const PATTERNS: PatternRule[] = [
  // Filesystem access
  { pattern: /require\s*\(\s*['"](?:node:)?fs(?:\/promises)?['"]\s*\)/g, category: 'filesystem-access', severity: 'medium', description: 'Imports filesystem module', confidence: 1.0 },
  { pattern: /from\s+['"](?:node:)?fs(?:\/promises)?['"]/g, category: 'filesystem-access', severity: 'medium', description: 'Imports filesystem module', confidence: 1.0 },
  { pattern: /require\s*\(\s*['"]fs-extra['"]\s*\)/g, category: 'filesystem-access', severity: 'medium', description: 'Imports fs-extra', confidence: 1.0 },
  { pattern: /\.(readFileSync|readFile|writeFileSync|writeFile|unlinkSync|unlink|rmdirSync|rmdir|rmSync)\s*\(/g, category: 'filesystem-access', severity: 'high', description: 'Direct filesystem operation', confidence: 0.9 },
  { pattern: /(?:~\/\.ssh|~\/\.aws|~\/\.env|~\/\.gnupg|~\/\.npmrc|~\/\.docker|~\/\.kube|\/etc\/passwd|\/etc\/shadow)/g, category: 'filesystem-access', severity: 'critical', description: 'Accesses sensitive system path', confidence: 0.95 },
  { pattern: /(?:homedir|userInfo)\s*\(\s*\)/g, category: 'filesystem-access', severity: 'medium', description: 'Accesses user home directory info', confidence: 0.8 },

  // Network access
  { pattern: /require\s*\(\s*['"](?:node:)?(?:http|https|net|dgram)['"]\s*\)/g, category: 'network-access', severity: 'medium', description: 'Imports network module', confidence: 1.0 },
  { pattern: /from\s+['"](?:node:)?(?:http|https|net|dgram)['"]/g, category: 'network-access', severity: 'medium', description: 'Imports network module', confidence: 1.0 },
  { pattern: /require\s*\(\s*['"](?:node-fetch|axios|got|undici|superagent|request)['"]\s*\)/g, category: 'network-access', severity: 'medium', description: 'Imports HTTP client library', confidence: 1.0 },
  { pattern: /\bfetch\s*\(/g, category: 'network-access', severity: 'medium', description: 'Makes HTTP request via fetch', confidence: 0.8 },
  { pattern: /new\s+WebSocket\s*\(/g, category: 'network-access', severity: 'high', description: 'Opens WebSocket connection', confidence: 0.95 },
  { pattern: /https?:\/\/(?!(?:localhost|127\.0\.0\.1|example\.com|schema\.org|json-schema\.org|w3\.org|github\.com|npmjs\.com|nodejs\.org))[^\s'"`)]+/g, category: 'network-access', severity: 'low', description: 'Contains external URL', confidence: 0.5 },

  // Env access
  { pattern: /process\.env\b/g, category: 'env-access', severity: 'medium', description: 'Accesses environment variables', confidence: 0.9 },
  { pattern: /process\.env\[/g, category: 'env-access', severity: 'medium', description: 'Dynamic environment variable access', confidence: 0.9 },
  { pattern: /(?:AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|GITHUB_TOKEN|GH_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|NPM_TOKEN|DATABASE_URL|STRIPE_SECRET_KEY|JWT_SECRET|SESSION_SECRET|PRIVATE_KEY|SECRET_KEY)/g, category: 'env-access', severity: 'high', description: 'References sensitive environment variable', confidence: 0.85 },
  { pattern: /require\s*\(\s*['"]dotenv['"]\s*\)/g, category: 'env-access', severity: 'low', description: 'Imports dotenv', confidence: 1.0 },

  // Process spawn
  { pattern: /require\s*\(\s*['"](?:node:)?child_process['"]\s*\)/g, category: 'process-spawn', severity: 'critical', description: 'Imports child_process module', confidence: 1.0 },
  { pattern: /from\s+['"](?:node:)?child_process['"]/g, category: 'process-spawn', severity: 'critical', description: 'Imports child_process module', confidence: 1.0 },
  { pattern: /\b(?:execSync|exec|spawnSync|spawn|execFileSync|execFile|fork)\s*\(/g, category: 'process-spawn', severity: 'critical', description: 'Spawns child process', confidence: 0.85 },
  { pattern: /\beval\s*\(/g, category: 'process-spawn', severity: 'critical', description: 'Uses eval()', confidence: 0.9 },
  { pattern: /new\s+Function\s*\(/g, category: 'process-spawn', severity: 'critical', description: 'Uses Function constructor', confidence: 0.95 },

  // Crypto / encoding (exfiltration prep)
  { pattern: /\.toString\s*\(\s*['"]base64['"]\s*\)/g, category: 'crypto-usage', severity: 'low', description: 'Base64 encoding', confidence: 0.7 },
  { pattern: /Buffer\.from\s*\([^)]*,\s*['"]base64['"]\s*\)/g, category: 'crypto-usage', severity: 'low', description: 'Base64 decoding', confidence: 0.7 },
  { pattern: /\bbtoa\s*\(/g, category: 'crypto-usage', severity: 'low', description: 'Base64 encoding (btoa)', confidence: 0.7 },
  { pattern: /\batob\s*\(/g, category: 'crypto-usage', severity: 'low', description: 'Base64 decoding (atob)', confidence: 0.7 },

  // Obfuscation
  { pattern: /String\.fromCharCode\s*\(/g, category: 'obfuscation', severity: 'high', description: 'Uses String.fromCharCode (potential obfuscation)', confidence: 0.7 },
  { pattern: /\bcharCodeAt\s*\(/g, category: 'obfuscation', severity: 'medium', description: 'Uses charCodeAt (potential obfuscation)', confidence: 0.5 },
  { pattern: /process\s*\[\s*['"]env['"]\s*\]/g, category: 'obfuscation', severity: 'high', description: 'Bracket notation access to process.env (obfuscation)', confidence: 0.9 },
  { pattern: /require\s*\(\s*['"](?:node:)?vm['"]\s*\)/g, category: 'obfuscation', severity: 'critical', description: 'Imports VM module', confidence: 1.0 },

  // Dynamic require
  { pattern: /require\s*\(\s*[^'"]/g, category: 'dynamic-require', severity: 'high', description: 'Dynamic require with non-literal argument', confidence: 0.7 },
  { pattern: /import\s*\(\s*[^'"]/g, category: 'dynamic-require', severity: 'high', description: 'Dynamic import with non-literal argument', confidence: 0.6 },
];

export interface PatternMatchResult {
  findings: CodeFinding[];
  flaggedFiles: Set<string>;
}

export async function analyzePatterns(dir: string): Promise<PatternMatchResult> {
  const files = await globby(['**/*.{ts,js,mjs,cjs,tsx,jsx}'], {
    cwd: dir,
    ignore: ['node_modules/**', 'dist/**', '.git/**', '**/*.d.ts', '**/*.test.*', '**/*.spec.*'],
    absolute: false,
  });

  const findings: CodeFinding[] = [];
  const flaggedFiles = new Set<string>();

  await Promise.all(
    files.map(async (relPath) => {
      const absPath = path.join(dir, relPath);
      let content: string;
      try {
        content = await readFile(absPath, 'utf-8');
      } catch {
        return;
      }

      for (const rule of PATTERNS) {
        const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(content)) !== null) {
          const upToMatch = content.slice(0, match.index);
          const line = upToMatch.split('\n').length;
          const lastNewline = upToMatch.lastIndexOf('\n');
          const column = match.index - lastNewline - 1;

          findings.push({
            category: rule.category,
            severity: rule.severity,
            location: { file: relPath, line, column },
            description: rule.description,
            codeSnippet: truncate(getLineContent(content, line).trim(), 120),
            confidence: rule.confidence,
          });

          flaggedFiles.add(relPath);
        }
      }
    }),
  );

  return { findings, flaggedFiles };
}
