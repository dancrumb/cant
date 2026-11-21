#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { Command } from 'commander';
import { compile } from './compile.ts';
import { formatDiagnostic, type Diagnostic } from './diagnostic.ts';
import { fileSystemHost } from './host.ts';
import { findManifest } from './manifest.ts';
import { checkProgram } from './program.ts';

/** A path as people read it: relative to where the command was run, if that is shorter. */
const shown = (path: string): string => relative(process.cwd(), path) || path;

/** Print each problem, with the line of source it points to, and how many there are. */
const printProblems = (problems: Diagnostic[]): void => {
  for (const diagnostic of problems) {
    const file = diagnostic.file ?? '';
    const source = fileSystemHost.readFile(file) ?? '';
    console.error(`${formatDiagnostic(shown(file), source, diagnostic)}\n`);
  }
  if (problems.length > 0) {
    console.error(`${String(problems.length)} ${problems.length === 1 ? 'problem' : 'problems'} found.`);
  }
};

/** Whether an entry file couldn't be read, which exits with 2 rather than 1. */
const unreadable = (problems: Diagnostic[], entry: string): boolean =>
  problems.some((diagnostic) => diagnostic.code === 'module-not-found' && diagnostic.file === entry);

/**
 * Check each file as the entry module of a program, following its imports, and print every
 * problem found in any module it uses. Exit with 1 if there is a problem, or 2 if an entry file
 * can't be read.
 */
const checkFiles = (files: string[]): void => {
  const seen = new Set<string>();
  const problems: Diagnostic[] = [];
  let missing = false;

  for (const file of files) {
    const program = checkProgram(file, fileSystemHost);
    if (unreadable(program.diagnostics, program.entry)) missing = true;
    for (const diagnostic of program.diagnostics) {
      // A module imported by several entry files is only reported once.
      const key = `${diagnostic.file ?? ''}:${String(diagnostic.position.start.offset)}:${diagnostic.code}:${diagnostic.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push(diagnostic);
    }
  }

  printProblems(problems);
  process.exitCode = missing ? 2 : problems.length > 0 ? 1 : 0;
};

interface BuildOptions {
  output?: string;
  sourceMap: boolean;
}

/**
 * Compile a program and write the compiled program, and its source map beside it, as JSON
 * (docs/adr/0039-compiled-programs.md). If the program has problems, report them, write
 * nothing, and remove what an earlier build wrote, so what is on disk always matches the source.
 */
const build = (file: string, options: BuildOptions): void => {
  const entry = resolve(file);
  const root = dirname(findManifest(entry, fileSystemHost).manifest?.path ?? entry);
  const output = options.output === undefined ? join(root, `${basename(entry, '.cant')}.compiled.json`) : resolve(options.output);
  const map = `${output}.map`;

  const result = compile(entry, fileSystemHost);
  if ('diagnostics' in result) {
    rmSync(output, { force: true });
    rmSync(map, { force: true });
    printProblems(result.diagnostics);
    process.exitCode = unreadable(result.diagnostics, entry) ? 2 : 1;
    return;
  }

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result.program)}\n`);
  if (options.sourceMap) writeFileSync(map, `${JSON.stringify(result.sourceMap)}\n`);
  else rmSync(map, { force: true });
  console.log(`Wrote ${shown(output)}${options.sourceMap ? ` and ${shown(map)}` : ''}.`);
};

const program = new Command().name('cant').description('The Cant compiler');

program
  .command('check')
  .description('Check Cant programs: parse each file and the modules it imports, and report every problem the compiler finds')
  .argument('<files...>', 'the entry .cant file of each program to check')
  .action(checkFiles);

program
  .command('build')
  .description("Compile a Cant program, and write the compiled program and its source map, which the interpreter runs")
  .argument('<file>', "the program's entry .cant file")
  .option('-o, --output <file>', 'where to write the compiled program (default: <entry>.compiled.json in the program\'s root)')
  .option('--no-source-map', "don't write a source map, so the interpreter reports positions without source")
  .action(build);

program.parse();
