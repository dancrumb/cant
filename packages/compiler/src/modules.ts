import { join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  ActionDeclaration,
  ConstDeclaration,
  Identifier,
  ImportDeclaration,
  Name,
  Program,
  StringLiteral,
} from '@dancrumb/cant-shared';
import { check } from './check.ts';
import { MAIN_NAMESPACE, type ModuleSymbols, type TypeDeclaration } from './declarations.ts';
import { error, type Diagnostic } from './diagnostic.ts';
import type { Host } from './host.ts';
import { findManifest, MANIFEST, type Manifest } from './manifest.ts';
import type { Type } from './types.ts';
import { isStandardFile, isStandardModule, isStandardPath, STANDARD_SOURCES, standardPath } from './stdlib.ts';

/** What a declared name is (docs/adr/0006-imports.md lists the constructs a module can export). */
export type SymbolKind = 'type' | 'action' | 'const';

/**
 * The kinds of type a name can be: a declaration's, or one of the internal types that only
 * standard library modules can write (docs/adr/0036-native-modules.md).
 */
export type TypeKind = 'enum' | 'model' | 'entity' | 'error' | 'internal';

/** A top-level symbol: a declaration in some module, or a name a standard library module exports. */
export interface ModuleSymbol {
  kind: SymbolKind;
  /** For a type, which kind of type it is. */
  typeKind?: TypeKind;
  /** The name it is declared with. */
  name: string;
  /** The file that declares it, or the standard library module, such as `cant::Errors`. */
  module: string;
  /** Its declaration, unless it comes from the standard library. */
  declaration?: TypeDeclaration | ActionDeclaration | ConstDeclaration;
  /** For an internal type, or a type parameter, the type it is (docs/adr/0036-native-modules.md). */
  internal?: Type;
}

/** Where an import leads: a file, a standard library module, or nowhere it can be found. */
export type ImportTarget =
  | { kind: 'file'; path: string }
  | { kind: 'standard'; name: string }
  | { kind: 'unresolved' };

/** A symbol that an import has placed in a namespace. */
export interface ImportedSymbol {
  symbol: ModuleSymbol;
  via: ImportDeclaration;
}

export interface Module {
  /**
   * The module's file, as an absolute path, or for a standard library module loaded from its
   * Cant source, its name, such as `cant::IO`.
   */
  path: string;
  /**
   * Whether it is a standard library module: one loaded from the compiler's own source, such as
   * `cant::IO`, or a file that is one of those sources (see `isStandardFile`). Only these can
   * write internal types and type parameters.
   */
  standard: boolean;
  source: string;
  /** Its syntax tree and declarations, unless it has a syntax error. */
  program?: Program;
  symbols?: ModuleSymbols;
  /** Where each of its imports leads. */
  imports: Map<ImportDeclaration, ImportTarget>;
  /** The symbols its imports place in each namespace, by name. */
  imported: Map<string, Map<string, ImportedSymbol>>;
  /** What it exports, by the names importers see. */
  exports: Map<string, ModuleSymbol>;
}

export interface LoadedProgram {
  entry: string;
  manifest?: Manifest;
  /** Every module the program uses, starting with the entry module, by path. */
  modules: Map<string, Module>;
  /** Every problem found, each with the file it is in. */
  diagnostics: Diagnostic[];
}

const TYPE_KIND: Record<TypeDeclaration['type'], TypeKind> = {
  enumDeclaration: 'enum',
  model: 'model',
  entity: 'entity',
  errorDeclaration: 'error',
};

/** A URL with a scheme, such as `https:` or `file:`, as opposed to a relative path. */
const HAS_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

const textOf = (literal: StringLiteral): string =>
  literal.parts.map((part) => (part.type === 'text' ? part.value : '')).join('');

const nameOf = (name: Name): Identifier => (name.type === 'qualifiedIdentifier' ? name.name : name);

