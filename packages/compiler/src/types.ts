import type {
  BaseType,
  ConstantValue,
  EntityDeclaration,
  ErrorDeclaration,
  Field,
  ModelDeclaration,
  TypeRef,
} from '@dancrumb/cant-shared';
import { dateTimeMilliseconds, durationMilliseconds } from '@dancrumb/cant-shared';
import type { ModuleSymbol } from './modules.ts';
import type { References } from './resolve.ts';

export type BaseName = BaseType['name'];

/** One value of an enum, as a key that is equal exactly when the values are, such as `TEXT:paid`. */
export type EnumValue = string;

/** The types the type checker works with (docs/adr/0012-base-types.md and the ADRs after it). */
export type Type =
  | { kind: 'base'; name: BaseName }
  | { kind: 'void' }
  /** The element type of an empty collection, `[NOTHING]` (docs/adr/0021-collections.md). */
  | { kind: 'nothing' }
  /** A value of any type, whose type isn't known here (docs/adr/0033-unknown-type.md). */
  | { kind: 'unknown' }
  /**
   * A value this pass doesn't check yet, such as the result of a standard library action, whose
   * signatures aren't written down yet. It is compatible with every type, both ways.
   */
  | { kind: 'unchecked' }
  | { kind: 'enum'; name?: string; symbol?: ModuleSymbol; values: ReadonlySet<EnumValue>; valueType: BaseName | undefined }
  | { kind: 'array'; element: Type }
  | { kind: 'map'; value: Type }
  | { kind: 'set'; element: Type }
  | { kind: 'model'; symbol: ModuleSymbol; declaration: ModelDeclaration }
  /** An object value, matched by structure (docs/adr/0027-object-shapes.md). */
  | { kind: 'anonymous'; fields: ReadonlyMap<string, Type> }
  | { kind: 'entity'; symbol: ModuleSymbol; declaration: EntityDeclaration }
  /**
   * An error (docs/adr/0023-error-handling.md): a specific one, given by `symbol`, or, without
   * one, any of `among`, or any `ERROR` at all when `among` is missing too.
   */
  | { kind: 'error'; symbol?: ModuleSymbol; declaration?: ErrorDeclaration; among?: readonly ModuleSymbol[] }
  /**
   * An error return type: a value of `value`, or one of the errors in `errors`, or any error at
   * all when `anyError` is set (docs/adr/0023-error-handling.md).
   */
  | { kind: 'result'; value: Type; errors: readonly ModuleSymbol[]; anyError: boolean }
  | { kind: 'optional'; inner: Type }
  /** The unnamed type of `@subject` (docs/adr/0010-security.md). */
  | { kind: 'subject' }
  /**
   * The unnamed types of `@stdin`, and of `@stdout` and `@stderr` (docs/adr/0040-standard-streams.md).
   * With `file`, a `FILE` can be given too, as `cant::IO`'s `ReadStream` can (docs/adr/0042-io.md).
   */
  | { kind: 'stream'; direction: 'input' | 'output'; file?: true }
  /**
   * `Collection<T>`: an array, map or set of `element` (docs/adr/0021-collections.md). Internal,
   * so only standard library modules can write it (docs/adr/0043-standard-library-generics.md).
   */
  | { kind: 'collection'; element: Type }
  /**
   * A type parameter of a standard library action, such as `T` in `values<T>(map: {T}): [T]`. Each
   * call works out the type it stands for from its arguments (docs/adr/0043-standard-library-generics.md).
   */
  | { kind: 'variable'; name: string; bound?: Type };

export const BASE = (name: BaseName): Type => ({ kind: 'base', name });
export const TEXT = BASE('TEXT');
export const NUMBER = BASE('NUMBER');
export const BOOLEAN = BASE('BOOLEAN');
export const DATE_TIME = BASE('DATE_TIME');
export const DURATION = BASE('DURATION');
export const VOID: Type = { kind: 'void' };
export const NOTHING: Type = { kind: 'nothing' };
export const UNKNOWN: Type = { kind: 'unknown' };
export const UNCHECKED: Type = { kind: 'unchecked' };

export const optional = (inner: Type): Type =>
  inner.kind === 'optional' || inner.kind === 'unchecked' ? inner : { kind: 'optional', inner };

