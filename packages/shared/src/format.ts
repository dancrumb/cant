import type { Node } from 'unist';
import type * as Ast from './ast.ts';
import { parse } from './parse.ts';
import { comments as findComments, tokenize, type Comment } from './tokenize.ts';

/**
 * The Cant formatter (docs/adr/0041-formatting.md). It prints a program from its syntax tree in
 * one layout, puts back the comments the tree leaves out, and keeps single blank lines where the
 * source has them.
 */

/** One level of indentation. */
const INDENT = '    ';

/**
 * A line of output while it is being built. `depth` is in levels of indentation, relative to the
 * line a piece of output starts on. `start` and `end` are the source offsets of the first and
 * last things printed on the line, which is how comments and blank lines find their place.
 */
interface Line {
  depth: number;
  text: string;
  start: number | undefined;
  end: number | undefined;
  /** The line starts a block that holds only comments, so a deeper comment after it goes inside. */
  opens?: true;
  /** The line closes a multi-line value, such as `}`. */
  closes?: true;
}

/**
 * Printed output: its first line continues whatever it is joined to, and any further lines start
 * new lines.
 */
type Doc = Line[];

const startOf = (node: Node): number => node.position?.start.offset ?? 0;
const endOf = (node: Node): number => node.position?.end.offset ?? 0;
/** Where the first of some nodes starts. */
const firstStart = (nodes: readonly Node[]): number => Math.min(...nodes.map(startOf));

const text = (value: string, start?: number, end?: number): Doc => [
  { depth: 0, text: value, start, end: end ?? (start === undefined ? undefined : start + value.length) },
];

