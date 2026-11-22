import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  checkProgram,
  fileSystemHost,
  MAIN_NAMESPACE,
  type CheckedProgram,
  type Diagnostic as CantDiagnostic,
  type Host,
  type LocalBinding,
  type Module,
  type ModuleSymbol,
} from '@dancrumb/cant-compiler';
import { KEYWORDS, type Identifier, type Name, type QualifiedIdentifier } from '@dancrumb/cant-shared';
import type { Node, Position as UnistPosition } from 'unist';
import { meaning, walk, type Meaning, type NameAt } from './names.ts';
import { semanticTokens } from './semanticTokens.ts';
import {
  CompletionItemKind,
  DiagnosticSeverity,
  MarkupKind,
  SymbolKind,
  type CompletionItem,
  type Diagnostic,
  type DocumentSymbol,
  type Hover,
  type Location,
  type Position,
  type Range,
} from 'vscode-languageserver/node';

/** A file's URI, as the editor names it. */
export type Uri = string;

const toPath = (uri: Uri): string | undefined => (uri.startsWith('file:') ? fileURLToPath(uri) : undefined);
const toUri = (path: string): Uri => pathToFileURL(path).href;
/** Whether a module's path is a file, rather than a standard library module such as `cant::IO`, which has none. */
const isFile = (path: string): boolean => !path.startsWith('cant::');

/** A unist position, whose lines and columns are 1-based, as an LSP range, whose are 0-based. */
export const toRange = ({ start, end }: UnistPosition): Range => ({
  start: { line: start.line - 1, character: start.column - 1 },
  end: { line: end.line - 1, character: end.column - 1 },
});

/** The offset in `source` of an LSP position. */
const offsetOf = (source: string, { line, character }: Position): number => {
  let offset = 0;
  for (let current = 0; current < line; current++) {
    const next = source.indexOf('\n', offset);
    if (next === -1) {
return source.length;
}
    offset = next + 1;
  }
  const lineEnd = source.indexOf('\n', offset);
  return Math.min(offset + character, lineEnd === -1 ? source.length : lineEnd);
};

const contains = (position: UnistPosition | undefined, offset: number): boolean =>
  position?.start.offset !== undefined && position.end.offset !== undefined && position.start.offset <= offset && offset <= position.end.offset;

const sameSymbol = (a: ModuleSymbol, b: ModuleSymbol): boolean => a.module === b.module && a.name === b.name && a.kind === b.kind;

const SYMBOL_KINDS: Partial<Record<string, SymbolKind>> = {
  action: SymbolKind.Function,
  model: SymbolKind.Struct,
  enumDeclaration: SymbolKind.Enum,
  entity: SymbolKind.Class,
  errorDeclaration: SymbolKind.Event,
  const: SymbolKind.Constant,
  trigger: SymbolKind.Event,
  permissions: SymbolKind.Key,
  relation: SymbolKind.Interface,
  namespace: SymbolKind.Namespace,
  import: SymbolKind.Module,
};

const describeKind = (symbol: ModuleSymbol): string =>
  symbol.kind === 'action' ? 'action' : symbol.kind === 'const' ? 'constant' : (symbol.typeKind ?? 'type');

/** The most lines of a declaration a hover shows. */
const HOVER_LINES = 12;

/**
 * The Cant files a language server knows about: the ones open in the editor, whose text may not
 * be saved yet, and the ones on disk that they import. It checks each open file as the entry of
 * a program, and answers questions about positions in them.
 */
export class Workspace {
  private readonly documents = new Map<string, string>();
  private readonly programs = new Map<string, CheckedProgram>();
  /** The last version of each module that parsed, for completion while a file has a syntax error. */
  private readonly lastParsed = new Map<string, Module>();
  private readonly host: Host;

  constructor(disk: Host = fileSystemHost) {
    this.host = {
      readFile: (path) => this.documents.get(path) ?? disk.readFile(path),
    };
  }

  /** Open or change a document. */
  set(uri: Uri, text: string): void {
    const path = toPath(uri);
    if (path === undefined) {
return;
}
    this.documents.set(path, text);
    this.programs.clear();
  }

  /** Close a document: it is read from disk again. */
  close(uri: Uri): void {
    const path = toPath(uri);
    if (path === undefined) {
return;
}
    this.documents.delete(path);
    this.programs.clear();
  }

  /** Forget what was checked, as when files change on disk. */
  invalidate(): void {
    this.programs.clear();
  }

