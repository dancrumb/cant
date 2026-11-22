import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Workspace } from './workspace.ts';
import { SEMANTIC_TOKENS_LEGEND } from './semanticTokens.ts';

const MAIN = 'file:///app/main.cant';

/** The names in a document, each as `text:type`, with `+modifier`s, from its semantic tokens. */
const names = (...lines: string[]): string[] => {
  const workspace = new Workspace({ readFile: () => undefined });
  workspace.set(MAIN, lines.join('\n'));
  const data = workspace.semanticTokens(MAIN);
  const described: string[] = [];
  let line = 0;
  let character = 0;
  for (let index = 0; index < data.length; index += 5) {
    const [deltaLine = 0, deltaStart = 0, length = 0, type = 0, modifiers = 0] = data.slice(index, index + 5);
    line += deltaLine;
    character = deltaLine === 0 ? character + deltaStart : deltaStart;
    const kind = SEMANTIC_TOKENS_LEGEND.tokenTypes[type] ?? '?';
    if (['keyword', 'operator', 'string', 'number'].includes(kind)) continue;
    const flags = SEMANTIC_TOKENS_LEGEND.tokenModifiers.filter((_, bit) => (modifiers & (1 << bit)) !== 0);
    const text = lines[line]?.slice(character, character + length) ?? '';
    described.push([`${text}:${kind}`, ...flags].join('+'));
  }
  return described;
};

test('colours names by what they are', () => {
  assert.deepEqual(
    names(
      'import IO',
      'enum Status',
      '    open',
      'model Invoice',
      '    status: Status',
      'const LIMIT := 3',
      '// Greets someone',
      'action Greet(person: TEXT, invoice: Invoice): VOID',
      '    body',
      '        message := "Hi ${person}"',
      '        IO::write(message := message, stream := @stdout)',
      '        if invoice.status == Status.open and LIMIT > 1',
      '            return',
      'trigger Greet on Start',
    ),
    [
      'IO:namespace',
      'Status:enum+declaration',
      'open:enumMember+declaration',
      'Invoice:type+declaration',
      'status:property+declaration',
      'Status:enum',
      'LIMIT:variable+declaration+readonly',
      '// Greets someone:comment',
      'Greet:function+declaration',
      'person:parameter+declaration',
      'invoice:parameter+declaration',
      'Invoice:type',
      'message:variable+declaration',
      'person:parameter',
      'IO:namespace',
      'write:function',
      'message:parameter',
      'message:variable',
      'stream:parameter',
      '@stdout:variable+readonly+defaultLibrary',
      'invoice:parameter',
      'status:property',
      'Status:enum',
      'open:enumMember',
      'LIMIT:variable+readonly',
      'Greet:function',
      'Start:type+defaultLibrary',
    ],
  );
});

test('still colours a document with a syntax error, with every name a variable', () => {
  assert.deepEqual(names('action Greet(', '// note'), ['Greet:variable', '// note:comment']);
});
