#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { checkProgram, compile, fileSystemHost, findManifest, formatDiagnostic, type Diagnostic } from '@dancrumb/cant-compiler';
import { Panic, run } from '@dancrumb/cant-interpreter';
import { format, ParseError, type CompiledProgram, type SourceMap } from '@dancrumb/cant-shared';
import { Command, Option } from 'commander';

/**
 * The `cant` command. It checks, builds and formats programs with the compiler, and runs them
 * with the interpreter, which it brings together, so that the compiler and the interpreter
 * don't depend on each other (docs/adr/0002-share-language-code-in-cant-shared.md).
 */

/** This package's version, which every Cant package shares, since they are released together. */
const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

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
    if (unreadable(program.diagnostics, program.entry)) {
      missing = true;
    }
    for (const diagnostic of program.diagnostics) {
      // A module imported by several entry files is only reported once.
      const key = `${diagnostic.file ?? ''}:${String(diagnostic.position.start.offset)}:${diagnostic.code}:${diagnostic.message}`;
      if (seen.has(key)) {
        continue;
      }
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
  if (options.sourceMap) {
    writeFileSync(map, `${JSON.stringify(result.sourceMap)}\n`);
  } else {
    rmSync(map, { force: true });
  }
  console.log(`Wrote ${shown(output)}${options.sourceMap ? ` and ${shown(map)}` : ''}.`);
};

interface FormatOptions {
  write?: true;
  check?: true;
}

/**
 * Format each file (docs/adr/0041-formatting.md): print the formatted source, or with `--write`
 * rewrite the files that change, or with `--check` list the files that aren't formatted and
 * change nothing. A file with a syntax error is reported and left alone. Exit with 1 if a file
 * has a syntax error or, with `--check`, isn't formatted, or 2 if a file can't be read.
 */
const formatFiles = (files: string[], options: FormatOptions): void => {
  const problems: Diagnostic[] = [];
  const unformatted: string[] = [];
  let missing = false;

  for (const file of files) {
    const path = resolve(file);
    const source = fileSystemHost.readFile(path);
    if (source === undefined) {
      console.error(`${shown(path)}: error: can't read the file.`);
      missing = true;
      continue;
    }

    let formatted: string;
    try {
      formatted = format(source);
    } catch (caught) {
      if (!(caught instanceof ParseError)) {
        throw caught;
      }
      problems.push({ severity: 'error', code: 'syntax', message: caught.message, position: caught.location, file: path });
      continue;
    }

    if (options.check === true) {
      if (formatted !== source) {
        unformatted.push(path);
      }
    } else if (options.write === true) {
      if (formatted !== source) {
        writeFileSync(path, formatted);
        console.log(`Formatted ${shown(path)}.`);
      }
    } else {
      process.stdout.write(formatted);
    }
  }

  printProblems(problems);
  for (const path of unformatted) {
    console.error(`${shown(path)} isn't formatted.`);
  }
  if (unformatted.length > 0) {
    const one = unformatted.length === 1;
    console.error(
      `${String(unformatted.length)} ${one ? 'file needs' : 'files need'} formatting. Run \`cant fmt --write\` to format ${one ? 'it' : 'them'}.`,
    );
  }
  process.exitCode = missing ? 2 : problems.length > 0 || unformatted.length > 0 ? 1 : 0;
};

interface RunOptions {
  root?: string;
}

/** Read a compiled program, and its source map beside it if there is one (docs/adr/0039-compiled-programs.md#on-the-command-line). */
const readCompiled = (path: string): { program: CompiledProgram; sourceMap?: SourceMap } | undefined => {
  const text = fileSystemHost.readFile(path);
  if (text === undefined) {
    return undefined;
  }
  const program = JSON.parse(text) as CompiledProgram;
  const map = fileSystemHost.readFile(`${path}.map`);
  return map === undefined ? { program } : { program, sourceMap: JSON.parse(map) as SourceMap };
};

/** Print a panic, with the line of source it happened on when the source map has it. */
const printPanic = (panic: Panic, program: CompiledProgram, sourceMap: SourceMap | undefined): void => {
  const { position } = panic;
  if (position === undefined) {
    console.error(`panic: ${panic.message}`);
    return;
  }
  // A source map from another build would show the wrong source, so it is only used for its own.
  const source = sourceMap?.build === program.build ? sourceMap.sources[position.module] : undefined;
  const diagnostic: Diagnostic = { severity: 'panic', code: 'panic', message: panic.message, position };
  console.error(formatDiagnostic(position.module, source ?? '', diagnostic));
};

/**
 * Run a program (docs/adr/0039-compiled-programs.md#on-the-command-line): compile an entry
 * module and run it, writing nothing, or run a compiled program, from the directory it is in or
 * `--root`. Exit with 1 if the program has problems or panics, or 2 if the file can't be read.
 */
const runProgram = async (file: string, options: RunOptions): Promise<void> => {
  const path = resolve(file);
  let compiled: { program: CompiledProgram; sourceMap?: SourceMap; root: string };
  if (path.endsWith('.json')) {
    const read = readCompiled(path);
    if (read === undefined) {
      console.error(`${shown(path)}: error: can't read the file.`);
      process.exitCode = 2;
      return;
    }
    compiled = { ...read, root: dirname(path) };
  } else {
    const result = compile(path, fileSystemHost);
    if ('diagnostics' in result) {
      printProblems(result.diagnostics);
      process.exitCode = unreadable(result.diagnostics, path) ? 2 : 1;
      return;
    }
    compiled = result;
  }

  const { program, sourceMap } = compiled;
  const root = options.root === undefined ? compiled.root : resolve(options.root);
  try {
    await run(program, { root, ...(sourceMap !== undefined && { sourceMap }) });
  } catch (caught) {
    if (caught instanceof Panic) {
      printPanic(caught, program, sourceMap);
    } else {
      console.error(`error: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
    process.exitCode = 1;
  }
};

const program = new Command().name('cant').description('Check, build, format and run Cant programs');

program
  .command('check')
  .description('Check Cant programs: parse each file and the modules it imports, and report every problem the compiler finds')
  .argument('<files...>', 'the entry .cant file of each program to check')
  .action(checkFiles);

program
  .command('build')
  .description('Compile a Cant program, and write the compiled program and its source map, which the interpreter runs')
  .argument('<file>', "the program's entry .cant file")
  .option('-o, --output <file>', "where to write the compiled program (default: <entry>.compiled.json in the program's root)")
  .option('--no-source-map', "don't write a source map, so the interpreter reports positions without source")
  .action(build);

program
  .command('fmt')
  .description('Format Cant files, and print the result')
  .argument('<files...>', 'the .cant files to format')
  .addOption(new Option('-w, --write', 'rewrite the files in place instead of printing them'))
  .addOption(
    new Option('--check', "list the files that aren't formatted, and exit with 1 if there are any, without changing them").conflicts('write'),
  )
  .action(formatFiles);

program
  .command('run')
  .description("Run a Cant program: compile an entry .cant file and run it, or run a compiled program from `cant build`")
  .argument('<file>', "the program's entry .cant file, or a compiled program's .json file")
  .option('--root <directory>', "the program's root, which native modules are loaded from (default: the compiled program's directory)")
  .action(runProgram);

program
  .command('version')
  .description('Print the version of Cant')
  .action(() => {
    console.log(`cant ${VERSION}`);
  });

await program.parseAsync();