  /** The open documents' URIs. */
  get open(): Uri[] {
    return [...this.documents.keys()].map(toUri);
  }

  private program(path: string): CheckedProgram {
    let program = this.programs.get(path);
    if (program === undefined) {
      program = checkProgram(path, this.host);
      this.programs.set(path, program);
      for (const module of program.modules.values()) {
if (module.program !== undefined) {
this.lastParsed.set(module.path, module);
}
}
    }
    return program;
  }

  private module(uri: Uri): { program: CheckedProgram; module: Module } | undefined {
    const path = toPath(uri);
    if (path === undefined) {
return undefined;
}
    const program = this.program(path);
    const module = program.modules.get(path);
    return module === undefined ? undefined : { program, module };
  }

  /**
   * The problems in every file the open documents' programs use, by URI. A file is listed, with
   * no problems, when it was checked and is fine, so that earlier problems can be cleared.
   */
  diagnostics(): Map<Uri, Diagnostic[]> {
    const byFile = new Map<string, Diagnostic[]>();
    const seen = new Set<string>();
    for (const path of this.documents.keys()) {
      const program = this.program(path);
      for (const module of program.modules.keys()) {
if (isFile(module) && !byFile.has(module)) {
byFile.set(module, []);
}
}
      for (const diagnostic of program.diagnostics) {
        const file = diagnostic.file ?? path;
        if (!isFile(file)) {
continue;
}
        // A module that several open documents import is reported once.
        const key = `${file}:${String(diagnostic.position.start.offset)}:${diagnostic.code}:${diagnostic.message}`;
        if (seen.has(key)) {
continue;
}
        seen.add(key);
        let list = byFile.get(file);
        if (list === undefined) {
byFile.set(file, (list = []));
}
        list.push(toDiagnostic(diagnostic));
      }
    }
    return new Map([...byFile].map(([path, list]) => [toUri(path), list]));
  }

  /** The name at a position in a document, and what it means. */
  private meaningAt(uri: Uri, position: Position): { module: Module; program: CheckedProgram; name: NameAt; meaning: Meaning | undefined } | undefined {
    const found = this.module(uri);
    if (found?.module.program === undefined) {
return undefined;
}
    const { module, program } = found;
    const offset = offsetOf(module.source, position);

    let best: NameAt | undefined;
    for (const { node, parent } of walk(module.program)) {
      if ((node.type === 'identifier' || node.type === 'qualifiedIdentifier') && contains(node.position, offset)) {
        // The innermost name wins, except that a part of a qualified name means the whole.
        if (best?.node.type === 'qualifiedIdentifier' && node.type === 'identifier' && parent === best.node) {
continue;
}
        best = { node: node as Identifier | QualifiedIdentifier, parent };
      }
    }
    if (best === undefined) {
return undefined;
}
    return { module, program, name: best, meaning: meaning(module, program, best) };
  }

  /** A document's semantic tokens, encoded as the Language Server Protocol sends them. */
  semanticTokens(uri: Uri): number[] {
    const path = toPath(uri);
    const source = path === undefined ? undefined : this.documents.get(path);
    if (source === undefined) {
return [];
}
    const found = this.module(uri);
    return semanticTokens(source, found?.module, found?.program);
  }

  /** Where the name at a position is declared. */
  definition(uri: Uri, position: Position): Location | undefined {
    const found = this.meaningAt(uri, position);
    if (found?.meaning === undefined) {
return undefined;
}
    if (found.meaning.kind === 'local') {
return { uri, range: toRange(found.meaning.binding.declaration.position) };
}
    const { symbol } = found.meaning;
    if (symbol.declaration === undefined || !isFile(symbol.module)) {
return undefined;
}
    return { uri: toUri(symbol.module), range: toRange(symbol.declaration.name.position) };
  }

