import type { BinaryOperator, Cardinality } from './ast.ts';
import type { BaseValue, Value } from './values.ts';

/**
 * A compiled program: what the compiler gives the interpreter, with every name resolved and
 * every runtime decision that depends on a type made explicit (docs/adr/0039-compiled-programs.md).
 * It is plain data, so it can be written to and read from JSON.
 */
export interface CompiledProgram {
  format: typeof COMPILED_FORMAT;
  /** Identifies this build, so that its source map can be matched with it. */
  build: string;
  entry: ModuleId;
  types: Record<SymbolId, CompiledType>;
  actions: Record<SymbolId, CompiledAction>;
  constants: Record<SymbolId, Value>;
  relations: CompiledRelation[];
  permissions: CompiledPermissions[];
  /** The entry module's triggers, the only ones that take effect. */
  triggers: CompiledTrigger[];
}

/** The version of the compiled program's structure, which the interpreter checks. */
export const COMPILED_FORMAT = 1;

/** The source of each module, kept apart from the compiled program (docs/adr/0039-compiled-programs.md). */
export interface SourceMap {
  format: typeof COMPILED_FORMAT;
  build: string;
  sources: Record<ModuleId, string>;
}

/** A module: its file's path relative to the program's root, such as `lib/payments.cant`, or `cant::IO`. */
export type ModuleId = string;

/** A declaration: its module, `#`, and its name, such as `lib/payments.cant#ChargeCard`. */
export type SymbolId = string;

/** Where something is in a module, with 1-based lines and columns. */
export interface SourcePosition {
  module: ModuleId;
  start: { line: number; column: number };
  end: { line: number; column: number };
}

// ----- Types -----


