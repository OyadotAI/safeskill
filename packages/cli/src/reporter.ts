import type { ScanResult } from '@safeskill/shared';
import { getGrade, GRADE_LABELS } from '@safeskill/shared';
import chalk from 'chalk';

const GRADE_CHALK = {
  verified: chalk.green,
  passes: chalk.yellow,
  caution: chalk.hex('#ff9800'),
  blocked: chalk.red,
} as const;

function scoreBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const grade = getGrade(score);
  const color = GRADE_CHALK[grade];
  return color('\u2588'.repeat(filled)) + chalk.dim('\u2591'.repeat(empty));
}

export function printReport(result: ScanResult): void {
  const grade = getGrade(result.overallScore);
  const gradeColor = GRADE_CHALK[grade];
  const gradeLabel = GRADE_LABELS[grade];

  const w = 50;
  const border = '\u2500'.repeat(w);
  const pad = (s: string, len: number) => s + ' '.repeat(Math.max(0, len - stripAnsi(s).length));

  console.log('');
  console.log(chalk.dim(`  \u250C${border}\u2510`));
  console.log(chalk.dim('  \u2502') + chalk.bold.white(` SafeSkill Report: ${result.packageName}`.padEnd(w)) + chalk.dim('\u2502'));
  console.log(chalk.dim(`  \u251C${border}\u2524`));

  // Overall score
  const scoreStr = `  Overall Score: ${result.overallScore}/100 (${gradeLabel})`;
  console.log(chalk.dim('  \u2502') + gradeColor(pad(scoreStr, w)) + chalk.dim('\u2502'));
  console.log(chalk.dim('  \u2502') + ' '.repeat(w) + chalk.dim('\u2502'));

  // Code safety
  const codeLine = `  Code Safety:    ${result.codeScore}/100 ${scoreBar(result.codeScore, 12)}`;
  console.log(chalk.dim('  \u2502') + pad(codeLine, w) + chalk.dim('\u2502'));

  // Content safety
  const contentLine = `  Content Safety: ${result.contentScore}/100 ${scoreBar(result.contentScore, 12)}`;
  console.log(chalk.dim('  \u2502') + pad(contentLine, w) + chalk.dim('\u2502'));

  console.log(chalk.dim('  \u2502') + ' '.repeat(w) + chalk.dim('\u2502'));

  // Key findings summary
  const criticalPrompt = result.promptFindings.filter(f => f.severity === 'critical').length;
  const highPrompt = result.promptFindings.filter(f => f.severity === 'high').length;
  const taintFlowCount = result.taintFlows.length;
  const mismatchCount = result.mismatches.length;

  if (criticalPrompt > 0) {
    const line = `  ${chalk.red('\u2716')} ${criticalPrompt} critical prompt injection risk${criticalPrompt > 1 ? 's' : ''}`;
    console.log(chalk.dim('  \u2502') + pad(line, w) + chalk.dim('\u2502'));
  }
  if (highPrompt > 0) {
    const line = `  ${chalk.yellow('\u26A0')} ${highPrompt} high prompt injection risk${highPrompt > 1 ? 's' : ''}`;
    console.log(chalk.dim('  \u2502') + pad(line, w) + chalk.dim('\u2502'));
  }
  if (taintFlowCount > 0) {
    const line = `  ${chalk.yellow('\u26A0')} ${taintFlowCount} data flow risk${taintFlowCount > 1 ? 's' : ''} (source \u2192 sink)`;
    console.log(chalk.dim('  \u2502') + pad(line, w) + chalk.dim('\u2502'));
  }
  if (mismatchCount > 0) {
    const line = `  ${chalk.yellow('\u26A0')} ${mismatchCount} description \u2194 code mismatch${mismatchCount > 1 ? 'es' : ''}`;
    console.log(chalk.dim('  \u2502') + pad(line, w) + chalk.dim('\u2502'));
  }

  // Good signals
  if (!result.hasInstallScripts) {
    const line = `  ${chalk.green('\u2714')} No install scripts`;
    console.log(chalk.dim('  \u2502') + pad(line, w) + chalk.dim('\u2502'));
  }
  const obfuscation = result.codeFindings.filter(f => f.category === 'obfuscation');
  if (obfuscation.length === 0) {
    const line = `  ${chalk.green('\u2714')} No obfuscation detected`;
    console.log(chalk.dim('  \u2502') + pad(line, w) + chalk.dim('\u2502'));
  }
  if (criticalPrompt === 0 && highPrompt === 0) {
    const line = `  ${chalk.green('\u2714')} No prompt injection detected`;
    console.log(chalk.dim('  \u2502') + pad(line, w) + chalk.dim('\u2502'));
  }

  console.log(chalk.dim('  \u2502') + ' '.repeat(w) + chalk.dim('\u2502'));

  // Stats
  const statsLine = chalk.dim(`  ${result.filesScanned} code files, ${result.contentFilesScanned} content files scanned in ${result.duration}ms`);
  console.log(chalk.dim('  \u2502') + pad(statsLine, w) + chalk.dim('\u2502'));

  console.log(chalk.dim(`  \u2514${border}\u2518`));
  console.log('');

  // Detailed findings (top 10)
  // Filter out expected findings for tool packages and test fixtures from the display
  const CLI_EXPECTED_CATEGORIES = new Set(['process-spawn', 'filesystem-access', 'env-access']);
  const isCli = result.packageType === 'cli-tool';
  const isMcp = result.packageType === 'mcp-server';
  const isToolPackage = isCli || isMcp;

  const allFindings = [
    ...result.codeFindings.map(f => ({ ...f, type: 'code' as const })),
    ...result.promptFindings.map(f => ({ ...f, type: 'prompt' as const })),
  ]
    .filter(f => !f.isTestFixture)
    .filter(f => !(isToolPackage && 'category' in f && CLI_EXPECTED_CATEGORIES.has(f.category as string)))
    .sort((a, b) => severityOrder(b.severity) - severityOrder(a.severity));

  if (isCli) {
    console.log(chalk.dim('  ℹ CLI tool detected — process-spawn, filesystem, and env-access findings are expected and excluded.'));
    console.log('');
  } else if (isMcp) {
    console.log(chalk.dim('  ℹ MCP server detected — process-spawn, filesystem, and env-access findings are expected and excluded.'));
    console.log('');
  }

  if (allFindings.length > 0) {
    console.log(chalk.bold('  Top Findings:'));
    console.log('');

    for (const finding of allFindings.slice(0, 10)) {
      const sevColor = finding.severity === 'critical' ? chalk.red
        : finding.severity === 'high' ? chalk.yellow
        : finding.severity === 'medium' ? chalk.hex('#ff9800')
        : chalk.dim;

      const tag = finding.type === 'prompt' ? chalk.magenta('[PROMPT]') : chalk.cyan('[CODE]');
      const sev = sevColor(`[${finding.severity.toUpperCase()}]`);
      const loc = chalk.dim(`${finding.location.file}:${finding.location.line}`);

      console.log(`  ${sev} ${tag} ${finding.description}`);
      console.log(`    ${loc}`);
      const snippet = 'codeSnippet' in finding ? finding.codeSnippet : finding.contentSnippet;
      if (snippet) {
        console.log(`    ${chalk.dim(snippet.slice(0, 100))}`);
      }
      console.log('');
    }

    if (allFindings.length > 10) {
      console.log(chalk.dim(`  ... and ${allFindings.length - 10} more findings\n`));
    }
  }

  // Taint flows
  if (result.taintFlows.length > 0) {
    console.log(chalk.bold.red('  Data Flow Risks:'));
    console.log('');
    for (const flow of result.taintFlows.slice(0, 5)) {
      console.log(`  ${chalk.red('\u26A0')} ${flow.source.description}`);
      console.log(`    ${chalk.dim(flow.source.location.file + ':' + flow.source.location.line)}`);
      for (const step of flow.intermediateSteps) {
        console.log(`    \u2192 ${step.description}`);
      }
      console.log(`    \u2192 ${flow.sink.description}`);
      console.log(`    ${chalk.dim(flow.sink.location.file + ':' + flow.sink.location.line)}`);
      console.log('');
    }
  }

  // Badge
  const slug = packageToSlug(result.packageName);
  console.log(chalk.bold('  Badge:'));
  console.log(chalk.dim('  Add to your README:'));
  console.log('');
  console.log(`  ${chalk.cyan(`[![SafeSkill](https://safeskill.dev/api/badge/${slug})](https://safeskill.dev/scan/${slug})`)}`);
  console.log('');
}

function packageToSlug(packageName: string): string {
  return packageName
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .replace(/[^a-z0-9\-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function severityOrder(severity: string): number {
  switch (severity) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[\d+m/g, '').replace(/\x1B\[[\d;]*m/g, '');
}
