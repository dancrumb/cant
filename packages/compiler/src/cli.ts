#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { check } from './check.ts';
import { formatDiagnostic } from './diagnostic.ts';

/**
 * Check each file and print its problems. Exit with 1 if any file has a problem, or 2 if a file
 * can't be read.
 */
const checkFiles = (files: string[]): void => {
  let problems = 0;
  let unreadable = false;
  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, 'utf-8');
    } catch (caught) {
      console.error(`${file}: ${caught instanceof Error ? caught.message : String(caught)}`);
      unreadable = true;
      continue;
    }
    for (const diagnostic of check(source).diagnostics) {
      console.error(`${formatDiagnostic(file, source, diagnostic)}\n`);
      problems += 1;
    }
  }
  if (problems > 0) console.error(`${String(problems)} ${problems === 1 ? 'problem' : 'problems'} found.`);
  process.exitCode = unreadable ? 2 : problems > 0 ? 1 : 0;
};

const program = new Command().name('cant').description('The Cant compiler');

program
  .command('check')
  .description('Check Cant source files for syntax errors and duplicate declarations')
  .argument('<files...>', 'the .cant files to check')
  .action(checkFiles);

program.parse();