const earliest = (a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined ? b : b === undefined ? a : Math.min(a, b);
const latest = (a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined ? b : b === undefined ? a : Math.max(a, b);

/** Join docs end to end: each one's first line continues the line the one before ends on. */
const cat = (...docs: Doc[]): Doc => {
  const out: Doc = [];
  for (const doc of docs) {
    const [first, ...rest] = doc;
    if (first === undefined) continue;
    const last = out.at(-1);
    if (last === undefined) {
      out.push(...doc.map((line) => ({ ...line })));
      continue;
    }
    last.text += first.text;
    last.start = earliest(last.start, first.start);
    last.end = latest(last.end, first.end);
    if (first.opens) last.opens = true;
    // Lines after the first are relative to the line they continue from.
    out.push(...rest.map((line) => ({ ...line, depth: line.depth + last.depth })));
  }
  return out;
};

const join = (docs: Doc[], separator: string): Doc =>
  cat(...docs.flatMap((doc, index) => (index === 0 ? [doc] : [text(separator), doc])));

/** A header line followed by an indented block of children, each starting its own line. */
const withBlock = (header: Doc, children: Doc[]): Doc => {
  const out = header.map((line) => ({ ...line }));
  const last = out.at(-1);
  if (children.length === 0 && last !== undefined) last.opens = true;
  for (const child of children) out.push(...child.map((line) => ({ ...line, depth: line.depth + 1 })));
  return out;
};

/** Docs printed one after another, each starting its own line. */
const stack = (...docs: Doc[]): Doc => docs.flat().map((line) => ({ ...line }));

// ----- Precedence: docs/adr/0019-operators.md, and the grammar's expression rules -----

const BINARY_PRECEDENCE: Record<Ast.BinaryOperator, number> = {
  or: 1,
  and: 2,
  '==': 3,
  '!=': 3,
  '<': 3,
  '<=': 3,
  '>': 3,
  '>=': 3,
  in: 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  '%': 5,
  '**': 6,
  orElse: 8,
};

const COMPARISON = 3;
const PREFIX = 7;
const POSTFIX = 9;
const PRIMARY = 10;

const precedence = (node: Ast.Expression): number => {
  switch (node.type) {
    case 'binary':
      return BINARY_PRECEDENCE[node.operator];
    case 'instanceOf':
    case 'canPredicate':
    case 'isPredicate':
    case 'rolePredicate':
      return COMPARISON;
    case 'unary':
      return PREFIX;
    case 'member':
    case 'index':
    case 'call':
      return POSTFIX;
    default:
      return PRIMARY;
  }
};

/** The loosest operands each side of a binary operator takes without parentheses. */
const operandPrecedence = (operator: Ast.BinaryOperator): [left: number, right: number] => {
  const own = BINARY_PRECEDENCE[operator];
  if (operator === '**') return [PREFIX, own]; // right-associative, and its base is a prefix expression
  if (operator === 'orElse') return [own, POSTFIX];
  if (own === COMPARISON) return [own + 1, own + 1]; // comparisons don't chain
  return [own, own + 1]; // left-associative
};

const WORD_OPERATORS = new Set<Ast.UnaryOperator>(['isEmpty', 'ignore']);

class Printer {
  private readonly source: string;
  private readonly comments: Comment[];
  private readonly tokens: { text: string; start: number; end: number }[];

  constructor(source: string, comments: Comment[]) {
    this.source = source;
    this.comments = comments;
    this.tokens = tokenize(source).map(({ position }) => {
      const start = position.start.offset ?? 0;
      const end = position.end.offset ?? 0;
      return { text: source.slice(start, end), start, end };
    });
  }

  program(program: Ast.Program): Doc {
    return stack(...program.children.map((declaration) => this.declaration(declaration)));
  }

  // ----- Helpers -----

  /** The node's source, as written. */
  private slice(node: Node): Doc {
    return text(this.source.slice(startOf(node), endOf(node)), startOf(node), endOf(node));
  }

  /** The offset of the first `word` token at or after `from`, which the tree doesn't record. */
  private tokenAfter(word: string, from: number): number {
    return this.tokens.find((token) => token.start >= from && token.text === word)?.start ?? from;
  }

  /** The offset of the last token that ends at or before `before`. */
  private tokenBefore(before: number): number {
    return this.tokens.findLast((token) => token.end <= before)?.start ?? before;
  }

  private hasComment(start: number, end: number): boolean {
    return this.comments.some(({ position }) => (position.start.offset ?? 0) > start && (position.start.offset ?? 0) < end);
  }

  private keyword(word: string, start: number): Doc {
    return text(word, start);
  }

  // ----- Declarations -----

  private declaration(node: Ast.Declaration): Doc {
    const start = startOf(node);
    const exported = 'exported' in node ? 'export ' : '';
    switch (node.type) {
      case 'import':
        return cat(
          text('import ', start),
          node.module.type === 'moduleName' ? this.moduleName(node.module) : this.slice(node.module),
          node.namespace === undefined ? [] : cat(text(' into '), this.name(node.namespace)),
          node.moduleType === undefined ? [] : cat(text(' as '), this.slice(node.moduleType)),
        );
      case 'reExport':
        return cat(
          text('export ', start),
          this.name(node.name),
          node.alias === undefined ? [] : cat(text(' as '), this.name(node.alias)),
        );
      case 'namespace':
        return cat(text('namespace ', start), this.name(node.name));
      case 'action':
        return this.action(node, exported);
      case 'trigger':
        return this.trigger(node);
      case 'permissions':
        return withBlock(
          cat(
            text('permissions ', start),
            this.name(node.group),
            node.role === undefined ? [] : cat(text(' has '), this.name(node.role)),
          ),
          node.permissions.map((permission) => this.slice(permission)),
        );
      case 'relation':
        return cat(
          text('relation ', start),
          this.relationEnd(node.left),
          text(` ${node.left.cardinality} --- ${node.right.cardinality} `),
          this.relationEnd(node.right),
        );
      case 'enumDeclaration':
        return withBlock(
          cat(text(`${exported}enum `, start), this.name(node.name)),
          node.members.map((member) =>
            cat(this.name(member.name), member.value === undefined ? [] : cat(text(' := '), this.expression(member.value))),
          ),
        );
      case 'model':
        return withBlock(
          cat(text(`${exported}model `, start), this.name(node.name)),
          node.fields.map((field) => this.field(field)),
        );
      case 'entity':
        return withBlock(
          cat(text(`${exported}entity `, start), this.name(node.name)),
          node.lines.map((line) => this.entityLine(line)),
        );
      case 'errorDeclaration':
        return withBlock(cat(text(`${exported}error `, start), this.name(node.name)), this.errorData(node));
      case 'const':
        return cat(
          text(`${exported}const `, start),
          this.name(node.name),
          node.valueType === undefined ? [] : cat(text(': '), this.type(node.valueType)),
          text(' := '),
          this.expression(node.value),
        );
    }
  }

  private moduleName(node: Ast.ModuleName): Doc {
    return cat(node.scope === undefined ? [] : cat(this.name(node.scope), text('::')), this.name(node.name));
  }

  private action(node: Ast.ActionDeclaration, exported: string): Doc {
    const clauses: { keyword: string; names: (Ast.Name | Ast.BuiltIn)[] }[] = [
      { keyword: 'raises', names: node.raises },
      { keyword: 'passes', names: node.passes },
    ].filter(({ names }) => names.length > 0);
    clauses.sort((a, b) => firstStart(a.names) - firstStart(b.names));

    const header = cat(
      text(`${exported}action `, startOf(node)),
      this.name(node.name),
      node.typeParameters === undefined
        ? []
        : cat(
            text('<'),
            join(
              node.typeParameters.map((parameter) =>
                cat(this.name(parameter.name), parameter.bound === undefined ? [] : cat(text(': '), this.type(parameter.bound))),
              ),
              ', ',
            ),
            text('>'),
          ),
      text('('),
      join(node.parameters.map((parameter) => this.field(parameter)), ', '),
      text('): '),
      this.type(node.returnType),
      text(node.optional ? '?' : ''),
      ...clauses.map(({ keyword, names }) =>
        cat(text(` ${keyword} `), join(names.map((name) => this.expression(name)), ', ')),
      ),
    );

    // The signature ends with its return type or the last name in a clause.
    const signatureEnd = Math.max(endOf(node.returnType), ...clauses.flatMap(({ names }) => names.map(endOf)));
    const implementation =
      node.native === undefined
        ? withBlock(
            this.keyword('body', this.tokenAfter('body', signatureEnd)),
            node.children.map((statement) => this.statement(statement)),
          )
        : cat(this.keyword('native ', this.tokenAfter('native', signatureEnd)), this.slice(node.native));
    return withBlock(header, [implementation]);
  }

  private trigger(node: Ast.TriggerDeclaration): Doc {
    const header = cat(
      text('trigger ', startOf(node)),
      this.name(node.action),
      text(' on '),
      this.name(node.source),
    );

    // The tree keeps the blocks by kind, so put them back in source order.
    const settings: { keyword: string; items: Node[]; print: (item: Node) => Doc }[] = [];
    if (node.auth !== undefined) {
      settings.push({ keyword: 'auth', items: [node.auth], print: (item) => this.expression(item as Ast.Expression) });
    }
    for (const keyword of ['arguments', 'parameters'] as const) {
      const values = node[keyword];
      if (values !== undefined) {
        settings.push({ keyword, items: values, print: (item) => this.namedValue(item as Ast.NamedValue) });
      }
    }
    if (node.assertions !== undefined) {
      settings.push({
        keyword: 'assertions',
        items: node.assertions,
        print: (item) => {
          const assertion = item as Ast.Assertion;
          return cat(this.expression(assertion.test), text(', '), this.expression(assertion.message));
        },
      });
    }
    settings.sort((a, b) => firstStart(a.items) - firstStart(b.items));

    return withBlock(
      header,
      settings.map(({ keyword, items, print }) =>
        withBlock(this.keyword(keyword, this.tokenBefore(firstStart(items))), items.map(print)),
      ),
    );
  }

  private namedValue(node: Ast.NamedValue): Doc {
    return cat(this.name(node.name), text(' := '), this.expression(node.value));
  }

  private relationEnd(end: Ast.RelationEnd): Doc {
    return cat(this.name(end.entity), text('['), this.name(end.field), text(']'));
  }

  /** A field of a model or an error's data, or an action's parameter: `name?: Type := default`. */
  private field(node: Ast.Field | Ast.Parameter): Doc {
    return cat(
      this.name(node.name),
      text(node.optional ? '?: ' : ': '),
      this.type(node.valueType),
      node.defaultValue === undefined ? [] : cat(text(' := '), this.expression(node.defaultValue)),
    );
  }

  private entityLine(node: Ast.EntityLine): Doc {
    const start = startOf(node);
    switch (node.type) {
      case 'subjectLine':
        return text('subject', start);
      case 'identityLine':
        return cat(text('identity ', start), join(node.fields.map((field) => this.name(field)), ', '));
      case 'groupLine':
        return cat(text('group ', start), this.name(node.name));
      case 'roleLine':
        return cat(text('role ', start), this.name(node.name));
      case 'membershipLine':
        return cat(
          text('membership ', start),
          this.name(node.member),
          text(' in '),
          this.name(node.group),
          node.roles === undefined ? [] : cat(text(' with '), this.name(node.roles)),
        );
      case 'modelsBlock':
        return withBlock(text('models', start), node.models.map((model) => this.name(model)));
      case 'exposeBlock':
        return withBlock(
          text('expose', start),
          node.items.map((item) =>
            item.type === 'builtIn'
              ? this.expression(item)
              : cat(this.name(item.field), item.as === undefined ? [] : cat(text(' as '), this.name(item.as))),
          ),
        );
      case 'hideBlock':
        return withBlock(text('hide', start), node.items.map((item) => this.expression(item)));
    }
  }

  private errorData(node: Ast.ErrorDeclaration): Doc[] {
    const { data } = node;
    if (data === undefined) return [];
    if (Array.isArray(data)) {
      const first = data[0];
      if (first === undefined) return [];
      return [withBlock(this.keyword('data', this.tokenBefore(startOf(first))), data.map((field) => this.field(field)))];
    }
    return [cat(this.keyword('data ', this.tokenBefore(startOf(data))), this.name(data))];
  }

  // ----- Types -----

  private type(node: Ast.TypeRef | Ast.VoidType | Ast.ErrorType): Doc {
    const start = startOf(node);
    switch (node.type) {
      case 'baseType':
        return text(node.name, start);
      case 'voidType':
        return text('VOID', start);
      case 'unknownType':
        return text('UNKNOWN', start);
      case 'errorType':
        return text('ERROR', start);
      case 'enum':
        return cat(text('enum(', start), join(node.values.map((value) => this.expression(value)), ', '), text(')'));
      case 'arrayType':
        return cat(text('[', start), this.type(node.elementType), text(']'));
      case 'mapType':
        return cat(text('{', start), this.type(node.valueType), text('}'));
      case 'setType':
        return cat(text('SET(', start), this.type(node.elementType), text(')'));
      case 'genericType':
        return cat(this.name(node.name), text('<'), join(node.arguments.map((argument) => this.type(argument)), ', '), text('>'));
      case 'identifier':
      case 'qualifiedIdentifier':
        return this.name(node);
    }
  }

  private name(node: Ast.Name): Doc {
    return node.type === 'identifier'
      ? text(node.value, startOf(node), endOf(node))
      : cat(this.name(node.namespace), text('::'), this.name(node.name));
  }

  // ----- Statements -----

  private statement(node: Ast.Statement): Doc {
    const start = startOf(node);
    switch (node.type) {
      case 'expressionStatement':
        return this.expression(node.expression);
      case 'assignment':
        return cat(this.expression(node.target), text(' := '), this.expression(node.value));
      case 'delete':
        return cat(text('delete ', start), this.expression(node.target));
      case 'ignoredStatement':
        return cat(text('ignore ', start), this.statement(node.statement));
      case 'return':
        if (node.argument === undefined) return text('return', start);
        return cat(
          text('return ', start),
          node.argument.type === 'nothing' ? text('NOTHING', startOf(node.argument)) : this.expression(node.argument),
        );
      case 'raise':
        return cat(
          text('raise ', start),
          this.name(node.error),
          node.arguments === undefined ? [] : cat(text('('), this.arguments(node.arguments), text(')')),
          node.data === undefined ? [] : cat(text(' with '), this.expression(node.data)),
        );
      case 'pass':
        return cat(text('pass ', start), this.expression(node.argument));
      case 'assert':
        return cat(
          text('assert ', start),
          this.expression(node.test),
          node.message === undefined ? [] : cat(text(', '), this.expression(node.message)),
        );
      case 'break':
        return text('break', start);
      case 'continue':
        return text('continue', start);
      case 'for':
        return withBlock(
          cat(text('for ', start), this.name(node.variable), text(' in '), this.expression(node.iterable)),
          node.children.map((statement) => this.statement(statement)),
        );
      case 'while':
        return withBlock(
          cat(text('while ', start), this.expression(node.test)),
          node.children.map((statement) => this.statement(statement)),
        );
      case 'if':
        return this.ifStatement(node);
    }
  }

  private ifStatement(node: Ast.IfStatement): Doc {
    const [consequent, alternate] = node.children;
    const head = withBlock(
      cat(text('if ', startOf(node)), this.expression(node.test)),
      consequent.children.map((statement) => this.statement(statement)),
    );
    if (alternate === undefined) return head;

    const elseStart = this.tokenAfter('else', endOf(consequent));
    return stack(
      head,
      alternate.type === 'if'
        ? cat(this.keyword('else ', elseStart), this.ifStatement(alternate))
        : withBlock(
            this.keyword('else', elseStart),
            alternate.children.map((statement) => this.statement(statement)),
          ),
    );
  }

  // ----- Expressions -----

  private arguments(args: Ast.Argument[]): Doc {
    return join(
      args.map((arg) =>
        arg.name === undefined ? this.expression(arg.value) : cat(this.name(arg.name), text(' := '), this.expression(arg.value)),
      ),
      ', ',
    );
  }

  /** An operand, in parentheses if it binds more loosely than `loosest`. */
  private operand(node: Ast.Expression, loosest: number, force = false): Doc {
    return force || precedence(node) < loosest
      ? cat(text('('), this.expression(node), text(')'))
      : this.expression(node);
  }

  private expression(node: Ast.Expression | Ast.ConstantValue): Doc {
    const start = startOf(node);
    switch (node.type) {
      case 'identifier':
      case 'qualifiedIdentifier':
        return this.name(node);
      case 'builtIn':
        return text(`@${node.name}`, start, endOf(node));
      case 'string':
        return this.string(node);
      case 'number':
        return this.slice(node);
      case 'boolean':
        return text(String(node.value), start, endOf(node));
      case 'dateTime':
        return text(`DATE_TIME("${node.value}")`, start, endOf(node));
      case 'duration':
        return text(`DURATION("${node.value}")`, start, endOf(node));
      case 'array':
        return this.collection(node, '[', ']', node.elements.map((element) => this.expression(element)));
      case 'set':
        return this.collection(node, 'SET(', ')', node.elements.map((element) => this.expression(element)));
      case 'object':
        return this.collection(
          node,
          '{',
          '}',
          node.items.map((item) =>
            cat(
              item.name.type === 'string' ? this.slice(item.name) : this.expression(item.name),
              text(' := '),
              this.expression(item.value),
            ),
          ),
        );
      case 'member':
        // `1.x` would read as the number `1.` followed by `x`.
        return cat(
          this.operand(node.object, POSTFIX, node.object.type === 'number'),
          text('.'),
          this.name(node.property),
        );
      case 'index':
        return cat(this.operand(node.object, POSTFIX), text('['), this.expression(node.index), text(']'));
      case 'call':
        return cat(this.operand(node.callee, POSTFIX), text('('), this.arguments(node.arguments), text(')'));
      case 'unary': {
        const argument = this.operand(node.argument, PREFIX);
        if (WORD_OPERATORS.has(node.operator)) return cat(text(`${node.operator} `, start), argument);
        // `- -a`, not `--a`, which reads as a different operator.
        const spaced = node.operator === '-' && (argument[0]?.text.startsWith('-') ?? false);
        return cat(text(spaced ? '- ' : node.operator, start), argument);
      }
      case 'binary':
        return this.binary(node);
      case 'instanceOf':
        return cat(
          this.operand(node.value, COMPARISON + 1),
          text(' instanceOf '),
          this.type(node.target),
          text(node.optional ? '?' : ''),
        );
      case 'canPredicate':
        return cat(
          this.expression(node.subject),
          text(' can '),
          this.slice(node.permission),
          node.group === undefined ? [] : cat(text(' within '), this.operand(node.group, POSTFIX)),
        );
      case 'isPredicate':
        return cat(this.expression(node.subject), text(' is '), this.expression(node.subjectType));
      case 'rolePredicate':
        return cat(
          this.expression(node.subject),
          text(' is '),
          this.name(node.role),
          text(' within '),
          this.operand(node.group, POSTFIX),
        );
    }
  }

  private binary(node: Ast.BinaryExpression): Doc {
    const [left, right] = operandPrecedence(node.operator);
    // `and` inside `or` is always in parentheses, so how they group is plain to see.
    const mixed = (operand: Ast.Expression): boolean =>
      node.operator === 'or' && operand.type === 'binary' && operand.operator === 'and';
    // `(-a) ** 2` keeps its parentheses: `-a ** 2` means the same but reads as `-(a ** 2)`.
    const prefixedBase = node.operator === '**' && node.left.type === 'unary';
    // `orElse` takes a negated postfix expression on its right without parentheses.
    const negatedRight =
      node.operator === 'orElse' &&
      node.right.type === 'unary' &&
      node.right.operator === '-' &&
      precedence(node.right.argument) >= POSTFIX;
    return cat(
      this.operand(node.left, left, mixed(node.left) || prefixedBase),
      text(` ${node.operator} `),
      negatedRight ? this.expression(node.right) : this.operand(node.right, right, mixed(node.right)),
    );
  }

  private string(node: Ast.StringLiteral): Doc {
    if (node.parts.every((part) => part.type === 'text')) return this.slice(node);
    return cat(
      text('"', startOf(node)),
      ...node.parts.map((part) =>
        part.type === 'text' ? this.slice(part) : cat(text('${'), this.expression(part.expression), text('}')),
      ),
      text('"', endOf(node) - 1),
    );
  }

  /**
   * An array, a set or an object value. One written on a single line stays on one; one that
   * spans lines has each item on its own line, with a trailing comma.
   */
  private collection(node: Ast.Expression, open: string, close: string, items: Doc[]): Doc {
    const start = startOf(node);
    const end = endOf(node);
    const spansLines = node.position.start.line !== node.position.end.line;
    if (!spansLines || (items.length === 0 && !this.hasComment(start, end))) {
      if (items.length === 0) return text(`${open}${close}`, start, end);
      const pad = open === '{' ? ' ' : '';
      return cat(text(`${open}${pad}`, start), join(items, ', '), text(`${pad}${close}`, end - close.length, end));
    }
    return withBlock(text(open, start), [
      ...items.map((item) => cat(item, text(','))),
      [{ depth: -1, text: close, start: end - close.length, end, closes: true }],
    ]);
  }
}

// ----- Comments and blank lines -----

interface OutputLine {
  depth: number;
  text: string;
  start: number;
  end: number;
  closes: boolean;
  trailing?: string;
  /** Whether a blank line comes before this one. */
  blankBefore: boolean;
}

/** The column of an offset, counted from 0, where tabs count as one. */
const columnOf = (source: string, offset: number): number => offset - (source.lastIndexOf('\n', offset - 1) + 1);

/**
 * Put the printed lines and the source's comments together. A comment after code on its line
 * stays at the end of the line that code is printed on; any other comment goes on its own line
 * before the next line of code, indented to match the code its source indentation matches.
 */
const layout = (lines: Line[], comments: Comment[], source: string): OutputLine[] => {
  const code = lines.map((line, index) => {
    const previous = lines[index - 1];
    // Every line starts with something from the source; if not, it belongs just after the line before.
    const start = line.start ?? previous?.end ?? 0;
    return { ...line, start, end: line.end ?? start };
  });
  const opens = (index: number): boolean => {
    const line = code[index];
    const next = code[index + 1];
    return line !== undefined && (line.opens === true || (next !== undefined && next.depth > line.depth));
  };

  const trailing = new Map<number, string>();
  const before = new Map<number, Comment[]>();
  for (const comment of comments) {
    const start = comment.position.start.offset ?? 0;
    const lineStart = source.lastIndexOf('\n', start - 1) + 1;
    const codeBefore = source.slice(lineStart, start).trimEnd();
    if (codeBefore.trim() !== '') {
      const lastCode = lineStart + codeBefore.length - 1;
      const index = code.findLastIndex((line) => line.start <= lastCode);
      if (index !== -1 && !trailing.has(index)) {
        trailing.set(index, comment.text.trimEnd());
        continue;
      }
    }
    const next = code.findIndex((line) => line.start > start);
    const index = next === -1 ? code.length : next;
    before.set(index, [...(before.get(index) ?? []), comment]);
  }

  const depthOf = (comment: Comment, nextIndex: number): number => {
    const column = comment.position.start.column - 1;
    const next = code[nextIndex];
    if (next !== undefined && columnOf(source, next.start) === column) return next.depth;
    for (let index = nextIndex - 1; index >= 0; index -= 1) {
      const line = code[index];
      if (line === undefined) continue;
      const lineColumn = columnOf(source, line.start);
      if (lineColumn > column) continue;
      return lineColumn < column && opens(index) ? line.depth + 1 : line.depth;
    }
    return 0;
  };

  const out: OutputLine[] = [];
  const push = (line: Omit<OutputLine, 'blankBefore'>): void => {
    const previous = out.at(-1);
    const gap = previous === undefined ? '' : source.slice(previous.end, line.start);
    const blankBefore =
      previous !== undefined && /\n[ \t]*\r?\n/.test(gap) && line.depth <= previous.depth && !line.closes;
    out.push({ ...line, blankBefore });
  };
  const pushComments = (index: number): void => {
    for (const comment of before.get(index) ?? []) {
      const start = comment.position.start.offset ?? 0;
      push({
        depth: depthOf(comment, index),
        text: comment.text.trimEnd(),
        start,
        end: start + comment.text.length,
        closes: false,
      });
    }
  };

  for (const [index, line] of code.entries()) {
    pushComments(index);
    const comment = trailing.get(index);
    push({
      depth: line.depth,
      text: line.text,
      start: line.start,
      end: line.end,
      closes: line.closes === true,
      ...(comment !== undefined && { trailing: comment }),
    });
  }
  pushComments(code.length);
  return out;
};

/** Render lines, lining up the trailing comments of consecutive lines at the same depth. */
const render = (lines: OutputLine[], eol: string): string => {
  const rendered: string[] = [];
  let run: OutputLine[] = [];
  const flush = (): void => {
    const width = Math.max(...run.map((line) => INDENT.length * line.depth + line.text.length));
    for (const line of run) {
      const code = INDENT.repeat(line.depth) + line.text;
      rendered.push(`${code.padEnd(width)}  ${line.trailing ?? ''}`);
    }
    run = [];
  };

  for (const line of lines) {
    const previous = run.at(-1);
    if (previous !== undefined && (line.trailing === undefined || line.blankBefore || line.depth !== previous.depth)) {
      flush();
    }
    if (line.blankBefore && rendered.length > 0) rendered.push('');
    if (line.trailing === undefined) rendered.push(INDENT.repeat(line.depth) + line.text);
    else run.push(line);
  }
  if (run.length > 0) flush();

  return rendered.length === 0 ? '' : rendered.join(eol) + eol;
};

// ----- Checking the result -----

/** Copy a tree without its `position` fields, so that two trees can be compared by shape. */
const withoutPositions = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutPositions);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'position')
      .map(([key, child]) => [key, withoutPositions(child)]),
  );
};