export type CompiledTypeRef =
  | { kind: 'base'; name: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE_TIME' | 'DURATION' | 'FILE' }
  | { kind: 'unknown' }
  /** The element type of an empty collection whose type nothing decides. */
  | { kind: 'nothing' }
  | { kind: 'named'; symbol: SymbolId }
  | { kind: 'enum'; values: BaseValue[] }
  | { kind: 'array' | 'set'; element: CompiledTypeRef }
  | { kind: 'map'; value: CompiledTypeRef }
  | { kind: 'optional'; inner: CompiledTypeRef }
  /** An anonymous model's type, from an object value. */
  | { kind: 'object'; fields: Record<string, CompiledTypeRef> }
  /** `ERROR`, any error, on the right of `instanceOf`. */
  | { kind: 'anyError' }
  /** The type of `@subject` before it is narrowed. */
  | { kind: 'subject' }
  /**
   * The type of `@stdin`, or of `@stdout` and `@stderr` (docs/adr/0040-standard-streams.md). With
   * `file`, a `FILE` can be given too, as to `cant::IO`'s `ReadStream` (docs/adr/0042-io.md).
   */
  | { kind: 'stream'; direction: 'input' | 'output'; file?: true };

export type CompiledType = CompiledEnum | CompiledModel | CompiledError | CompiledEntity;

export interface CompiledEnum {
  kind: 'enum';
  members: [name: string, value: BaseValue][];
}

export interface CompiledField {
  name: string;
  type: CompiledTypeRef;
  optional: boolean;
  default?: CompiledExpression;
}

export interface CompiledModel {
  kind: 'model';
  fields: CompiledField[];
  /** The order to work out defaults in, as indexes into `fields`. */
  defaultOrder: number[];
}

export interface CompiledError {
  kind: 'error';
  data?: { model: SymbolId } | { fields: CompiledField[]; defaultOrder: number[] };
}

export interface CompiledEntity {
  kind: 'entity';
  model: SymbolId;
  /** The fields a program sees, by their names, each naming the model's field it holds. */
  exposed: Record<string, string>;
  identity: ({ field: string } | { navigation: string })[];
  navigation: Record<string, CompiledNavigationField>;
  subject: boolean;
  group?: { kind: string; roles: string[] };
  membership?: { member: string; group: string; roles?: string };
}

export interface CompiledNavigationField {
  entity: SymbolId;
  cardinality: Cardinality;
  inverse: string;
  /** An index into `relations`. */
  relation: number;
}

export interface CompiledRelationEnd {
  entity: SymbolId;
  field: string;
  cardinality: Cardinality;
}

export interface CompiledRelation {
  left: CompiledRelationEnd;
  right: CompiledRelationEnd;
}

export interface CompiledPermissions {
  group: string;
  role?: string;
  permissions: string[];
}

// ----- Actions and triggers -----

export interface CompiledParameter {
  name: string;
  type: CompiledTypeRef;
  optional: boolean;
  default?: CompiledExpression;
}

export interface CompiledAction {
  parameters: CompiledParameter[];
  returns: CompiledTypeRef | { kind: 'void' };
  /** Whether the return type is marked `?`. */
  optional: boolean;
  raises: SymbolId[];
  passes: SymbolId[] | 'all';
  /** The order to work out defaults in, as indexes into `parameters`. */
  defaultOrder: number[];
  implementation:
    | { kind: 'body'; locals: number; body: CompiledStatement[] }
    /** A native module's path, relative to the program's root. */
    | { kind: 'native'; module: string }
    /** Provided by the interpreter, as the standard library is. */
    | { kind: 'standard' };
  position?: SourcePosition;
}

export interface CompiledAssertion {
  test: CompiledExpression;
  message: CompiledExpression;
}

export interface CompiledTrigger {
  action: SymbolId;
  source: string;
  parameters: Record<string, Value>;
  /** A test case's subject: an entity, and its model's fields (docs/adr/0037-test-case-trigger-source.md). */
  subject?: { entity: SymbolId; fields: Value };
  /** Its arguments, by parameter name. Their code has no locals. */
  arguments: Record<string, CompiledExpression>;
  auth?: CompiledExpression;
  assertions: CompiledAssertion[];
  position: SourcePosition;
}

// ----- Code -----

interface At {
  position: SourcePosition;
}

/** An argument left out of a call, so the parameter's default is used, or it is left empty. */
export interface OmittedArgument {
  type: 'omitted';
}

export type CompiledExpression = At &
  (
    | { type: 'value'; value: Value }
    | { type: 'constant'; symbol: SymbolId }
    | { type: 'local'; slot: number }
    /** Another field of the object whose default is being worked out. */
    | { type: 'field'; name: string }
    | { type: 'builtIn'; name: string }
    | { type: 'template'; parts: (string | CompiledExpression)[] }
    | { type: 'array' | 'set'; element: CompiledTypeRef; elements: CompiledExpression[] }
    | { type: 'map'; value: CompiledTypeRef; members: [string, CompiledExpression][] }
    | { type: 'object'; members: [string, CompiledExpression][] }
    /** Make an object value into an object of a model, filling in its defaults. */
    | { type: 'construct'; model: SymbolId; value: CompiledExpression }
    /** Use an object value as a map. */
    | { type: 'toMap'; value: CompiledExpression }
    /** Check a value against an enum's values, raising InvalidEnumValue if it isn't one. */
    | { type: 'toEnum'; enum: CompiledTypeRef; value: CompiledExpression }
    /** Use the value of a result that may hold an error, panicking if it does. */
    | { type: 'unwrap'; value: CompiledExpression }
    | { type: 'member'; object: CompiledExpression; name: string }
    | { type: 'index'; object: CompiledExpression; index: CompiledExpression }
    | { type: 'call'; action: SymbolId; arguments: (CompiledExpression | OmittedArgument)[] }
    /** A call to a standard library action, whose signature isn't written down yet, with its arguments as written. */
    | { type: 'callStandard'; action: SymbolId; arguments: { name?: string; value: CompiledExpression }[] }
    | { type: 'unary'; operator: '!' | '-' | 'isEmpty' | 'ignore'; argument: CompiledExpression }
    | { type: 'binary'; operator: BinaryOperator; left: CompiledExpression; right: CompiledExpression }
    | { type: 'instanceOf'; value: CompiledExpression; target: CompiledTypeRef }
    | { type: 'can'; permission: string; group?: CompiledExpression }
    /** `@subject is <entity>`, `@subject is @anonymous` or `@subject is @defined`. */
    | { type: 'is'; target: { entity: SymbolId } | { builtIn: 'anonymous' | 'defined' } }
    | { type: 'hasRole'; role: string; group: CompiledExpression }
  );

/** Where an assignment or `delete` puts its value: a member or an element. */
export type CompiledTarget = Extract<CompiledExpression, { type: 'member' | 'index' }>;

export type CompiledStatement = At &
  (
    | { type: 'expression'; expression: CompiledExpression }
    /** Give a local its value. */
    | { type: 'let'; slot: number; value: CompiledExpression }
    /** `ignored` when the statement is under `ignore`, so the errors it can raise are ignored. */
    | { type: 'assign'; target: CompiledTarget; value: CompiledExpression; ignored: boolean }
    | { type: 'delete'; target: CompiledTarget; ignored: boolean }
    | { type: 'return'; value?: CompiledExpression | { type: 'nothing' } }
    | { type: 'raise'; error: SymbolId; data?: CompiledExpression }
    | { type: 'pass'; value: CompiledExpression }
    | { type: 'assert'; test: CompiledExpression; message?: CompiledExpression }
    | { type: 'break' }
    | { type: 'continue' }
    | { type: 'for'; slot: number; iterable: CompiledExpression; body: CompiledStatement[] }
    | { type: 'while'; test: CompiledExpression; body: CompiledStatement[] }
    | { type: 'if'; test: CompiledExpression; then: CompiledStatement[]; else?: CompiledStatement[] }
  );