export const symbolOf = (
  module: string,
  declaration: TypeDeclaration | ActionDeclaration | ConstDeclaration,
): ModuleSymbol =>
  declaration.type === 'action'
    ? { kind: 'action', name: declaration.name.value, module, declaration }
    : declaration.type === 'const'
      ? { kind: 'const', name: declaration.name.value, module, declaration }
      : { kind: 'type', typeKind: TYPE_KIND[declaration.type], name: declaration.name.value, module, declaration };

/** Whether two symbols are the same declaration, reached by different imports. */
const sameSymbol = (a: ModuleSymbol, b: ModuleSymbol): boolean => a.module === b.module && a.name === b.name && a.kind === b.kind;

/** Whether two symbols can't share a name in one namespace: constants clash with everything (docs/adr/0034-top-level-constants.md). */
const clashes = (a: SymbolKind, b: SymbolKind): boolean => a === b || a === 'const' || b === 'const';

/**
 * Load a program: the entry module, and every module it imports, directly or not. Each module is
 * parsed and its declarations collected (see `check`), its imports are resolved
 * (docs/adr/0031-module-resolution.md), and its exports, including re-exports, are worked out
 * (docs/adr/0006-imports.md). Each import's symbols are placed in the namespace its `into`
 * names, or the namespace it appears in, and names that clash there are reported.
 */
