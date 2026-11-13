import { readFileSync } from 'fs';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

export { cant } from '@dancrumb/cant-shared';

const input = readFileSync('./examples/hello-world.md', 'utf-8');

const ast = unified().use(remarkParse).parse(input);

const depths = new Map<object, number>();

const code: string[] = []

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


