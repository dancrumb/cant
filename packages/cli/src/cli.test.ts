import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, 'cli.js');
const examples = join(here, '..', '..', '..', 'examples');

const cant = (...args: string[]): { status: number | null; stdout: string; stderr: string } => {
  const { status, stdout, stderr } = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  return { status, stdout, stderr };
};

test('runs the hello world example', () => {
  assert.deepEqual(cant('run', join(examples, 'hello-world.cant')), { status: 0, stdout: 'Hello World', stderr: '' });
});

test('runs a compiled program from cant build', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cant-cli-'));
  const compiled = join(directory, 'hello.json');
  assert.equal(cant('build', join(examples, 'hello-world.cant'), '-o', compiled).status, 0);
  assert.deepEqual(cant('run', compiled), { status: 0, stdout: 'Hello World', stderr: '' });
});

test('reports a panic with its source, and exits with 1', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cant-cli-'));
  const entry = join(directory, 'loop.cant');
  writeFileSync(entry, ['action Count(): VOID', '    body', '        for n in [1, 2]', '            return', 'trigger Count on Start', ''].join('\n'));
  const { status, stderr } = cant('run', entry);
  assert.equal(status, 1);
  assert.equal(stderr, ["loop.cant:3:9: panic: The interpreter can't run for statements yet.", '  |', '3 |         for n in [1, 2]', '  |         ^^^^^^^^^^^^^^^', ''].join('\n'));
});

test("prints the package's version", () => {
  const { version } = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version: string };
  assert.deepEqual(cant('version'), { status: 0, stdout: `cant ${version}\n`, stderr: '' });
});