export function loadProgram(entry: string, host: Host): LoadedProgram {
  const entryPath = resolvePath(entry);
  const diagnostics: Diagnostic[] = [];
  const { manifest, diagnostics: manifestDiagnostics } = findManifest(entryPath, host);
  diagnostics.push(...manifestDiagnostics);

  const modules = new Map<string, Module>();
  const report = (module: Module, diagnostic: Diagnostic): void => {
    diagnostics.push({ ...diagnostic, file: module.path });
  };

  // Load every module the entry module reaches, breadth first.
  const queue: { path: string; from?: { module: Module; declaration: ImportDeclaration } }[] = [{ path: entryPath }];
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined || modules.has(next.path)) continue;
    // A standard library module's source is part of the compiler (../stdlib).
    const source = isStandardPath(next.path)
      ? STANDARD_SOURCES.get(next.path.slice('cant::'.length))
      : host.readFile(next.path);
    if (source === undefined) {
      if (next.from === undefined) {
        diagnostics.push({
          ...error('module-not-found', `Can't read ${next.path}.`, { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }),
          file: next.path,
        });
      } else {
        next.from.module.imports.set(next.from.declaration, { kind: 'unresolved' });
        report(
          next.from.module,
          error('module-not-found', `There is no module at ${next.path}.`, next.from.declaration.module.position),
        );
      }
      continue;
    }

    const result = check(source);
    const module: Module = {
      path: next.path,
      standard: isStandardPath(next.path) || isStandardFile(next.path, host),
      source,
      ...(result.program && { program: result.program }),
      ...(result.symbols && { symbols: result.symbols }),
      imports: new Map(),
      imported: new Map(),
      exports: new Map(),
    };
    modules.set(next.path, module);
    for (const diagnostic of result.diagnostics) report(module, diagnostic);

    for (const { declaration } of module.symbols?.imports ?? []) {
      const target = resolveImport(module, declaration, manifest, (diagnostic) => {
        report(module, diagnostic);
      });
      module.imports.set(declaration, target);
      if (target.kind === 'file') queue.push({ path: target.path, from: { module, declaration } });
      if (target.kind === 'standard') queue.push({ path: standardPath(target.name), from: { module, declaration } });
    }
  }

  // Work out each module's exports. A module's re-exports depend on the exports of the modules
  // it imports, so this follows imports, and stops at a module it is already working out, to
  // survive cycles. There, only that module's own exported declarations are seen.
  const state = new Map<Module, 'working' | 'done'>();
  const exportsOf = (module: Module): Map<string, ModuleSymbol> => {
    if (state.has(module)) return module.exports;
    state.set(module, 'working');
    for (const [name, declaration] of module.symbols?.exports ?? []) {
      if (declaration.type !== 'reExport') module.exports.set(name, symbolOf(module.path, declaration));
    }
    placeImports(module);
    for (const { namespace, declaration } of module.symbols?.reExports ?? []) {
      const symbol = findSymbol(module, namespace, declaration.name);
      if (symbol === undefined) {
        report(
          module,
          error(
            'unknown-name',
            `${describeName(declaration.name)} isn't a symbol this module imports, so it can't re-export it.`,
            declaration.name.position,
          ),
        );
      } else if (symbol.module === module.path) {
        report(
          module,
          error(
            're-export-own',
            `${describeName(declaration.name)} is declared in this module. A module exports its own declarations by putting \`export\` before them.`,
            declaration.name.position,
          ),
        );
      } else {
        module.exports.set((declaration.alias ?? nameOf(declaration.name)).value, symbol);
      }
    }
    state.set(module, 'done');
    return module.exports;
  };

  const exportsOfTarget = (target: ImportTarget): Map<string, ModuleSymbol> => {
    // A standard library module is loaded from its source, as a file is (see stdlib.ts).
    const path = target.kind === 'standard' ? standardPath(target.name) : target.kind === 'file' ? target.path : undefined;
    const imported = path === undefined ? undefined : modules.get(path);
    if (imported !== undefined) return exportsOf(imported);
    return new Map();
  };

  // Put each import's symbols in its namespace, and report names that clash there.
  const placed = new Set<Module>();
  const placeImports = (module: Module): void => {
    if (placed.has(module)) return;
    placed.add(module);
    for (const { namespace, declaration } of module.symbols?.imports ?? []) {
      const target = module.imports.get(declaration) ?? { kind: 'unresolved' };
      for (const into of namespacesFor(declaration, namespace)) {
        let names = module.imported.get(into);
        if (names === undefined) {
          names = new Map();
          module.imported.set(into, names);
        }
        for (const [name, symbol] of exportsOfTarget(target)) {
          const local = localSymbol(module, into, name, symbol.kind);
          if (local !== undefined) {
            report(
              module,
              error(
                'import-collision',
                `This import brings ${name} into namespace ${into}, which already declares ${name} on line ${String(local.declaration?.position.start.line)}. Import it into a namespace of its own with \`into\`.`,
                declaration.module.position,
              ),
            );
            continue;
          }
          const earlier = names.get(name);
          if (earlier !== undefined && clashes(earlier.symbol.kind, symbol.kind) && !sameSymbol(earlier.symbol, symbol)) {
            report(
              module,
              error(
                'import-collision',
                `This import brings ${name} into namespace ${into}, but the import on line ${String(earlier.via.position.start.line)} already brought in a different ${name}. Import one of them into a namespace of its own with \`into\`.`,
                declaration.module.position,
              ),
            );
            continue;
          }
          if (earlier === undefined) names.set(name, { symbol, via: declaration });
        }
      }
    }
  };

  for (const module of modules.values()) exportsOf(module);

  return { entry: entryPath, ...(manifest && { manifest }), modules, diagnostics };
}

/**
 * The namespaces an import places its symbols in: the one its `into` names, or else the current
 * namespace and, for a symbolic module identifier, a namespace named after the module
 * (docs/adr/0006-imports.md, docs/adr/0038-namespaces-from-imports.md).
 */
function namespacesFor(declaration: ImportDeclaration, current: string): string[] {
  if (declaration.namespace !== undefined) return [declaration.namespace.value];
  if (declaration.module.type !== 'moduleName') return [current];
  const named = declaration.module.name.value;
  return named === current ? [current] : [current, named];
}

