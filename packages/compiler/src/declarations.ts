import type {
  ActionDeclaration,
  ConstDeclaration,
  EntityDeclaration,
  EnumDeclaration,
  ErrorDeclaration,
  Field,
  Identifier,
  ImportDeclaration,
  ModelDeclaration,
  PermissionsDeclaration,
  Program,
  ReExport,
  RelationDeclaration,
  TriggerDeclaration,
} from '@dancrumb/cant-shared';
import type { Position } from 'unist';
import { error, type Diagnostic } from './diagnostic.ts';

/** The namespace a module's declarations are in until a `namespace` line (docs/adr/0005-module-namespaces.md). */
export const MAIN_NAMESPACE = '__main__';

/** A declaration that types can name: an enum, a model, an entity or an error. */
export type TypeDeclaration = EnumDeclaration | ModelDeclaration | EntityDeclaration | ErrorDeclaration;

/** A declaration a module can export, or a re-export (docs/adr/0006-imports.md). */
export type ExportedDeclaration = TypeDeclaration | ActionDeclaration | ConstDeclaration | ReExport;

/** The names a module declares in one namespace. */
export interface NamespaceSymbols {
  name: string;
  /** Enums, models, entities and errors, which share one set of type names (docs/adr/0013-enums.md, 0027, 0023). */
  types: Map<string, TypeDeclaration>;
  actions: Map<string, ActionDeclaration>;
  constants: Map<string, ConstDeclaration>;
}

/**
 * What a module declares, gathered from its syntax tree before any name is resolved. Imports,
 * re-exports, triggers, `permissions` declarations and relations refer to names that later
 * passes resolve, so they are only listed here, each with the namespace it appears in.
 */
export interface ModuleSymbols {
  namespaces: Map<string, NamespaceSymbols>;
  /** The names the module exports, own declarations and re-exports alike (docs/adr/0006-imports.md). */
  exports: Map<string, ExportedDeclaration>;
  imports: InNamespace<ImportDeclaration>[];
  reExports: InNamespace<ReExport>[];
  triggers: InNamespace<TriggerDeclaration>[];
  permissions: InNamespace<PermissionsDeclaration>[];
  relations: InNamespace<RelationDeclaration>[];
}

/** A declaration and the namespace in effect where it appears. */
export interface InNamespace<T> {
  namespace: string;
  declaration: T;
}

export interface CollectedDeclarations {
  symbols: ModuleSymbols;
  diagnostics: Diagnostic[];
}

const KIND: Record<TypeDeclaration['type'], string> = {
  enumDeclaration: 'an enum',
  model: 'a model',
  entity: 'an entity',
  errorDeclaration: 'an error',
};

const describe = (declaration: TypeDeclaration | ActionDeclaration | ConstDeclaration): string =>
  declaration.type === 'action' ? 'an action' : declaration.type === 'const' ? 'a constant' : KIND[declaration.type];

const line = (position: Position): string => `line ${String(position.start.line)}`;

/**
 * Gather a module's declarations into a symbol table, one per namespace, and report the names
 * that are declared twice where the ADRs allow only one:
 *
 * - two types with the same name in a namespace (docs/adr/0013-enums.md, 0023, 0027);
 * - two actions with the same name in a namespace;
 * - a constant with the same name as an action, a type or another constant (docs/adr/0034-top-level-constants.md);
 * - two exported symbols with the same name (docs/adr/0006-imports.md);
 * - two test cases with the same name (docs/adr/0037-test-case-trigger-source.md);
 * - inside a declaration: two parameters, model fields or error data fields with the same name,
 *   two enum members with the same name or value, two roles with the same name, and more than
 *   one `identity`, `membership`, `expose` or `hide` in an entity.
 */
