#!/usr/bin/env node
import { Command } from 'commander';
import { createRunCommand } from './commands/run.js';
import { createResumeCommand } from './commands/resume.js';
import { createCasesCommand } from './commands/cases.js';
import { createGatesCommand, createApproveCommand, createRejectCommand } from './commands/gates.js';
import { createValidateCommand } from './commands/validate.js';
import { createEventsCommand } from './commands/events.js';

const program = new Command();

program
  .name('wolf')
  .description('Mr. Wolf — universal adaptive agent framework')
  .version('0.1.0');

program.addCommand(createRunCommand());
program.addCommand(createResumeCommand());
program.addCommand(createCasesCommand());
program.addCommand(createGatesCommand());
program.addCommand(createApproveCommand());
program.addCommand(createRejectCommand());
program.addCommand(createValidateCommand());
program.addCommand(createEventsCommand());

program.parse();