const commentTexts = (source: string): string[] => findComments(source).map((comment) => comment.text.trimEnd());

/**
 * Format Cant source (docs/adr/0041-formatting.md). The result has the same syntax tree and the
 * same comments, in the same order; only layout changes. Formatting formatted source changes nothing.
 *
 * @throws {ParseError} if the source is not valid Cant.
 */
export function format(source: string): string {
  const program = parse(source);
  const comments = findComments(source);
  const lines = new Printer(source, comments).program(program);
  const output = render(layout(lines, comments, source), source.includes('\r\n') ? '\r\n' : '\n');

  // The formatter must never change what a program means or lose a comment.
  let reparsed: Ast.Program;
  try {
    reparsed = parse(output);
  } catch (caught) {
    throw new Error(`The formatter produced Cant that doesn't parse, which is a bug in the formatter: ${String(caught)}`, {
      cause: caught,
    });
  }
  if (JSON.stringify(withoutPositions(reparsed)) !== JSON.stringify(withoutPositions(program))) {
    throw new Error('The formatter changed the meaning of the program, which is a bug in the formatter.');
  }
  if (JSON.stringify(commentTexts(output)) !== JSON.stringify(commentTexts(source))) {
    throw new Error('The formatter lost or reordered a comment, which is a bug in the formatter.');
  }
  return output;
}