  /** Everywhere the name at a position is used, in the program of the document it is in. */
  references(uri: Uri, position: Position, includeDeclaration: boolean): Location[] {
    const found = this.meaningAt(uri, position);
    if (found?.meaning === undefined) {
return [];
}
    const { meaning, program } = found;
    const locations: Location[] = [];

    if (meaning.kind === 'local') {
      for (const [identifier, binding] of program.locals) {
        if (binding.declaration !== meaning.binding.declaration) {
continue;
}
        if (identifier === binding.declaration && !includeDeclaration) {
continue;
}
        locations.push({ uri, range: toRange(identifier.position) });
      }
    } else {
      const { symbol } = meaning;
      if (includeDeclaration && symbol.declaration !== undefined && isFile(symbol.module)) {
        locations.push({ uri: toUri(symbol.module), range: toRange(symbol.declaration.name.position) });
      }
      for (const module of program.modules.values()) {
        if (!isFile(module.path)) {
continue;
}
        for (const { node } of walk(module.program)) {
          if (node.type !== 'identifier' && node.type !== 'qualifiedIdentifier') {
continue;
}
          const referred = program.references.get(node as Name);
          if (referred !== undefined && sameSymbol(referred, symbol)) {
            locations.push({ uri: toUri(module.path), range: toRange((node as Name).position) });
          }
        }
      }
    }
    return locations.sort((a, b) => a.uri.localeCompare(b.uri) || a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);
  }

  /** What the name at a position is: its declaration, as it is written. */
  hover(uri: Uri, position: Position): Hover | undefined {
    const found = this.meaningAt(uri, position);
    if (found?.meaning === undefined) {
return undefined;
}
    const { meaning, program, module, name } = found;
    const range = toRange(name.node.position);

    if (meaning.kind === 'local') {
      const declared = declarationOfLocal(module, meaning.binding);
      return markdown(`(${meaning.binding.kind}) ${meaning.binding.declaration.value}`, declared, range);
    }
    const { symbol } = meaning;
    const where = symbol.declaration === undefined ? 'the standard library' : symbol.module === module.path ? undefined : symbol.module;
    const title = `(${describeKind(symbol)}) ${symbol.name}${where === undefined ? '' : ` — from ${where.startsWith('cant::') ? symbol.module : where}`}`;
    if (symbol.declaration === undefined) {
return markdown(title, undefined, range);
}
    const source = program.modules.get(symbol.module)?.source;
    return markdown(title, source === undefined ? undefined : declarationText(source, symbol.declaration), range);
  }

  /** The outline of a document: its top-level declarations, and their parameters, fields and members. */
  symbols(uri: Uri): DocumentSymbol[] {
    const found = this.module(uri);
    if (found?.module.program === undefined) {
return [];
}
    const symbols: DocumentSymbol[] = [];
    for (const declaration of found.module.program.children) {
      const kind = SYMBOL_KINDS[declaration.type];
      if (kind === undefined) {
continue;
}
      const range = toRange(declaration.position);
      const symbol = (name: string, selection: UnistPosition, children: DocumentSymbol[] = []): DocumentSymbol => ({
        name,
        kind,
        range,
        selectionRange: toRange(selection),
        children,
      });
      const child = (name: Identifier, childKind: SymbolKind, position: UnistPosition): DocumentSymbol => ({
        name: name.value,
        kind: childKind,
        range: toRange(position),
        selectionRange: toRange(name.position),
      });

      switch (declaration.type) {
        case 'action':
          symbols.push(
            symbol(
              declaration.name.value,
              declaration.name.position,
              declaration.parameters.map((parameter) => child(parameter.name, SymbolKind.Variable, parameter.position)),
            ),
          );
          break;
        case 'model':
          symbols.push(
            symbol(
              declaration.name.value,
              declaration.name.position,
              declaration.fields.map((field) => child(field.name, SymbolKind.Field, field.position)),
            ),
          );
          break;
        case 'errorDeclaration':
          symbols.push(
            symbol(
              declaration.name.value,
              declaration.name.position,
              Array.isArray(declaration.data) ? declaration.data.map((field) => child(field.name, SymbolKind.Field, field.position)) : [],
            ),
          );
          break;
        case 'enumDeclaration':
          symbols.push(
            symbol(
              declaration.name.value,
              declaration.name.position,
              declaration.members.map((member) => child(member.name, SymbolKind.EnumMember, member.position)),
            ),
          );
          break;
        case 'entity':
        case 'const':
        case 'namespace':
          symbols.push(symbol(declaration.name.value, declaration.name.position));
          break;
        case 'trigger':
          symbols.push(symbol(`${nameText(declaration.action)} on ${declaration.source.value}`, declaration.action.position));
          break;
        case 'permissions':
          symbols.push(
            symbol(
              `permissions ${declaration.group.value}${declaration.role === undefined ? '' : ` has ${declaration.role.value}`}`,
              declaration.group.position,
            ),
          );
          break;
        case 'relation':
          symbols.push(
            symbol(
              `${nameText(declaration.left.entity)}[${declaration.left.field.value}] — ${nameText(declaration.right.entity)}[${declaration.right.field.value}]`,
              declaration.left.entity.position,
            ),
          );
          break;
        default:
          break;
      }
    }
    return symbols;
  }