export function collectDeclarations(program: Program): CollectedDeclarations {
  const diagnostics: Diagnostic[] = [];
  const namespaces = new Map<string, NamespaceSymbols>();
  const exports = new Map<string, ExportedDeclaration>();
  const symbols: ModuleSymbols = {
    namespaces,
    exports,
    imports: [],
    reExports: [],
    triggers: [],
    permissions: [],
    relations: [],
  };

  const namespaceNamed = (name: string): NamespaceSymbols => {
    let namespace = namespaces.get(name);
    if (namespace === undefined) {
      namespace = { name, types: new Map(), actions: new Map(), constants: new Map() };
      namespaces.set(name, namespace);
    }
    return namespace;
  };

  const addExport = (name: Identifier, declaration: ExportedDeclaration): void => {
    const earlier = exports.get(name.value);
    if (earlier === undefined) {
      exports.set(name.value, declaration);
      return;
    }
    diagnostics.push(
      error(
        'duplicate-export',
        `The module already exports a symbol called ${name.value}, on ${line(earlier.position)}. A module can't export two symbols with the same name; rename one with \`as\` if it is re-exported.`,
        name.position,
      ),
    );
  };

  let current = namespaceNamed(MAIN_NAMESPACE);

  for (const declaration of program.children) {
    switch (declaration.type) {
      case 'namespace':
        current = namespaceNamed(declaration.name.value);
        break;
      case 'import':
        symbols.imports.push({ namespace: current.name, declaration });
        break;
      case 'reExport':
        symbols.reExports.push({ namespace: current.name, declaration });
        addExport(
          declaration.alias ?? (declaration.name.type === 'qualifiedIdentifier' ? declaration.name.name : declaration.name),
          declaration,
        );
        break;
      case 'trigger':
        symbols.triggers.push({ namespace: current.name, declaration });
        break;
      case 'permissions':
        symbols.permissions.push({ namespace: current.name, declaration });
        break;
      case 'relation':
        symbols.relations.push({ namespace: current.name, declaration });
        break;
      case 'action':
        addAction(current, declaration, diagnostics);
        checkUnique(declaration.parameters.map((parameter) => parameter.name), 'duplicate-parameter', 'a parameter', diagnostics);
        if (declaration.exported === true) addExport(declaration.name, declaration);
        break;
      case 'const':
        addConstant(current, declaration, diagnostics);
        if (declaration.exported === true) addExport(declaration.name, declaration);
        break;
      case 'enumDeclaration':
      case 'model':
      case 'entity':
      case 'errorDeclaration':
        addType(current, declaration, diagnostics);
        checkInsideType(declaration, diagnostics);
        if (declaration.exported === true) addExport(declaration.name, declaration);
        break;
    }
  }

  checkTestCaseNames(symbols.triggers, diagnostics);

  return { symbols, diagnostics };
}

const clash = (
  name: Identifier,
  declaration: TypeDeclaration | ActionDeclaration | ConstDeclaration,
  earlier: TypeDeclaration | ActionDeclaration | ConstDeclaration,
  namespace: NamespaceSymbols,
  rule: string,
): Diagnostic =>
  error(
    'duplicate-declaration',
    `${capitalise(describe(declaration))} called ${name.value} clashes with ${describe(earlier)} with the same name in namespace ${namespace.name}, on ${line(earlier.position)}. ${rule}`,
    name.position,
  );

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

function addType(namespace: NamespaceSymbols, declaration: TypeDeclaration, diagnostics: Diagnostic[]): void {
  const name = declaration.name.value;
  const earlier = namespace.types.get(name) ?? namespace.constants.get(name);
  if (earlier !== undefined) {
    diagnostics.push(
      clash(declaration.name, declaration, earlier, namespace, 'Enums, models, entities, errors and constants share one set of names in a namespace.'),
    );
    return;
  }
  namespace.types.set(name, declaration);
}

function addAction(namespace: NamespaceSymbols, declaration: ActionDeclaration, diagnostics: Diagnostic[]): void {
  const name = declaration.name.value;
  const earlier = namespace.actions.get(name) ?? namespace.constants.get(name);
  if (earlier !== undefined) {
    diagnostics.push(clash(declaration.name, declaration, earlier, namespace, 'Each action in a namespace needs its own name.'));
    return;
  }
  namespace.actions.set(name, declaration);
}

function addConstant(namespace: NamespaceSymbols, declaration: ConstDeclaration, diagnostics: Diagnostic[]): void {
  const name = declaration.name.value;
  const earlier = namespace.constants.get(name) ?? namespace.actions.get(name) ?? namespace.types.get(name);
  if (earlier !== undefined) {
    diagnostics.push(
      clash(declaration.name, declaration, earlier, namespace, "A constant's name must be unique among the names in its namespace."),
    );
    return;
  }
  namespace.constants.set(name, declaration);
}

/** Report every name after the first that repeats an earlier one. */
function checkUnique(names: Identifier[], code: string, what: string, diagnostics: Diagnostic[]): void {
  const seen = new Map<string, Identifier>();
  for (const name of names) {
    const earlier = seen.get(name.value);
    if (earlier === undefined) {
      seen.set(name.value, name);
      continue;
    }
    diagnostics.push(
      error(code, `There is already ${what} called ${name.value}, on ${line(earlier.position)}.`, name.position),
    );
  }
}

