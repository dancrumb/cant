import type { Name, StringLiteral, TypeRef } from '@dancrumb/cant-shared';
import type { Node } from 'unist';
import { MAIN_NAMESPACE } from './declarations.ts';
import { error, type Diagnostic } from './diagnostic.ts';
import { GENERIC_TYPES, INTERNAL_TYPES } from './stdlib.ts';
import { typeOf, type Type } from './types.ts';
import {
  ambiguous,
  describeName,
  fileFromUrl,
  hasNamespace,
  symbolsNamed,
  type LoadedProgram,
  type Module,
  type ModuleSymbol,
  type TypeKind,
} from './modules.ts';

/** What a name has to be where it appears. */
type Expected =
  /** A type a value can have: an enum, a model or an entity, not an error (docs/adr/0023-error-handling.md). */
  | 'value type'
  /** Any type, as on the right of `instanceOf`, where an error can be named (docs/adr/0033-unknown-type.md). */
  | 'type'
  | 'error'
  | 'model'
  | 'entity'
  | 'action';

const ALLOWED: Record<Exclude<Expected, 'action'>, readonly TypeKind[]> = {
  'value type': ['enum', 'model', 'entity'],
  type: ['enum', 'model', 'entity', 'error'],
  error: ['error'],
  model: ['model'],
  entity: ['entity'],
};

const ARTICLE: Record<Expected, string> = {
  'value type': 'a type',
  type: 'a type',
  error: 'an error',
  model: 'a model',
  entity: 'an entity',
  action: 'an action',
};

const describeSymbol = (symbol: ModuleSymbol): string =>
  symbol.kind === 'action'
    ? 'an action'
    : symbol.kind === 'const'
      ? 'a constant'
      : symbol.typeKind === 'enum' || symbol.typeKind === 'error' || symbol.typeKind === 'entity'
        ? `an ${symbol.typeKind}`
        : 'a model';

const fits = (symbol: ModuleSymbol, expected: Expected): boolean =>
  expected === 'action'
    ? symbol.kind === 'action'
    : symbol.kind === 'type' && symbol.typeKind !== undefined && ALLOWED[expected].includes(symbol.typeKind);

/** The names that declarations refer to, resolved to the symbols they mean. */
export type References = Map<Name, ModuleSymbol>;

/**
 * Resolve the top-level names that a program's declarations refer to, in every module, and
 * report any that can't be found, or that name the wrong kind of thing:
 *
 * - the types of parameters, return values, fields and constants, and the types in `instanceOf`;
 * - the errors in `raises` and `passes` clauses, and in `raise` statements;
 * - the named `data` model of an error, and the models in an entity's `models` block;
 * - the entities at each end of a relation, and in `@subject is <type>`;
 * - the action each trigger runs.
 *
 * Names in expressions that may be local, such as identifiers and calls in an action's body,
 * are resolved by `resolveBodies`, which knows the local scopes. Permissions' group kinds and
 * roles, and the fields entities name, are checked by `checkEntities`.
 */
export function resolveNames(program: LoadedProgram): { references: References; diagnostics: Diagnostic[] } {
  const references: References = new Map();
  const diagnostics: Diagnostic[] = [];
  for (const module of program.modules.values()) {
    resolveModule(module, references, (diagnostic) => {
      diagnostics.push({ ...diagnostic, file: module.path });
    });
  }
  return { references, diagnostics };
}

