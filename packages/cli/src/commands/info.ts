import type { Command } from 'commander';
import chalk from 'chalk';

export function registerInfoCommand(program: Command): void {
  program
    .command('info <package>')
    .description('Look up a package in the SafeSkill registry')
    .action(async (pkg: string) => {
      // TODO: Implement registry lookup once the web API is built
      console.log(chalk.dim(`Looking up ${chalk.cyan(pkg)} in SafeSkill registry...`));
      console.log(chalk.yellow('\nRegistry not yet available. Use `safeskill scan` to scan locally.\n'));
    });
}