export const isBase = (type: Type, name: BaseName): boolean => type.kind === 'base' && type.name === name;

/** The key of an enum value written as a constant (docs/adr/0013-enums.md). */
export function constantKey(value: ConstantValue): { key: EnumValue; type: BaseName } {
  switch (value.type) {
    case 'string':
      return { key: `TEXT:${value.parts.map((part) => (part.type === 'text' ? part.value : '')).join('')}`, type: 'TEXT' };
    case 'number':
      return { key: `NUMBER:${String(value.value)}`, type: 'NUMBER' };
    case 'boolean':
      return { key: `BOOLEAN:${String(value.value)}`, type: 'BOOLEAN' };
    case 'dateTime':
      return { key: `DATE_TIME:${String(dateTimeMilliseconds(value.value))}`, type: 'DATE_TIME' };
    case 'duration':
      return { key: `DURATION:${String(durationMilliseconds(value.value))}`, type: 'DURATION' };
  }
}

/** Write a type as a program would. */
export function describe(type: Type): string {
  switch (type.kind) {
    case 'base':
      return type.name;
    case 'void':
      return 'VOID';
    case 'nothing':
      return 'NOTHING';
    case 'unknown':
      return 'UNKNOWN';
    case 'unchecked':
      return 'a value';
    case 'enum':
      return type.name ?? `enum(${[...type.values].map((value) => value.slice(value.indexOf(':') + 1)).join(', ')})`;
    // With an element type that isn't known, such as a type parameter's, only the kind is said.
    case 'array':
      return type.element.kind === 'unchecked' ? 'an array' : `[${describe(type.element)}]`;
    case 'map':
      return type.value.kind === 'unchecked' ? 'a map' : `{${describe(type.value)}}`;
    case 'set':
      return type.element.kind === 'unchecked' ? 'a set' : `SET(${describe(type.element)})`;
    case 'model':
    case 'entity':
      return type.symbol.name;
    case 'anonymous':
      return `{ ${[...type.fields].map(([name, field]) => `${name}: ${describe(field)}`).join(', ')} }`;
    case 'error':
      return type.symbol?.name ?? (type.among === undefined ? 'ERROR' : type.among.map((symbol) => symbol.name).join(' or '));
    case 'result':
      return `${describe(type.value)}, or ${type.anyError ? 'any error' : type.errors.map((symbol) => symbol.name).join(' or ')}`;
    case 'optional':
      return `${describe(type.inner)}?`;
    case 'subject':
      return 'the type of @subject';
    case 'stream':
      return type.direction === 'input' ? (type.file === true ? 'an input stream or a FILE' : 'an input stream') : 'an output stream';
    case 'collection':
      return type.element.kind === 'unchecked' ? 'a collection' : `a collection of ${describe(type.element)}`;
    case 'variable':
      return type.name;
  }
}

/**
 * The type a `TypeRef` names, given the references the resolver found. Names it couldn't
 * resolve have already been reported, so they are unchecked here.
 */
export function typeOf(ref: TypeRef, references: References): Type {
  switch (ref.type) {
    case 'baseType':
      return BASE(ref.name);
    case 'unknownType':
      return UNKNOWN;
    case 'enum': {
      const keys = ref.values.map(constantKey);
      return { kind: 'enum', values: new Set(keys.map(({ key }) => key)), valueType: keys[0]?.type };
    }
    case 'arrayType':
      return { kind: 'array', element: typeOf(ref.elementType, references) };
    case 'mapType':
      return { kind: 'map', value: typeOf(ref.valueType, references) };
    case 'setType':
      return { kind: 'set', element: typeOf(ref.elementType, references) };
    case 'identifier':
    case 'qualifiedIdentifier':
      return typeOfSymbol(references.get(ref));
    case 'genericType': {
      // The only generic type is `Collection<T>`; others have been reported already.
      const [element] = ref.arguments;
      const name = ref.name.type === 'identifier' ? ref.name.value : undefined;
      return name === 'Collection' && element !== undefined && ref.arguments.length === 1
        ? { kind: 'collection', element: typeOf(element, references) }
        : UNCHECKED;
    }
  }
}