function resolveModule(module: Module, references: References, report: (diagnostic: Diagnostic) => void): void {
  if (module.program === undefined) {
return;
}
  const { standard } = module;

  const resolve = (name: Name, namespace: string, expected: Expected): void => {
    const where = name.type === 'qualifiedIdentifier' ? name.namespace.value : namespace;
    if (name.type === 'qualifiedIdentifier' && !hasNamespace(module, where)) {
      report(
        error(
          'unknown-namespace',
          `There is no namespace called ${where} in this module, so ${describeName(name)} can't be found.`,
          name.namespace.position,
        ),
      );
      return;
    }
    const candidates = symbolsNamed(module, where, name.type === 'qualifiedIdentifier' ? name.name.value : name.value);
    const symbol = candidates.find((candidate) => fits(candidate, expected));
    if (symbol !== undefined) {
      references.set(name, symbol);
      return;
    }
    const other = candidates[0];
    const ambiguity = other === undefined ? ambiguous(module, namespace, name) : undefined;
    if (ambiguity !== undefined) {
      report(ambiguity);
    } else if (other === undefined) {
      report(
        error(
          'unknown-name',
          `There is no ${ARTICLE[expected].replace(/^an? /, '')} called ${describeName(name)} in namespace ${where}.`,
          name.position,
        ),
      );
    } else if (expected === 'value type' && other.typeKind === 'error') {
      report(
        error(
          'error-as-type',
          `${describeName(name)} is an error, so it can't be the type of a value. An error only reaches a caller through an action's \`raises\` or \`passes\` clause.`,
          name.position,
        ),
      );
    } else {
      report(
        error(
          'wrong-kind',
          `${describeName(name)} is ${describeSymbol(other)}, but ${ARTICLE[expected]} is needed here.`,
          name.position,
        ),
      );
    }
  };

  // The type parameters of the action whose signature is being resolved, by name.
  let typeParameters = new Map<string, ModuleSymbol>();
  const internal = (name: string, type: Type): ModuleSymbol => ({ kind: 'type', typeKind: 'internal', name, module: module.path, internal: type });

  const resolveType = (type: TypeRef, namespace: string, expected: 'value type' | 'type' = 'value type'): void => {
    switch (type.type) {
      case 'identifier': {
        // Only the standard library can write type parameters and internal types
        // (docs/adr/0036-native-modules.md, docs/adr/0043-standard-library-generics.md).
        const parameter = typeParameters.get(type.value);
        const builtIn = standard ? INTERNAL_TYPES.get(type.value) : undefined;
        if (parameter !== undefined) {
references.set(type, parameter);
} else if (builtIn !== undefined) {
references.set(type, internal(type.value, builtIn));
} else {
resolve(type, namespace, expected);
}
        break;
      }
      case 'genericType': {
        const name = type.name.type === 'identifier' ? type.name.value : undefined;
        const arity = name === undefined ? undefined : GENERIC_TYPES.get(name);
        if (!standard) {
          report(error('generic-type', "A program can't write a generic type, such as Collection<T>. Only the standard library can (docs/adr/0021-collections.md).", type.position));
        } else if (arity === undefined) {
          report(error('unknown-name', `There is no generic type called ${describeName(type.name)}.`, type.name.position));
        } else if (type.arguments.length !== arity) {
          report(error('type-arguments', `${describeName(type.name)} takes ${String(arity)} type ${arity === 1 ? 'argument' : 'arguments'}, but this gives ${String(type.arguments.length)}.`, type.position));
        }
        for (const argument of type.arguments) {
resolveType(argument, namespace);
}
        break;
      }
      case 'qualifiedIdentifier':
        resolve(type, namespace, expected);
        break;
      case 'arrayType':
      case 'setType':
        resolveType(type.elementType, namespace);
        break;
      case 'mapType':
        resolveType(type.valueType, namespace);
        break;
      default:
        break;
    }
  };

  // Find the names inside expressions and statements that aren't local: the types after
  // `instanceOf`, the errors in `raise` statements and the entities in `@subject is <type>`.
  const walk = (node: unknown, namespace: string): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
walk(child, namespace);
}
      return;
    }
    if (typeof node !== 'object' || node === null) {
return;
}
    const typed = node as Node & Record<string, unknown>;
    switch (typed.type) {
      case 'instanceOf': {
        const target = typed.target as TypeRef | { type: 'errorType' };
        if (target.type !== 'errorType') {
resolveType(target, namespace, 'type');
}
        break;
      }
      case 'raise':
        resolve(typed.error as Name, namespace, 'error');
        break;
      case 'isPredicate': {
        const subjectType = typed.subjectType as Name | { type: 'builtIn' };
        if (subjectType.type === 'identifier') {
resolve(subjectType, namespace, 'entity');
}
        break;
      }
      default:
        break;
    }
    for (const [key, value] of Object.entries(typed)) {
      if (key !== 'position' && typeof value === 'object') {
walk(value, namespace);
}
    }
  };

  let namespace = MAIN_NAMESPACE;
  for (const declaration of module.program.children) {
    switch (declaration.type) {
      case 'namespace':
        namespace = declaration.name.value;
        break;
      case 'action': {
        typeParameters = new Map();
        if (declaration.typeParameters !== undefined && !standard) {
          report(
            error('generic-action', "A program can't declare type parameters, so its actions can't be generic. Only the standard library's can (docs/adr/0021-collections.md).", declaration.typeParameters[0]?.position ?? declaration.name.position),
          );
        }
        for (const parameter of declaration.typeParameters ?? []) {
          if (parameter.bound !== undefined) {
resolveType(parameter.bound, namespace);
}
          const bound = parameter.bound === undefined ? undefined : typeOf(parameter.bound, references);
          if (typeParameters.has(parameter.name.value)) {
            report(error('duplicate-type-parameter', `${parameter.name.value} is already a type parameter of ${declaration.name.value}.`, parameter.name.position));
          }
          typeParameters.set(
            parameter.name.value,
            internal(parameter.name.value, { kind: 'variable', name: parameter.name.value, ...(bound !== undefined && { bound }) }),
          );
        }
        for (const parameter of declaration.parameters) {
          resolveType(parameter.valueType, namespace);
          walk(parameter.defaultValue, namespace);
        }
        if (declaration.returnType.type !== 'voidType') {
resolveType(declaration.returnType, namespace);
}
        for (const name of declaration.raises) {
resolve(name, namespace, 'error');
}
        for (const name of declaration.passes) {
if (name.type !== 'builtIn') {
resolve(name, namespace, 'error');
}
}
        // The interpreter provides the standard library's implementations itself.
        if (declaration.native !== undefined && !standard) {
checkNative(module, declaration.native, report);
}
        // A type parameter only means something in its action's signature.
        typeParameters = new Map();
        walk(declaration.children, namespace);
        break;
      }
      case 'const':
        if (declaration.valueType !== undefined) {
resolveType(declaration.valueType, namespace);
}
        walk(declaration.value, namespace);
        break;
      case 'model':
        for (const field of declaration.fields) {
          resolveType(field.valueType, namespace);
          walk(field.defaultValue, namespace);
        }
        break;
      case 'errorDeclaration':
        if (Array.isArray(declaration.data)) {
          for (const field of declaration.data) {
            resolveType(field.valueType, namespace);
            walk(field.defaultValue, namespace);
          }
        } else if (declaration.data !== undefined) {
          resolve(declaration.data, namespace, 'model');
        }
        break;
      case 'entity':
        for (const line of declaration.lines) {
          if (line.type === 'modelsBlock') {
for (const model of line.models) {
resolve(model, namespace, 'model');
}
}
        }
        break;
      case 'relation':
        resolve(declaration.left.entity, namespace, 'entity');
        resolve(declaration.right.entity, namespace, 'entity');
        break;
      case 'trigger':
        resolve(declaration.action, namespace, 'action');
        walk([declaration.auth, declaration.arguments, declaration.parameters, declaration.assertions], namespace);
        break;
      default:
        break;
    }
  }
}

/** A native action's module must be a local file (docs/adr/0031-module-resolution.md). */
function checkNative(
  module: Module,
  native: StringLiteral,
  report: (diagnostic: Diagnostic) => void,
): void {
  const url = native.parts.map((part) => (part.type === 'text' ? part.value : '')).join('');
  if (fileFromUrl(module.path, url) === undefined) {
    report(
      error(
        'remote-module',
        `"${url}" isn't a local file. A native action's module must be read from a file, not a remote URL.`,
        native.position,
      ),
    );
  }
}
