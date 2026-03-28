import type { Command } from 'commander';
import { scan } from '@safeskill/scanner';
import { printReport } from '../reporter.js';
import { resolvePackage, runNpx } from '../utils/npm-wrapper.js';
import { getGrade, SCORE_THRESHOLDS } from '@safeskill/shared';
import ora from 'ora';
import chalk from 'chalk';
import { createInterface } from 'readline';

export function registerInstallCommand(program: Command): void {
  program
    .command('install <package>')
    .description('Scan and install an AI tool skill (safe replacement for npx)')
    .option('--force', 'Install even if score is low')
    .option('--skip-deps', 'Skip dependency analysis')
    .action(async (pkg: string, options: { force?: boolean; skipDeps?: boolean }) => {
      const spinner = ora({
        text: `Resolving ${chalk.cyan(pkg)}...`,
        color: 'cyan',
      }).start();

      try {
        const { dir, packageName, packageVersion, cleanup } = await resolvePackage(pkg);

        spinner.text = `Scanning ${chalk.cyan(packageName)} for security risks...`;
        const result = await scan({
          dir,
          packageName,
          packageVersion: packageVersion ?? undefined,
          skipDeps: options.skipDeps,
        });

        spinner.stop();
        printReport(result);

        const grade = getGrade(result.overallScore);

        if (grade === 'blocked') {
          console.log(
            chalk.red.bold('\n  BLOCKED — This package has critical security issues.\n')
          );
          if (!options.force) {
            console.log(chalk.dim('  Use --force to install anyway (not recommended).\n'));
            if (cleanup) await cleanup();
            process.exit(1);
          }
          console.log(chalk.yellow('  --force flag used. Installing despite risks...\n'));
        } else if (grade === 'caution') {
          console.log(
            chalk.yellow.bold('\n  CAUTION — This package has security concerns.\n')
          );
          if (!options.force) {
            const confirmed = await confirm('  Do you want to install anyway?');
            if (!confirmed) {
              console.log(chalk.dim('\n  Installation cancelled.\n'));
              if (cleanup) await cleanup();
              process.exit(0);
            }
          }
        } else if (grade === 'passes') {
          console.log(chalk.yellow(`\n  Score: ${result.overallScore}/100 — Passes with notes\n`));
        } else {
          console.log(chalk.green(`\n  Score: ${result.overallScore}/100 — Verified Safe\n`));
        }

        // Run the actual npx command
        const npxSpinner = ora({
          text: `Installing ${chalk.cyan(packageName)}...`,
          color: 'green',
        }).start();

        await runNpx(pkg);
        npxSpinner.succeed(chalk.green(`${packageName} installed successfully`));

        if (cleanup) await cleanup();
      } catch (error) {
        spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    });
}

function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