export function typeOfSymbol(symbol: ModuleSymbol | undefined): Type {
  const declaration = symbol?.declaration;
  if (symbol === undefined) {
return UNCHECKED;
}
  if (symbol.typeKind === 'internal') {
return symbol.internal ?? UNCHECKED;
}
  if (symbol.typeKind === 'error') {
    return declaration?.type === 'errorDeclaration' ? { kind: 'error', symbol, declaration } : { kind: 'error', symbol };
  }
  switch (declaration?.type) {
    case 'model':
      return { kind: 'model', symbol, declaration };
    case 'entity':
      return { kind: 'entity', symbol, declaration };
    case 'enumDeclaration': {
      const keys = declaration.members.map((member) =>
        member.value === undefined ? { key: `TEXT:${member.name.value}`, type: 'TEXT' as const } : constantKey(member.value),
      );
      return { kind: 'enum', name: symbol.name, symbol, values: new Set(keys.map(({ key }) => key)), valueType: keys[0]?.type };
    }
    default:
      return UNCHECKED;
  }
}

/** A field's type as it is read: optional when it is marked `?` and has no default (docs/adr/0027-object-shapes.md). */
export function fieldType(field: Field, references: References): Type {
  const type = typeOf(field.valueType, references);
  return field.optional && field.defaultValue === undefined ? optional(type) : type;
}

export const sameSymbol = (a: ModuleSymbol, b: ModuleSymbol): boolean => a.module === b.module && a.name === b.name;

export interface AssignOptions {
  /**
   * Whether a value of an enum's value type can be given where the enum is expected, as for
   * parameters and return values (docs/adr/0013-enums.md), with `literal` the value if the
   * compiler knows it.
   */
  enumConversion?: boolean;
  literal?: EnumValue;
}

/** A named model's fields, by name, with their types as read and whether a value must give them. */
export type ModelFields = (model: ModelDeclaration) => ReadonlyMap<string, { type: Type; required: boolean }>;

/** Whether a value of type `from` can be used where `to` is expected. */
export type Assignable = (from: Type, to: Type, options?: AssignOptions) => boolean;

/**
 * Whether a type is a stream, or a collection or object that can hold one. A stream isn't a value
 * of UNKNOWN, even inside a collection or an object (docs/adr/0040-standard-streams.md).
 */
export function holdsStream(type: Type): boolean {
  switch (type.kind) {
    case 'stream':
      return true;
    case 'array':
    case 'set':
      return holdsStream(type.element);
    case 'map':
      return holdsStream(type.value);
    case 'optional':
      return holdsStream(type.inner);
    case 'anonymous':
      return [...type.fields.values()].some(holdsStream);
    case 'result':
      return holdsStream(type.value);
    case 'collection':
      return holdsStream(type.element);
    default:
      return false;
  }
}