function checkInsideType(declaration: TypeDeclaration, diagnostics: Diagnostic[]): void {
  switch (declaration.type) {
    case 'model':
      checkUnique(fieldNames(declaration.fields), 'duplicate-field', 'a field', diagnostics);
      break;
    case 'errorDeclaration':
      if (Array.isArray(declaration.data)) {
        checkUnique(fieldNames(declaration.data), 'duplicate-field', 'a data field', diagnostics);
      }
      break;
    case 'enumDeclaration':
      checkEnum(declaration, diagnostics);
      break;
    case 'entity':
      checkEntity(declaration, diagnostics);
      break;
  }
}

const fieldNames = (fields: Field[]): Identifier[] => fields.map((field) => field.name);

/** An enum's members need distinct names and distinct values (docs/adr/0013-enums.md). */
function checkEnum(declaration: EnumDeclaration, diagnostics: Diagnostic[]): void {
  checkUnique(declaration.members.map((member) => member.name), 'duplicate-enum-member', 'a member', diagnostics);

  const values = new Map<string, Identifier>();
  const names = new Set<string>();
  for (const member of declaration.members) {
    // A member whose name repeats an earlier one has already been reported.
    if (names.has(member.name.value)) continue;
    names.add(member.name.value);
    // A member with no `:=` has its name as its `TEXT` value.
    const key = member.value === undefined ? `string:${member.name.value}` : valueKey(member.value);
    if (key === undefined) continue;
    const earlier = values.get(key);
    if (earlier === undefined) {
      values.set(key, member.name);
      continue;
    }
    diagnostics.push(
      error(
        'duplicate-enum-value',
        `${member.name.value} has the same value as ${earlier.value}, on ${line(earlier.position)}. An enum's members need distinct values.`,
        member.value?.position ?? member.name.position,
      ),
    );
  }
}

/** A key that is equal for two enum values exactly when the values are, or `undefined` if unknown. */
function valueKey(value: NonNullable<EnumDeclaration['members'][number]['value']>): string | undefined {
  switch (value.type) {
    case 'string':
      return `string:${value.parts.map((part) => (part.type === 'text' ? part.value : '')).join('')}`;
    case 'number':
      return `number:${String(value.value)}`;
    case 'boolean':
      return `boolean:${String(value.value)}`;
    // Equal instants and durations can be written in different ways, so these are left to the
    // type checker, which works out their values.
    case 'dateTime':
    case 'duration':
      return undefined;
  }
}

/** Lines an entity can have at most one of (docs/adr/0010-security.md, 0022, 0032). */
const AT_MOST_ONE = {
  identityLine: 'an `identity` line',
  membershipLine: 'a `membership` line',
  exposeBlock: 'an `expose` block',
  hideBlock: 'a `hide` block',
} as const;

function checkEntity(declaration: EntityDeclaration, diagnostics: Diagnostic[]): void {
  const seen = new Map<string, Position>();
  for (const entityLine of declaration.lines) {
    if (!(entityLine.type in AT_MOST_ONE)) continue;
    const what = AT_MOST_ONE[entityLine.type as keyof typeof AT_MOST_ONE];
    const earlier = seen.get(entityLine.type);
    if (earlier === undefined) {
      seen.set(entityLine.type, entityLine.position);
      continue;
    }
    diagnostics.push(
      error(
        'duplicate-entity-line',
        `${declaration.name.value} already has ${what}, on ${line(earlier)}. An entity can have at most one.`,
        entityLine.position,
      ),
    );
  }

  checkUnique(
    declaration.lines.flatMap((entityLine) => (entityLine.type === 'roleLine' ? [entityLine.name] : [])),
    'duplicate-role',
    'a role',
    diagnostics,
  );
}

/**
 * Two test cases with the same name are a compile-time error (docs/adr/0037-test-case-trigger-source.md).
 * For now, only names written as a plain string are compared: a name built from constants needs
 * the constants' values, which a later pass works out.
 */
function checkTestCaseNames(triggers: InNamespace<TriggerDeclaration>[], diagnostics: Diagnostic[]): void {
  const seen = new Map<string, Position>();
  for (const { declaration } of triggers) {
    if (declaration.source.value !== 'TestCase') continue;
    const name = declaration.parameters?.find((parameter) => parameter.name.value === 'name')?.value;
    if (name?.type !== 'string' || !name.parts.every((part) => part.type === 'text')) continue;
    const text = name.parts.map((part) => part.value).join('');
    const earlier = seen.get(text);
    if (earlier === undefined) {
      seen.set(text, name.position);
      continue;
    }
    diagnostics.push(
      error(
        'duplicate-test-case',
        `There is already a test case called "${text}", on ${line(earlier)}. Each test case needs its own name.`,
        name.position,
      ),
    );
  }
}
