import type {
  BaseType,
  ConstantValue,
  EntityDeclaration,
  ErrorDeclaration,
  Field,
  ModelDeclaration,
  TypeRef,
} from '@dancrumb/cant-shared';
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
  | { kind: 'enum'; name?: string; values: ReadonlySet<EnumValue>; valueType: BaseName | undefined }
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
  | { kind: 'subject' };

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
      return { key: `DATE_TIME:${String(Date.parse(value.value))}`, type: 'DATE_TIME' };
    case 'duration':
      return { key: `DURATION:${String(durationMilliseconds(value.value))}`, type: 'DURATION' };
  }
}

/**
 * A `DURATION` literal's length in milliseconds, so that equal durations written differently,
 * such as `PT60M` and `PT1H`, have the same key (docs/adr/0026-dates-and-times.md).
 */
export function durationMilliseconds(text: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(text);
  if (match === null) return Number.NaN;
  const [days = '0', hours = '0', minutes = '0', seconds = '0'] = match.slice(1);
  return Math.round(((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60_000 + Number(seconds) * 1000);
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
    case 'array':
      return `[${describe(type.element)}]`;
    case 'map':
      return `{${describe(type.value)}}`;
    case 'set':
      return `SET(${describe(type.element)})`;
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
  }
}

export function typeOfSymbol(symbol: ModuleSymbol | undefined): Type {
  const declaration = symbol?.declaration;
  if (symbol === undefined) return UNCHECKED;
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
      return { kind: 'enum', name: symbol.name, values: new Set(keys.map(({ key }) => key)), valueType: keys[0]?.type };
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

/** Make the assignability rules, given how to find a named model's fields. */
export function createAssignable(modelFields: ModelFields): Assignable {
  const assignable: Assignable = (from, to, options = {}) => {
    if (from.kind === 'unchecked' || to.kind === 'unchecked') return true;
    // A result's value is what fits; whether it may hold an error is checked separately.
    if (from.kind === 'result') return assignable(from.value, to, options);
    if (to.kind === 'unknown') return from.kind !== 'void' && from.kind !== 'error';
    if (to.kind === 'optional') {
      return from.kind === 'optional' ? assignable(from.inner, to.inner, options) : assignable(from, to.inner, options);
    }
    // An unchecked optional can't be used where a plain value is needed (docs/adr/0014-optionals.md).
    if (from.kind === 'optional') return false;

    switch (to.kind) {
      case 'base':
        return (
          (from.kind === 'base' && from.name === to.name) ||
          // An enum value can be used where its value type is expected (docs/adr/0013-enums.md).
          (from.kind === 'enum' && from.valueType === to.name)
        );
      case 'enum':
        if (from.kind === 'enum') return [...from.values].every((value) => to.values.has(value));
        if (from.kind === 'base' && options.enumConversion === true && from.name === to.valueType) {
          // A literal is checked now; any other value is checked when the program runs.
          return options.literal === undefined || to.values.has(options.literal);
        }
        return false;
      case 'array':
      case 'set':
        return from.kind === to.kind && (from.element.kind === 'nothing' || assignable(from.element, to.element));
      case 'map':
        if (from.kind === 'map') return from.value.kind === 'nothing' || assignable(from.value, to.value);
        // An object value can be a map when every member is of the map's type (docs/adr/0021-collections.md).
        return from.kind === 'anonymous' && [...from.fields.values()].every((field) => assignable(field, to.value));
      case 'model':
        if (from.kind === 'model') return sameSymbol(from.symbol, to.symbol);
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
        if (field.required) return false;
        continue;
      }
      // A member can't be an unchecked optional, even for an optional field.
      const target = field.type.kind === 'optional' ? field.type.inner : field.type;
      if (!assignable(given, target)) return false;
    }
    return [...from.fields.keys()].every((name) => fields.has(name));
  };

  return assignable;
}
