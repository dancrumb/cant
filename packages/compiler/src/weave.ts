import { readFileSync } from 'fs';
import { Command } from 'commander';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

export { cant } from '@dancrumb/cant-shared';

const weave = (file: string): void => {
  const input = readFileSync(file, 'utf-8');

  const ast = unified().use(remarkParse).parse(input);

  const depths = new Map<object, number>();

  const code: string[] = [];

  visit(ast, (node, _index, parent) => {
    const depth = parent ? (depths.get(parent) ?? 0) + 1 : 0;
    depths.set(node, depth);

    const value = 'value' in node ? `: ${JSON.stringify(node.value)}` : '';
    console.log(`${'  '.repeat(depth)}${node.type}${value}`);
    if (node.type === 'code' && 'value' in node) {
      code.push(node.value);
    }
  });

  console.log('\n--- Code Blocks ---\n');
  console.log(code.join('\n'));
};

new Command()
  .name('weave')
  .description('Parse a Cant Markdown file and show its AST and code blocks')
  .argument('<file>', 'path to the Markdown file to weave')
  .action(weave)
  .parse();
