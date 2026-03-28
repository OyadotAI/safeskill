#!/usr/bin/env node

import { program } from 'commander';
import { registerScanCommand } from '../commands/scan.js';
import { registerInstallCommand } from '../commands/install.js';
import { registerInfoCommand } from '../commands/info.js';

program
  .name('skillsafe')
  .version('0.2.0')
  .description('SafeSkill — scan AI tool skills for security risks and prompt injection');

registerScanCommand(program);
registerInstallCommand(program);
registerInfoCommand(program);

program.parse();