  /**
   * What can be written at a position: keywords, the top-level names the module can see, and
   * the local names declared before the position in the same declaration.
   */
  completions(uri: Uri, position: Position): CompletionItem[] {
    const path = toPath(uri);
    if (path === undefined) {
return [];
}
    const current = this.module(uri)?.module;
    const module = current?.program === undefined ? this.lastParsed.get(path) : current;
    const items = new Map<string, CompletionItem>();
    const add = (item: CompletionItem): void => {
      if (!items.has(item.label)) {
items.set(item.label, item);
}
    };

    for (const keyword of KEYWORDS) {
add({ label: keyword, kind: CompletionItemKind.Keyword });
}
    if (module === undefined) {
return [...items.values()];
}

    const prefix = (namespace: string): string => (namespace === MAIN_NAMESPACE ? '' : `${namespace}::`);
    for (const [namespace, declared] of module.symbols?.namespaces ?? []) {
      for (const name of declared.types.keys()) {
add({ label: prefix(namespace) + name, kind: CompletionItemKind.Class });
}
      for (const name of declared.actions.keys()) {
add({ label: prefix(namespace) + name, kind: CompletionItemKind.Function });
}
      for (const name of declared.constants.keys()) {
add({ label: prefix(namespace) + name, kind: CompletionItemKind.Constant });
}
    }
    for (const [namespace, imported] of module.imported) {
      for (const [name, { symbol }] of imported) {
        add({
          label: prefix(namespace) + name,
          kind:
            symbol.kind === 'action'
              ? CompletionItemKind.Function
              : symbol.kind === 'const'
                ? CompletionItemKind.Constant
                : CompletionItemKind.Class,
          detail: symbol.module,
        });
      }
    }

    // Locals: only from a module checked as it is now, whose positions match the text.
    const program = current?.program === undefined ? undefined : this.program(path);
    if (program !== undefined && module.program !== undefined) {
      const offset = offsetOf(module.source, position);
      const enclosing = module.program.children.find((declaration) => contains(declaration.position, offset));
      if (enclosing !== undefined) {
        for (const binding of program.locals.values()) {
          const declared = binding.declaration.position;
          if (contains(enclosing.position, declared.start.offset ?? -1) && (declared.end.offset ?? Infinity) <= offset) {
            add({ label: binding.declaration.value, kind: CompletionItemKind.Variable, detail: binding.kind });
          }
        }
      }
    }
    return [...items.values()];
  }
}

const toDiagnostic = (diagnostic: CantDiagnostic): Diagnostic => ({
  range: toRange(diagnostic.position),
  severity: DiagnosticSeverity.Error,
  code: diagnostic.code,
  source: 'cant',
  message: diagnostic.message,
});

const nameText = (name: Name): string => (name.type === 'qualifiedIdentifier' ? `${name.namespace.value}::${name.name.value}` : name.value);

/** A declaration's text: an action's signature, or the first lines of anything else. */
function declarationText(source: string, declaration: Node & { type: string }): string | undefined {
  const { start, end } = declaration.position ?? {};
  if (start?.offset === undefined || end?.offset === undefined) {
return undefined;
}
  const lines = source.slice(start.offset, end.offset).split(/\r?\n/);
  if (declaration.type === 'action') {
return lines[0];
}
  const shown = lines.slice(0, HOVER_LINES);
  if (lines.length > HOVER_LINES) {
shown.push('    …');
}
  return shown.join('\n');
}

/** The line that declares a local: its parameter or field, or the statement that assigns it. */
function declarationOfLocal(module: Module, binding: LocalBinding): string | undefined {
  for (const { node, parent } of walk(module.program)) {
    if (node !== binding.declaration || parent?.position?.start.offset === undefined) {
continue;
}
    if (parent.type === 'parameter' || parent.type === 'field') {
      return module.source.slice(parent.position.start.offset, parent.position.end.offset);
    }
    break;
  }
  const line = module.source.split(/\r?\n/)[binding.declaration.position.start.line - 1];
  return line?.trim();
}

const markdown = (title: string, code: string | undefined, range: Range): Hover => ({
  contents: {
    kind: MarkupKind.Markdown,
    value: code === undefined ? title : `${title}\n\n\`\`\`cant\n${code}\n\`\`\``,
  },
  range,
});
