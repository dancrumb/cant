#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { Command } from 'commander';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

export { cant } from '@dancrumb/cant-shared';

// Only code blocks in this language are part of the program. Others, such as
// `cant-example`, illustrate a point and are left out of the code output.
const CANT_LANGUAGE = 'cant';

interface WeaveOptions {
  output?: string;
}

const weave = (file: string, options: WeaveOptions): void => {
  const input = readFileSync(file, 'utf-8');

  const ast = unified().use(remarkParse).parse(input);

  const depths = new Map<object, number>();

  const code: string[] = [];

  visit(ast, (node, _index, parent) => {
    const depth = parent ? (depths.get(parent) ?? 0) + 1 : 0;
    depths.set(node, depth);

    const value = 'value' in node ? `: ${JSON.stringify(node.value)}` : '';
    console.log(`${'  '.repeat(depth)}${node.type}${value}`);
    if (node.type === 'code' && node.lang === CANT_LANGUAGE) {
      code.push(node.value);
    }
  });

  if (options.output === undefined) {
    console.log('\n--- Code Blocks ---\n');
    console.log(code.join('\n'));
  } else {
    writeFileSync(options.output, `${code.join('\n')}\n`);
  }
};

new Command()
  .name('weave')
  .description('Parse a Cant Markdown file and show its AST and code blocks')
  .argument('<file>', 'path to the Markdown file to weave')
  .option('-o, --output <file>', 'write the code blocks to this file instead of stdout')
  .action(weave)
  .parse();
