import type { Command } from 'commander';
import { scan } from '@safeskill/scanner';
import { printReport } from '../reporter.js';
import { resolvePackage } from '../utils/npm-wrapper.js';
import ora from 'ora';
import chalk from 'chalk';

const DEFAULT_API_URL = 'https://safeskill.dev';

function getApiBaseUrl(): string {
  // Use SAFESKILL_API_URL for local dev, e.g. http://localhost:3000
  return process.env.SAFESKILL_API_URL ?? DEFAULT_API_URL;
}

async function shareReport(resultJson: string): Promise<string> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/reports`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: resultJson,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { id: string; url: string };
  return data.url;
}

export function registerScanCommand(program: Command): void {
  program
    .command('scan <package>')
    .description('Scan any npm package or local directory for security risks and prompt injection')
    .option('--json', 'Output raw JSON instead of formatted report')
    .option('--skip-deps', 'Skip dependency analysis (faster)')
    .option('--no-color', 'Disable colored output')
    .option('--share', 'Upload the scan result and get a shareable URL')
    .action(async (pkg: string, options: { json?: boolean; skipDeps?: boolean; share?: boolean }) => {
      const spinner = ora({
        text: `Resolving ${chalk.cyan(pkg)}...`,
        color: 'cyan',
      }).start();

      try {
        // Resolve package to a directory
        const { dir, packageName, packageVersion, cleanup } = await resolvePackage(pkg);

        spinner.text = `Scanning ${chalk.cyan(packageName)}...`;

        const result = await scan({
          dir,
          packageName,
          packageVersion: packageVersion ?? undefined,
          skipDeps: options.skipDeps,
        });

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printReport(result);
        }

        // Share the report if requested
        if (options.share) {
          try {
            const resultJson = JSON.stringify(result);
            const reportUrl = await shareReport(resultJson);
            console.log(`\n${chalk.green('Report shared:')} ${reportUrl}`);
          } catch (shareError) {
            const msg = shareError instanceof Error ? shareError.message : String(shareError);
            console.warn(`\n${chalk.yellow('Warning:')} Failed to share report: ${msg}`);
          }
        }

        // Cleanup temp directory if we extracted an npm package
        if (cleanup) await cleanup();

        // Exit with non-zero if blocked
        if (result.overallScore < 40) {
          process.exit(1);
        }
      } catch (error) {
        spinner.fail(chalk.red(`Failed to scan: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    });
}
