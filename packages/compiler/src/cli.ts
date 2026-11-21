#!/usr/bin/env node
import { relative } from 'node:path';
import { Command } from 'commander';
import { formatDiagnostic, type Diagnostic } from './diagnostic.ts';
import { fileSystemHost } from './host.ts';
import { checkProgram } from './program.ts';

/**
 * Check each file as the entry module of a program, following its imports, and print every
 * problem found in any module it uses. Exit with 1 if there is a problem, or 2 if an entry file
 * can't be read.
 */
const checkFiles = (files: string[]): void => {
  const seen = new Set<string>();
  const problems: Diagnostic[] = [];
  let unreadable = false;

  for (const file of files) {
    const program = checkProgram(file, fileSystemHost);
    for (const diagnostic of program.diagnostics) {
      if (diagnostic.code === 'module-not-found' && diagnostic.file === program.entry) unreadable = true;
      // A module imported by several entry files is only reported once.
      const key = `${diagnostic.file ?? ''}:${String(diagnostic.position.start.offset)}:${diagnostic.code}:${diagnostic.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push(diagnostic);
    }
  }

  for (const diagnostic of problems) {
    const file = diagnostic.file ?? '';
    const source = fileSystemHost.readFile(file) ?? '';
    console.error(`${formatDiagnostic(relative(process.cwd(), file) || file, source, diagnostic)}\n`);
  }
  if (problems.length > 0) {
    console.error(`${String(problems.length)} ${problems.length === 1 ? 'problem' : 'problems'} found.`);
  }
  process.exitCode = unreadable ? 2 : problems.length > 0 ? 1 : 0;
};

const program = new Command().name('cant').description('The Cant compiler');

program
  .command('check')
  .description(
    'Check Cant programs: parse each file and the modules it imports, report names declared twice, and resolve imports and the names declarations refer to',
  )
  .argument('<files...>', 'the entry .cant file of each program to check')
  .action(checkFiles);

program.parse();