/** Make the assignability rules, given how to find a named model's fields. */
export function createAssignable(modelFields: ModelFields): Assignable {
  const assignable: Assignable = (from, to, options = {}) => {
    if (from.kind === 'unchecked' || to.kind === 'unchecked') {
return true;
}
    // A call works out what each type parameter stands for before checking (see bindTypes).
    if (from.kind === 'variable' || to.kind === 'variable') {
return true;
}
    // A result's value is what fits; whether it may hold an error is checked separately.
    if (from.kind === 'result') {
return assignable(from.value, to, options);
}
    if (to.kind === 'unknown') {
return from.kind !== 'void' && from.kind !== 'error' && !holdsStream(from);
}
    if (to.kind === 'optional') {
      return from.kind === 'optional' ? assignable(from.inner, to.inner, options) : assignable(from, to.inner, options);
    }
    // An unchecked optional can't be used where a plain value is needed (docs/adr/0014-optionals.md).
    if (from.kind === 'optional') {
return false;
}

    switch (to.kind) {
      case 'base':
        return (
          (from.kind === 'base' && from.name === to.name) ||
          // An enum value can be used where its value type is expected (docs/adr/0013-enums.md).
          (from.kind === 'enum' && from.valueType === to.name)
        );
      case 'enum':
        if (from.kind === 'enum') {
return [...from.values].every((value) => to.values.has(value));
}
        if (from.kind === 'base' && options.enumConversion === true && from.name === to.valueType) {
          // A literal is checked now; any other value is checked when the program runs.
          return options.literal === undefined || to.values.has(options.literal);
        }
        return false;
      case 'array':
      case 'set':
        return from.kind === to.kind && (from.element.kind === 'nothing' || assignable(from.element, to.element));
      case 'map':
        if (from.kind === 'map') {
return from.value.kind === 'nothing' || assignable(from.value, to.value);
}
        // An object value can be a map when every member is of the map's type (docs/adr/0021-collections.md).
        return from.kind === 'anonymous' && [...from.fields.values()].every((field) => assignable(field, to.value));
      case 'model':
        if (from.kind === 'model') {
return sameSymbol(from.symbol, to.symbol);
}
        return from.kind === 'anonymous' && anonymousFits(from, to);
      case 'anonymous':
        return (
          from.kind === 'anonymous' &&
          from.fields.size === to.fields.size &&
          [...to.fields].every(([name, field]) => {
            const given = from.fields.get(name);
            return given !== undefined && assignable(given, field);
          })
        );
      case 'entity':
        return from.kind === 'entity' && sameSymbol(from.symbol, to.symbol);
      case 'error':
        return from.kind === 'error' && (to.symbol === undefined || (from.symbol !== undefined && sameSymbol(from.symbol, to.symbol)));
      case 'result':
        return false;
      case 'subject':
        return from.kind === 'subject';
      case 'stream':
        return (from.kind === 'stream' && from.direction === to.direction) || (to.file === true && isBase(from, 'FILE'));
      case 'collection': {
        // An array, a map or a set is a Collection<T> of its elements (docs/adr/0021-collections.md).
        const element = from.kind === 'array' || from.kind === 'set' ? from.element : from.kind === 'map' ? from.value : undefined;
        return element !== undefined && (element.kind === 'nothing' || assignable(element, to.element));
      }
      case 'void':
      case 'nothing':
        return false;
    }
  };

  /**
   * Whether an object value fits a named model: it gives every required field, each with a value
   * of the field's type, and nothing the model doesn't have (docs/adr/0027-object-shapes.md).
   */
  const anonymousFits = (from: Extract<Type, { kind: 'anonymous' }>, to: Extract<Type, { kind: 'model' }>): boolean => {
    const fields = modelFields(to.declaration);
    for (const [name, field] of fields) {
      const given = from.fields.get(name);
      if (given === undefined) {
        if (field.required) {
return false;
}
        continue;
      }
      // A member can't be an unchecked optional, even for an optional field.
      const target = field.type.kind === 'optional' ? field.type.inner : field.type;
      if (!assignable(given, target)) {
return false;
}
    }
    return [...from.fields.keys()].every((name) => fields.has(name));
  };

  return assignable;
}

/** What each type parameter of a call stands for, by name (docs/adr/0043-standard-library-generics.md). */
export type TypeBindings = Map<string, Type>;

/**
 * A type with each type parameter replaced by what it stands for. One a call gave no type for,
 * such as `T` in `values` of an empty map, stands for NOTHING, so `[T]` becomes `[NOTHING]`, an
 * empty collection's type (docs/adr/0021-collections.md).
 */
export function substitute(type: Type, bindings: TypeBindings, unbound: 'nothing' | 'bound' = 'nothing'): Type {
  const again = (inner: Type): Type => substitute(inner, bindings, unbound);
  switch (type.kind) {
    case 'variable':
      // To check an argument, a type parameter with no type stands for anything its bound allows.
      return bindings.get(type.name) ?? (unbound === 'bound' ? (type.bound ?? UNCHECKED) : NOTHING);
    case 'array':
    case 'set':
      return { kind: type.kind, element: again(type.element) };
    case 'map':
      return { kind: 'map', value: again(type.value) };
    case 'collection':
      return { kind: 'collection', element: again(type.element) };
    case 'optional':
      return optional(again(type.inner));
    case 'result':
      return { ...type, value: again(type.value) };
    default:
      return type;
  }
}

/** Whether a type mentions a type parameter. */
export function isGeneric(type: Type): boolean {
  switch (type.kind) {
    case 'variable':
      return true;
    case 'array':
    case 'set':
    case 'collection':
      return isGeneric(type.element);
    case 'map':
      return isGeneric(type.value);
    case 'optional':
      return isGeneric(type.inner);
    default:
      return false;
  }
}