/** Where an import leads (docs/adr/0031-module-resolution.md). */
function resolveImport(
  module: Module,
  declaration: ImportDeclaration,
  manifest: Manifest | undefined,
  report: (diagnostic: Diagnostic) => void,
): ImportTarget {
  if (declaration.moduleType !== undefined) {
    report(
      error(
        'module-type',
        '`as` accepts no module types yet, so every module is Cant source. Leave `as` out.',
        declaration.moduleType.position,
      ),
    );
    return { kind: 'unresolved' };
  }

  const identifier = declaration.module;
  if (identifier.type === 'string') {
    const path = fileFromUrl(module.path, textOf(identifier));
    if (path === undefined) {
      report(
        error(
          'remote-module',
          `"${textOf(identifier)}" isn't a local file. For now, every module must be read from a file, and remote URLs can't be imported.`,
          identifier.position,
        ),
      );
      return { kind: 'unresolved' };
    }
    return { kind: 'file', path };
  }

  const scope = identifier.scope?.value ?? 'cant';
  const name = identifier.name.value;
  if (scope === 'cant') {
    if (isStandardModule(name)) return { kind: 'standard', name };
    report(error('module-not-found', `The standard library has no module called cant::${name}.`, identifier.position));
    return { kind: 'unresolved' };
  }
  const directory = manifest?.scopes.get(scope);
  if (directory === undefined) {
    report(
      error(
        'unknown-scope',
        manifest === undefined
          ? `There is no ${MANIFEST} to say where the ${scope} scope is. Add one that maps "${scope}" to a directory.`
          : `${manifest.path} doesn't map the ${scope} scope to a directory.`,
        identifier.scope?.position ?? identifier.position,
      ),
    );
    return { kind: 'unresolved' };
  }
  return { kind: 'file', path: join(directory, `${name}.cant`) };
}

/**
 * The file a URL in a module names, resolved against the module's own location, or `undefined`
 * if it is a remote URL (docs/adr/0031-module-resolution.md).
 */
export function fileFromUrl(modulePath: string, url: string): string | undefined {
  if (HAS_SCHEME.test(url) && !url.startsWith('file:')) return undefined;
  return fileURLToPath(new URL(url, pathToFileURL(modulePath)));
}

/** The module's own declaration of `name` in `namespace` that a symbol of `kind` would clash with. */
function localSymbol(module: Module, namespace: string, name: string, kind: SymbolKind): ModuleSymbol | undefined {
  const declared = module.symbols?.namespaces.get(namespace);
  if (declared === undefined) return undefined;
  const candidates = [
    declared.types.get(name),
    declared.actions.get(name),
    declared.constants.get(name),
  ].filter((declaration) => declaration !== undefined);
  return candidates.map((declaration) => symbolOf(module.path, declaration)).find((symbol) => clashes(symbol.kind, kind));
}

/** Every symbol `name` could mean in `namespace` of `module`: its own declarations, then imported ones. */
export function symbolsNamed(module: Module, namespace: string, name: string): ModuleSymbol[] {
  const found: ModuleSymbol[] = [];
  const declared = module.symbols?.namespaces.get(namespace);
  for (const declaration of [declared?.types.get(name), declared?.actions.get(name), declared?.constants.get(name)]) {
    if (declaration !== undefined) found.push(symbolOf(module.path, declaration));
  }
  const imported = module.imported.get(namespace)?.get(name)?.symbol;
  if (imported !== undefined && !found.some((symbol) => clashes(symbol.kind, imported.kind))) found.push(imported);
  return found;
}

/** Whether `namespace` exists in `module`: it declares something there, or imports into it. */
export function hasNamespace(module: Module, namespace: string): boolean {
  return namespace === MAIN_NAMESPACE || module.symbols?.namespaces.has(namespace) === true || module.imported.has(namespace);
}

/**
 * The symbol a name means where it appears: in the namespace it names, or the current namespace
 * if it names none (docs/adr/0005-module-namespaces.md). When it could mean symbols of several
 * kinds, the first is a type, then an action, then a constant.
 */
export function findSymbol(module: Module, namespace: string, name: Name): ModuleSymbol | undefined {
  return name.type === 'qualifiedIdentifier'
    ? symbolsNamed(module, name.namespace.value, name.name.value)[0]
    : symbolsNamed(module, namespace, name.value)[0];
}

export const describeName = (name: Name): string =>
  name.type === 'qualifiedIdentifier' ? `${name.namespace.value}::${name.name.value}` : name.value;
