import type {
  ActionDeclaration,
  Argument,
  ConstDeclaration,
  EntityDeclaration,
  ErrorDeclaration,
  Expression,
  Field,
  Identifier,
  ModelDeclaration,
  Name,
  NamedValue,
  Statement,
  TriggerDeclaration,
} from '@dancrumb/cant-shared';
import type { Position } from 'unist';
import type { Locals } from './bodies.ts';
import { error, type Diagnostic } from './diagnostic.ts';
import type { NavigationField } from './entities.ts';
import type { LoadedProgram, Module, ModuleSymbol } from './modules.ts';
import type { References } from './resolve.ts';
import {
  BOOLEAN,
  constantKey,
  createAssignable,
  DATE_TIME,
  describe,
  DURATION,
  fieldType,
  isBase,
  NOTHING,
  NUMBER,
  optional,
  sameSymbol,
  TEXT,
  typeOf,
  typeOfSymbol,
  UNCHECKED,
  UNKNOWN,
  VOID,
  type Assignable,
  type AssignOptions,
  type EnumValue,
  type ModelFields,
  type Type,
} from './types.ts';

/** What the type checker needs from the earlier passes. */
export interface ResolvedProgram extends LoadedProgram {
  references: References;
  locals: Locals;
  navigation: Map<string, Map<string, NavigationField>>;
}

/** An expression's type, and its value as an enum value key when the compiler knows it. */
interface Typed {
  type: Type;
  literal?: EnumValue;
}

/**
 * What a name is known to be at a point in a body, after narrowing: keyed by the identifier that
 * declares a local, or by `@name` for a built-in value (docs/adr/0016-handling-optional-values.md).
 */
type Facts = ReadonlyMap<Identifier | string, Type>;

const NO_FACTS: Facts = new Map();

const extend = (facts: Facts, more: Facts): Facts => (more.size === 0 ? facts : new Map([...facts, ...more]));

const symbolKey = (symbol: ModuleSymbol): string => `${symbol.module}::${symbol.name}`;

/** A built-in error, in `cant::Errors` (docs/adr/0023-error-handling.md). */
const builtInError = (name: string): ModuleSymbol => ({ kind: 'type', typeKind: 'error', name, module: 'cant::Errors' });

/** A result that holds a value of `value`, or one of `errors`. With no errors, it is just the value. */
const result = (value: Type, errors: readonly ModuleSymbol[], anyError = false): Type =>
  errors.length === 0 && !anyError ? value : { kind: 'result', value, errors, anyError };

/** A result held in an identifier, which must be handled before the action ends. */
interface HeldResult {
  name: Identifier;
  errors: readonly ModuleSymbol[];
  anyError: boolean;
  /** Whether it was used, passed, ignored or checked with `instanceOf ERROR`. */
  handled: boolean;
  /** The errors `instanceOf` has checked it for. */
  checked: Set<string>;
}

/**
 * Check the types of every expression and statement in a program (docs/adr/0012-base-types.md
 * and the ADRs that build on it), and report what doesn't fit:
 *
 * - operators given operands they don't take (docs/adr/0019-operators.md, 0026);
 * - conditions that aren't `BOOLEAN`, and messages that aren't `TEXT`;
 * - values given where they don't fit: arguments, returns, assignments, defaults and constants,
 *   including enum compatibility (docs/adr/0013-enums.md) and object values matched against
 *   models (docs/adr/0027-object-shapes.md);
 * - fields and members a value doesn't have;
 * - optionals used before they are checked, and `isEmpty` and `orElse` on values that aren't
 *   optional, with narrowing by `isEmpty`, `instanceOf` and `@subject is`, through `!`, `and`,
 *   `or`, early returns and `assert` (docs/adr/0014-optionals.md, 0016, 0033, 0010);
 * - values that can't be interpolated into text (docs/adr/0011-converting-values-to-text.md);
 * - actions that can end without returning a value;
 * - error handling (docs/adr/0023-error-handling.md): `raises` and `passes` clauses, results
 *   that are never handled, unchecked results returned, errors raised or passed that the action
 *   doesn't declare, `raise` data, errors from `/` and `%` and from statements, and the types of
 *   `@result` and `@error`.
 */
export function checkTypes(program: ResolvedProgram): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const shared = new SharedTypes(program);
  for (const module of program.modules.values()) {
    new TypeChecker(module, program, shared, (diagnostic) => {
      diagnostics.push({ ...diagnostic, file: module.path });
    }).run();
  }
  return diagnostics;
}

/** What every module's checker shares: field types, and the types of constants. */
class SharedTypes {
  readonly assignable: Assignable;
  readonly constants = new Map<ConstDeclaration, Type>();
  readonly working = new Set<ConstDeclaration>();
  private readonly program: ResolvedProgram;
  private readonly models = new Map<ModelDeclaration, ReadonlyMap<string, { type: Type; required: boolean }>>();
  private readonly entities = new Map<EntityDeclaration, ReadonlyMap<string, Type>>();
  private readonly dataModels = new Map<ErrorDeclaration, ModelDeclaration>();

  constructor(program: ResolvedProgram) {
    this.program = program;
    this.assignable = createAssignable(this.modelFields);
  }

  readonly modelFields: ModelFields = (model) => {
    let fields = this.models.get(model);
    if (fields === undefined) {
      fields = new Map(
        model.fields.map((field) => [field.name.value, { type: fieldType(field, this.program.references), required: !field.optional }]),
      );
      this.models.set(model, fields);
    }
    return fields;
  };

  /** The model an entity is made of (docs/adr/0022-entities.md). */
  modelOf(entity: EntityDeclaration): ModelDeclaration | undefined {
    const name = entity.lines.find((line) => line.type === 'modelsBlock')?.models[0];
    const model = name === undefined ? undefined : this.program.references.get(name)?.declaration;
    return model?.type === 'model' ? model : undefined;
  }

  /**
   * An error's `data` model, as a model declaration: its named model, or one made from its
   * anonymous fields, so both are matched the same way (docs/adr/0023-error-handling.md).
   */
  dataModelOf(declaration: ErrorDeclaration): ModelDeclaration | undefined {
    const data = declaration.data;
    if (data === undefined) return undefined;
    if (!Array.isArray(data)) {
      const model = this.program.references.get(data)?.declaration;
      return model?.type === 'model' ? model : undefined;
    }
    let model = this.dataModels.get(declaration);
    if (model === undefined) {
      model = { type: 'model', name: declaration.name, fields: data, position: declaration.position };
      this.dataModels.set(declaration, model);
    }
    return model;
  }

  /**
   * The fields an entity exposes, by the names it exposes them under, and its navigation fields
   * (docs/adr/0022-entities.md, 0035). Hidden fields aren't part of its type.
   */
  entityFields(symbol: ModuleSymbol, entity: EntityDeclaration): ReadonlyMap<string, Type> {
    let fields = this.entities.get(entity);
    if (fields !== undefined) return fields;
    const model = this.modelOf(entity);
    const modelFields = model === undefined ? new Map<string, { type: Type; required: boolean }>() : this.modelFields(model);
    const exposed = new Map<string, Type>();
    const expose = entity.lines.filter((line) => line.type === 'exposeBlock').flatMap((line) => line.items);
    const hidden = new Set(
      entity.lines
        .filter((line) => line.type === 'hideBlock')
        .flatMap((line) => line.items.flatMap((item) => (item.type === 'identifier' ? [item.value] : []))),
    );
    if (expose.some((item) => item.type === 'builtIn')) {
      for (const [name, field] of modelFields) if (!hidden.has(name)) exposed.set(name, field.type);
    }
    for (const item of expose) {
      if (item.type === 'builtIn') continue;
      const field = modelFields.get(item.field.value);
      if (field === undefined) continue;
      if (item.as !== undefined) exposed.delete(item.field.value);
      exposed.set(item.as?.value ?? item.field.value, field.type);
    }
    for (const [name, navigation] of this.navigationOf(symbol)) {
      const far = typeOfSymbol(navigation.far);
      exposed.set(
        name,
        navigation.farCardinality === '1' ? far : navigation.farCardinality === '0..1' ? optional(far) : { kind: 'set', element: far },
      );
    }
    fields = exposed;
    this.entities.set(entity, fields);
    return fields;
  }

  navigationOf(symbol: ModuleSymbol): ReadonlyMap<string, NavigationField> {
    return this.program.navigation.get(symbolKey(symbol)) ?? new Map<string, NavigationField>();
  }

  /** Whether an entity's field, as exposed, has a default in its model, so `delete` resets it. */
  entityFieldHasDefault(entity: EntityDeclaration, name: string): boolean {
    const model = this.modelOf(entity);
    if (model === undefined) return false;
    const expose = entity.lines.filter((line) => line.type === 'exposeBlock').flatMap((line) => line.items);
    const renamed = expose.find((item) => item.type === 'exposedField' && item.as?.value === name);
    const fieldName = renamed?.type === 'exposedField' ? renamed.field.value : name;
    return model.fields.some((field) => field.name.value === fieldName && field.defaultValue !== undefined);
  }
}

class TypeChecker {
  private readonly module: Module;
  private readonly references: References;
  private readonly locals: Locals;
  private readonly shared: SharedTypes;
  private readonly report: (diagnostic: Diagnostic) => void;
  /** The declared type of each local: parameters, assigned identifiers, loop variables and fields. */
  private readonly bindings = new Map<Identifier, Type>();
  /** The `NUMBER` value of each local the compiler knows, for constant divisors (docs/adr/0023-error-handling.md). */
  private readonly constantValues = new Map<Identifier, number>();
  /** The results held in identifiers, which must be handled. */
  private readonly held = new Map<Identifier, HeldResult>();
  /** The expressions whose results were used unchecked, which `return` can't use. */
  private readonly usedResults = new Set<Expression>();
  /** The action being checked, for its return type and error clauses. */
  private action: ActionDeclaration | undefined;
  /** The trigger being checked, for `@result` and `@error`. */
  private trigger: TriggerDeclaration | undefined;

  constructor(module: Module, program: ResolvedProgram, shared: SharedTypes, report: (diagnostic: Diagnostic) => void) {
    this.module = module;
    this.references = program.references;
    this.locals = program.locals;
    this.shared = shared;
    this.report = report;
  }

  private assignable(from: Type, to: Type, options?: AssignOptions): boolean {
    return this.shared.assignable(from, to, options);
  }

  run(): void {
    for (const declaration of this.module.program?.children ?? []) {
      switch (declaration.type) {
        case 'action':
          this.checkAction(declaration);
          break;
        case 'const':
          this.constantType(declaration);
          break;
        case 'model':
          this.checkFields(declaration.fields);
          break;
        case 'errorDeclaration':
          if (Array.isArray(declaration.data)) this.checkFields(declaration.data);
          break;
        case 'trigger':
          this.checkTrigger(declaration);
          break;
        default:
          break;
      }
    }
  }

  // ----- Declarations -----

  private checkAction(action: ActionDeclaration): void {
    this.action = action;
    this.held.clear();
    this.checkErrorClauses(action);
    for (const parameter of action.parameters) {
      const type = typeOf(parameter.valueType, this.references);
      // A parameter with a default always has a value inside the action (docs/adr/0014-optionals.md).
      this.bindings.set(parameter.name, parameter.optional && parameter.defaultValue === undefined ? optional(type) : type);
    }
    for (const parameter of action.parameters) {
      if (parameter.defaultValue === undefined) continue;
      this.expectValue(parameter.defaultValue, typeOf(parameter.valueType, this.references), NO_FACTS, 'The default', true);
    }
    const { terminates } = this.block(action.children, NO_FACTS);
    if (action.native === undefined && action.returnType.type !== 'voidType' && !terminates) {
      this.report(
        error(
          'missing-return',
          `${action.name.value} returns ${describe(this.returnType(action))}, but its body can end without returning one.`,
          action.name.position,
        ),
      );
    }
    this.reportUnhandled();
    this.action = undefined;
  }

  /** An error can be listed once, in one clause, and only `passes` can take `@all` (docs/adr/0023-error-handling.md). */
  private checkErrorClauses(action: ActionDeclaration): void {
    const seen = new Map<string, Name>();
    let all = false;
    for (const name of [...action.raises, ...action.passes]) {
      if (name.type === 'builtIn') {
        if (all) this.report(error('duplicate-error', '`@all` is listed twice.', name.position));
        all = true;
        continue;
      }
      const symbol = this.references.get(name);
      if (symbol === undefined) continue;
      const earlier = seen.get(symbolKey(symbol));
      if (earlier !== undefined) {
        this.report(
          error('duplicate-error', `${symbol.name} is already listed, on line ${String(earlier.position.start.line)}. An error can be listed once, in one clause.`, name.position),
        );
      }
      seen.set(symbolKey(symbol), name);
    }
    if (action.native !== undefined && action.passes.length > 0) {
      this.report(
        error('native-passes', "A native action can't have a `passes` clause, since it doesn't call Cant actions. List its errors in `raises`.", action.passes[0]?.position ?? action.name.position),
      );
    }
  }

  private returnType(action: ActionDeclaration): Type {
    if (action.returnType.type === 'voidType') return VOID;
    const type = typeOf(action.returnType, this.references);
    return action.optional ? optional(type) : type;
  }

  /** What calling an action gives: its value, or one of the errors it raises or passes. */
  private actionResult(action: ActionDeclaration, extra: readonly ModuleSymbol[] = []): Type {
    const errors: ModuleSymbol[] = [...extra];
    let anyError = false;
    for (const name of [...action.raises, ...action.passes]) {
      if (name.type === 'builtIn') {
        anyError = true;
        continue;
      }
      const symbol = this.references.get(name);
      if (symbol !== undefined && !errors.some((other) => sameSymbol(other, symbol))) errors.push(symbol);
    }
    return result(this.returnType(action), errors, anyError);
  }

  private checkFields(fields: Field[]): void {
    for (const field of fields) this.bindings.set(field.name, fieldType(field, this.references));
    for (const field of fields) {
      if (field.defaultValue === undefined) continue;
      this.expectValue(field.defaultValue, typeOf(field.valueType, this.references), NO_FACTS, 'The default', false);
    }
  }

  /** A constant's type: the one it declares, or its value's (docs/adr/0034-top-level-constants.md). */
  private constantType(constant: ConstDeclaration): Type {
    const known = this.shared.constants.get(constant);
    if (known !== undefined) return known;
    if (this.shared.working.has(constant)) {
      this.report(error('constant-cycle', `${constant.name.value}'s value depends on itself.`, constant.name.position));
      return UNCHECKED;
    }
    this.shared.working.add(constant);
    let type: Type;
    if (constant.valueType === undefined) {
      type = this.value(constant.value, NO_FACTS).type;
    } else {
      type = typeOf(constant.valueType, this.references);
      this.expectValue(constant.value, type, NO_FACTS, `${constant.name.value}'s value`, false);
    }
    this.shared.working.delete(constant);
    this.shared.constants.set(constant, type);
    return type;
  }

  private checkTrigger(trigger: TriggerDeclaration): void {
    this.trigger = trigger;
    const action = this.references.get(trigger.action)?.declaration;
    const facts = NO_FACTS;

    if (trigger.source.value === 'TestCase') this.checkTestCaseParameters(trigger.parameters ?? []);
    else for (const parameter of trigger.parameters ?? []) this.value(parameter.value, facts);

    if (trigger.auth !== undefined) this.condition(trigger.auth, facts, 'An `auth` rule');

    for (const argument of trigger.arguments ?? []) {
      const parameter = action?.type === 'action' ? action.parameters.find((candidate) => candidate.name.value === argument.name.value) : undefined;
      if (parameter === undefined) {
        this.value(argument.value, facts);
        continue;
      }
      this.argument(argument.value, parameter.valueType, parameter.optional, facts, argument.name.value);
    }

    let asserted = facts;
    for (const assertion of trigger.assertions ?? []) {
      this.condition(assertion.test, asserted, 'An assertion');
      this.expectText(assertion.message, asserted, "An assertion's message");
      // Each assertion is only reached when those before it held (docs/adr/0037-test-case-trigger-source.md).
      asserted = extend(asserted, this.narrow(assertion.test, true, asserted));
    }
    this.trigger = undefined;
  }

  /** `name: TEXT`, `now: DATE_TIME` and a `subject` object matched against its entity's model (docs/adr/0037-test-case-trigger-source.md, 0026). */
  private checkTestCaseParameters(parameters: NamedValue[]): void {
    for (const parameter of parameters) {
      switch (parameter.name.value) {
        case 'name':
          this.expectText(parameter.value, NO_FACTS, "A test case's name");
          break;
        case 'now':
          this.expectValue(parameter.value, DATE_TIME, NO_FACTS, "A test case's now", false);
          break;
        case 'subject':
          this.checkTestSubject(parameter.value);
          break;
        default:
          this.value(parameter.value, NO_FACTS);
      }
    }
  }

  private checkTestSubject(value: Expression): void {
    if (value.type !== 'object') {
      this.report(error('type-mismatch', "A test case's subject must be an object value naming its @entity and its fields.", value.position));
      return;
    }
    const entityItem = value.items.find((item) => item.name.type === 'builtIn' && item.name.name === 'entity');
    const entityName = entityItem?.value;
    const symbol = entityName?.type === 'identifier' || entityName?.type === 'qualifiedIdentifier' ? this.references.get(entityName) : undefined;
    const fields = new Map<string, Type>();
    for (const item of value.items) {
      if (item.name.type === 'builtIn') continue;
      fields.set(item.name.type === 'string' ? textOf(item.name) : item.name.value, this.value(item.value, NO_FACTS).type);
    }
    const entity = symbol?.declaration;
    if (entity?.type !== 'entity') return;
    const model = this.shared.modelOf(entity);
    if (model === undefined) return;
    const anonymous: Type = { kind: 'anonymous', fields };
    const modelType: Type = { kind: 'model', symbol: { kind: 'type', typeKind: 'model', name: model.name.value, module: symbol?.module ?? '' }, declaration: model };
    if (!this.assignable(anonymous, modelType)) {
      this.report(
        error(
          'type-mismatch',
          `This subject's fields don't match ${entity.name.value}'s model, ${model.name.value}: it must give every required field, each with a value of its type, and nothing else.`,
          value.position,
        ),
      );
    }
  }

  // ----- Statements -----

  /** Check a block's statements, and say whether it always ends by leaving it: by returning, raising, passing, breaking or continuing. */
  private block(statements: Statement[], facts: Facts): { facts: Facts; terminates: boolean } {
    let current = facts;
    for (const statement of statements) {
      const outcome = this.statement(statement, current, false);
      current = outcome.facts;
      if (outcome.terminates) return { facts: current, terminates: true };
    }
    return { facts: current, terminates: false };
  }

  private statement(statement: Statement, facts: Facts, ignored: boolean): { facts: Facts; terminates: boolean } {
    const go = { facts, terminates: false };
    switch (statement.type) {
      case 'expressionStatement':
        // A call whose result isn't used is ignored (docs/adr/0023-error-handling.md).
        this.expression(statement.expression, facts);
        return go;
      case 'assignment':
        this.assignment(statement.target, statement.value, facts, ignored);
        return go;
      case 'delete':
        this.delete(statement.target, facts, ignored);
        return go;
      case 'ignoredStatement':
        return this.statement(statement.statement, facts, true);
      case 'return':
        this.return(statement, facts);
        return { facts, terminates: true };
      case 'raise':
        this.raise(statement, facts);
        return { facts, terminates: true };
      case 'pass':
        this.pass(statement.argument, facts);
        return { facts, terminates: true };
      case 'assert':
        this.condition(statement.test, facts, 'An `assert`');
        if (statement.message !== undefined) this.expectText(statement.message, facts, "An `assert`'s message");
        return { facts: extend(facts, this.narrow(statement.test, true, facts)), terminates: false };
      case 'break':
      case 'continue':
        return { facts, terminates: true };
      case 'for': {
        const iterable = this.value(statement.iterable, facts).type;
        this.bindings.set(statement.variable, this.elementType(iterable, statement.iterable.position));
        this.block(statement.children, facts);
        return go;
      }
      case 'while': {
        this.condition(statement.test, facts, 'A `while` condition');
        this.block(statement.children, extend(facts, this.narrow(statement.test, true, facts)));
        // `while true` only ends by returning, raising or passing, unless its body breaks out.
        const forever = statement.test.type === 'boolean' && statement.test.value && !breaks(statement.children);
        return { facts, terminates: forever };
      }
      case 'if': {
        this.condition(statement.test, facts, 'An `if` condition');
        const whenTrue = extend(facts, this.narrow(statement.test, true, facts));
        const whenFalse = extend(facts, this.narrow(statement.test, false, facts));
        const [consequent, alternate] = statement.children;
        const then = this.block(consequent.children, whenTrue);
        const otherwise =
          alternate === undefined
            ? { facts: whenFalse, terminates: false }
            : alternate.type === 'if'
              ? this.statement(alternate, whenFalse, false)
              : this.block(alternate.children, whenFalse);
        if (then.terminates && otherwise.terminates) return { facts, terminates: true };
        // After an `if` whose branch always leaves, the code only runs when the other branch's
        // condition held, so it keeps that narrowing (docs/adr/0016-handling-optional-values.md).
        if (then.terminates) return { facts: whenFalse, terminates: false };
        if (otherwise.terminates && alternate !== undefined) return { facts: whenTrue, terminates: false };
        return go;
      }
    }
  }

  /** The type of each element a `for` loop gives (docs/adr/0021-collections.md). */
  private elementType(iterable: Type, position: Position): Type {
    switch (iterable.kind) {
      case 'array':
      case 'set':
        return iterable.element.kind === 'nothing' ? UNCHECKED : iterable.element;
      case 'unchecked':
        return UNCHECKED;
      case 'map':
        this.report(error('loop-over-map', "A `for` loop can't loop over a map. Loop over its names, with `Collections::keys`.", position));
        return UNCHECKED;
      case 'optional':
        this.uncheckedOptional(iterable, position);
        return UNCHECKED;
      default:
        this.report(error('type-mismatch', `A \`for\` loop needs an array or a set, but this is ${describe(iterable)}.`, position));
        return UNCHECKED;
    }
  }

  private assignment(target: Expression, value: Expression, facts: Facts, ignored: boolean): void {
    if (target.type === 'identifier') {
      // Giving a result to an identifier doesn't use it, so it holds the result unchecked.
      const typed = this.expression(value, facts);
      if (typed.type.kind === 'void') {
        this.report(error('void-value', 'This call returns VOID, so there is no value to give the name.', value.position));
      }
      if (this.locals.get(target)?.declaration !== target) return;
      this.bindings.set(target, typed.type);
      const known = this.constantNumber(value);
      if (known !== undefined) this.constantValues.set(target, known);
      if (typed.type.kind === 'result') {
        // `owner := ignore FindUser(email)` keeps the result, already marked as ignored.
        const markedIgnored = value.type === 'unary' && value.operator === 'ignore';
        this.held.set(target, { name: target, errors: typed.type.errors, anyError: typed.type.anyError, handled: markedIgnored, checked: new Set() });
      }
      return;
    }
    // A member or element: the value must fit what it holds, and can't be an unchecked optional.
    const slot = this.value(target, facts).type;
    const expected = slot.kind === 'optional' ? slot.inner : slot;
    this.expectValue(value, expected, facts, 'The value', false);
    this.statementErrors(target, facts, ignored, 'assign');
  }

  /** `delete` clears an optional field, or removes a member or element (docs/adr/0021-collections.md, 0027). */
  private delete(target: Expression, facts: Facts, ignored: boolean): void {
    if (target.type !== 'member') {
      this.value(target, facts);
      this.statementErrors(target, facts, ignored, 'delete');
      return;
    }
    const object = this.value(target.object, facts).type;
    const field = this.memberOf(object, target.property, target.object.position);
    if ((object.kind === 'model' || object.kind === 'entity' || object.kind === 'anonymous') && field.kind !== 'optional' && field.kind !== 'unchecked') {
      // A field with a default is set back to its default, so it can be deleted.
      const hasDefault =
        object.kind === 'model'
          ? object.declaration.fields.some((candidate) => candidate.name.value === target.property.value && candidate.defaultValue !== undefined)
          : object.kind === 'entity' && this.shared.entityFieldHasDefault(object.declaration, target.property.value);
      if (!hasDefault) {
        this.report(
          error('delete-required', `${target.property.value} is a required field, so it can't be deleted. \`delete\` only clears optional fields.`, target.property.position),
        );
      }
    }
    this.statementErrors(target, facts, ignored, 'delete');
  }

  /**
   * The errors an assignment or `delete` can raise from the action, which it must list in
   * `raises` unless the statement is ignored (docs/adr/0023-error-handling.md, 0021, 0027, 0035).
   */
  private statementErrors(target: Expression, facts: Facts, ignored: boolean, kind: 'assign' | 'delete'): void {
    if (target.type === 'index') {
      const object = this.peek(target.object, facts);
      const literalName = target.index.type === 'string' && target.index.parts.every((part) => part.type === 'text');
      if (object.kind === 'array' && kind === 'assign') {
        const index = this.constantNumber(target.index);
        if (index === undefined || index < 0) this.requireRaised('IndexBeforeStart', target.index.position, ignored, 'assigning to an index that may be before the start of the array');
      }
      if ((object.kind === 'model' || object.kind === 'entity') && !literalName) {
        if (kind === 'assign') this.requireRaised('UnknownField', target.index.position, ignored, 'assigning to a field named by an expression');
        else this.requireRaised('RequiredField', target.index.position, ignored, 'deleting a field named by an expression');
      }
    }
    if (target.type === 'member' && kind === 'assign') {
      const object = this.peek(target.object, facts);
      if (object.kind === 'entity' && this.shared.navigationOf(object.symbol).has(target.property.value)) {
        this.requireRaised('CardinalityViolation', target.property.position, ignored, 'changing a relationship');
      }
    }
  }

  /** Report a statement that can raise a built-in error the action doesn't declare. */
  private requireRaised(name: string, position: Position, ignored: boolean, what: string): void {
    if (ignored || this.action === undefined) return;
    const declared = this.action.raises.some((raised) => {
      const symbol = this.references.get(raised);
      return symbol !== undefined && sameSymbol(symbol, builtInError(name));
    });
    if (declared) return;
    this.report(
      error(
        'undeclared-error',
        `${what[0]?.toUpperCase() ?? ''}${what.slice(1)} can raise ${name}. List it in \`raises\`, with \`cant::Errors\` imported, or put \`ignore\` before the statement.`,
        position,
      ),
    );
  }

  private return(statement: Extract<Statement, { type: 'return' }>, facts: Facts): void {
    const action = this.action;
    if (action === undefined) return;
    const expected = this.returnType(action);
    const argument = statement.argument;
    if (expected.kind === 'void') {
      if (argument !== undefined) {
        this.report(error('return-value', `${action.name.value} returns VOID, so \`return\` can't give a value.`, argument.position));
      }
      return;
    }
    if (argument === undefined) {
      this.report(error('return-value', `${action.name.value} returns ${describe(expected)}, so \`return\` needs a value.`, statement.position));
      return;
    }
    if (argument.type === 'nothing') {
      if (expected.kind !== 'optional') {
        this.report(error('return-value', 'NOTHING can only be returned from an action whose return type is marked `?`.', argument.position));
      }
      return;
    }
    const typed = this.expectValue(argument, expected, facts, 'The returned value', true);
    // A value that may hold an error can't be returned (docs/adr/0023-error-handling.md).
    if (this.containsUsedResult(argument)) {
      this.report(
        error(
          'return-unchecked',
          'This uses a result that may hold an error, which `return` can\'t give. Check it with `instanceOf` first, or use it before the `return`, or `pass` it.',
          argument.position,
        ),
      );
    }
    // Converting a value that isn't known now to an enum is checked when the program runs, and
    // raises InvalidEnumValue from the action (docs/adr/0013-enums.md).
    const target = expected.kind === 'optional' ? expected.inner : expected;
    if (target.kind === 'enum' && typed.type.kind === 'base' && typed.literal === undefined) {
      this.requireRaised('InvalidEnumValue', argument.position, false, `returning a ${typed.type.name} as ${describe(target)}`);
    }
  }

  /** `raise E(…)` or `raise E with value` (docs/adr/0023-error-handling.md). */
  private raise(statement: Extract<Statement, { type: 'raise' }>, facts: Facts): void {
    const symbol = this.references.get(statement.error);
    const action = this.action;
    if (symbol === undefined || action === undefined) return;
    const listed = action.raises.some((name) => {
      const raised = this.references.get(name);
      return raised !== undefined && sameSymbol(raised, symbol);
    });
    if (!listed) {
      this.report(
        error('undeclared-error', `${action.name.value} doesn't list ${symbol.name} in its \`raises\` clause, so it can't raise it.`, statement.error.position),
      );
    }

    const declaration = symbol.declaration?.type === 'errorDeclaration' ? symbol.declaration : undefined;
    const data = declaration === undefined ? undefined : this.shared.dataModelOf(declaration);
    if (data === undefined) {
      if ((statement.arguments ?? []).length > 0 || statement.data !== undefined) {
        this.report(error('no-data', `${symbol.name} has no \`data\`, so it is raised without any.`, statement.error.position));
      }
      for (const argument of statement.arguments ?? []) this.value(argument.value, facts);
      if (statement.data !== undefined) this.value(statement.data, facts);
      return;
    }

    const dataType: Type = { kind: 'model', symbol: { kind: 'type', typeKind: 'model', name: data.name.value, module: symbol.module }, declaration: data };
    if (statement.data !== undefined) {
      this.expectValue(statement.data, dataType, facts, `${symbol.name}'s data`, false);
      return;
    }
    // The `data` model's fields take the place of parameters (docs/adr/0020-action-parameters.md).
    const fields = this.shared.modelFields(data);
    const given = new Set<string>();
    for (const argument of statement.arguments ?? []) {
      const name = argument.name?.value ?? (argument.value.type === 'identifier' ? argument.value.value : undefined);
      const field = name === undefined ? undefined : fields.get(name);
      if (name === undefined || field === undefined) {
        this.report(
          error(
            'unknown-parameter',
            name === undefined ? `Name the field of ${symbol.name}'s data this is for, as in field := value.` : `${symbol.name}'s data has no field called ${name}.`,
            argument.position,
          ),
        );
        this.value(argument.value, facts);
        continue;
      }
      given.add(name);
      this.expectValue(argument.value, field.type.kind === 'optional' ? field.type.inner : field.type, facts, `The value for ${name}`, true);
    }
    const missing = [...fields].filter(([name, field]) => field.required && !given.has(name)).map(([name]) => name);
    if (missing.length > 0) {
      this.report(error('missing-argument', `${symbol.name}'s data needs ${missing.join(', ')}.`, statement.error.position));
    }
  }

  /** `pass` an error, or an unchecked result, along (docs/adr/0023-error-handling.md). */
  private pass(argument: Expression, facts: Facts): void {
    const action = this.action;
    const typed = this.expression(argument, facts);
    this.markHandled(argument);
    if (action === undefined || typed.type.kind === 'unchecked') return;
    const type = typed.type;
    let errors: readonly ModuleSymbol[];
    let anyError: boolean;
    if (type.kind === 'result') {
      errors = type.errors;
      anyError = type.anyError;
      const expected = this.returnType(action);
      if (expected.kind !== 'void' && type.value.kind !== 'void' && !this.assignable(type.value, expected, { enumConversion: true })) {
        this.report(
          error('type-mismatch', `\`pass\` returns this result's value when it has one, so it must be ${describe(expected)}, but it is ${describe(type.value)}.`, argument.position),
        );
      }
    } else if (type.kind === 'error') {
      errors = type.symbol !== undefined ? [type.symbol] : (type.among ?? []);
      anyError = type.symbol === undefined && type.among === undefined;
    } else {
      this.report(error('pass-non-error', `\`pass\` takes an error, or a result that may hold one, but this is ${describe(type)}.`, argument.position));
      return;
    }

    const passesAll = action.passes.some((name) => name.type === 'builtIn');
    if (passesAll) return;
    if (anyError) {
      this.report(error('undeclared-error', `This may hold any error, so ${action.name.value} can only pass it with \`passes @all\`.`, argument.position));
      return;
    }
    const declared = [...action.raises, ...action.passes].flatMap((name) => {
      const symbol = name.type === 'builtIn' ? undefined : this.references.get(name);
      return symbol === undefined ? [] : [symbol];
    });
    const undeclared = errors.filter((symbol) => !declared.some((other) => sameSymbol(other, symbol)));
    if (undeclared.length > 0) {
      this.report(
        error(
          'undeclared-error',
          `${action.name.value} can't pass ${undeclared.map((symbol) => symbol.name).join(' or ')}: list ${undeclared.length === 1 ? 'it' : 'them'} in its \`passes\` clause.`,
          argument.position,
        ),
      );
    }
  }

  /** Report the results held in identifiers that were never handled (docs/adr/0023-error-handling.md). */
  private reportUnhandled(): void {
    for (const held of this.held.values()) {
      if (held.handled) continue;
      const unchecked = held.errors.filter((symbol) => !held.checked.has(symbolKey(symbol)));
      if (unchecked.length === 0 && !held.anyError && held.checked.size > 0) continue;
      const what = held.anyError ? 'any error' : unchecked.map((symbol) => symbol.name).join(' or ');
      this.report(
        error(
          'unhandled-result',
          `${held.name.value} may hold ${what}, which is never handled. Check it with \`instanceOf\`, \`pass\` it, \`ignore\` it, or use it.`,
          held.name.position,
        ),
      );
    }
  }

  /** Mark a result held in an identifier as handled. */
  private markHandled(expression: Expression): void {
    if (expression.type !== 'identifier') return;
    const declaration = this.locals.get(expression)?.declaration;
    const held = declaration === undefined ? undefined : this.held.get(declaration);
    if (held !== undefined) held.handled = true;
  }

  private containsUsedResult(expression: Expression): boolean {
    let found = false;
    const walk = (node: unknown): void => {
      if (found || typeof node !== 'object' || node === null) return;
      if (Array.isArray(node)) {
        for (const child of node) walk(child);
        return;
      }
      if (this.usedResults.has(node as Expression)) {
        found = true;
        return;
      }
      for (const [key, value] of Object.entries(node)) if (key !== 'position') walk(value);
    };
    walk(expression);
    return found;
  }

  // ----- Checks on values -----

  /** Check that an expression's value fits `expected`, and report it if not. */
  private expectValue(expression: Expression, expected: Type, facts: Facts, what: string, enumConversion: boolean): Typed {
    const typed = this.value(expression, facts);
    const options: AssignOptions = { enumConversion, ...(typed.literal !== undefined && { literal: typed.literal }) };
    if (!this.assignable(typed.type, expected, options)) this.mismatch(typed.type, expected, expression.position, what);
    return typed;
  }

  private mismatch(found: Type, expected: Type, position: Position, what: string): void {
    if (found.kind === 'optional' && expected.kind !== 'optional' && this.assignable(found.inner, expected)) {
      this.uncheckedOptional(found, position);
      return;
    }
    this.report(error('type-mismatch', `${what} must be ${describe(expected)}, but this is ${describe(found)}.`, position));
  }

  private uncheckedOptional(found: Type, position: Position): void {
    this.report(
      error('unchecked-optional', `This is ${describe(found)}, which might be NOTHING. Check it with \`isEmpty\` first, or give a fallback with \`orElse\`.`, position),
    );
  }

  private condition(expression: Expression, facts: Facts, what: string): void {
    this.expectValue(expression, BOOLEAN, facts, what, false);
  }

  private expectText(expression: Expression, facts: Facts, what: string): void {
    this.expectValue(expression, TEXT, facts, what, false);
  }

  /** Check an argument, and say whether converting it to an enum needs a check when the program runs. */
  private argument(value: Expression, parameterType: Parameter['valueType'], parameterOptional: boolean, facts: Facts, name: string): boolean {
    const expected = typeOf(parameterType, this.references);
    const typed = this.value(value, facts);
    // An optional can be passed to an optional parameter of its type (docs/adr/0014-optionals.md).
    const target = parameterOptional ? optional(expected) : expected;
    const options: AssignOptions = { enumConversion: true, ...(typed.literal !== undefined && { literal: typed.literal }) };
    if (!this.assignable(typed.type, target, options)) {
      this.mismatch(typed.type, expected, value.position, `The argument for ${name}`);
      return false;
    }
    const given = typed.type.kind === 'optional' ? typed.type.inner : typed.type;
    return expected.kind === 'enum' && given.kind === 'base' && typed.literal === undefined;
  }

  // ----- Expressions -----

  /**
   * An expression's type when its value is used. A result that may hold an error is used
   * unchecked, which panics if it holds one, and gives its value (docs/adr/0023-error-handling.md).
   */
  private value(expression: Expression, facts: Facts): Typed {
    const typed = this.expression(expression, facts);
    if (typed.type.kind !== 'result') return typed;
    this.usedResults.add(expression);
    this.markHandled(expression);
    if (typed.type.value.kind === 'void') {
      this.report(error('void-value', "This result never holds a value, so it can't be used as one. Check it with `instanceOf`, `pass` it or `ignore` it.", expression.position));
      return { type: UNCHECKED };
    }
    return { type: typed.type.value };
  }

  /** An expression's type, without using a result it may give. */
  private expression(expression: Expression, facts: Facts): Typed {
    switch (expression.type) {
      case 'identifier':
      case 'qualifiedIdentifier':
        return { type: this.nameType(expression, facts) };
      case 'builtIn':
        return { type: facts.get(`@${expression.name}`) ?? this.builtInType(expression) };
      case 'string': {
        for (const part of expression.parts) {
          if (part.type === 'interpolation') this.interpolated(part.expression, facts);
        }
        const constant = expression.parts.every((part) => part.type === 'text');
        return constant ? { type: TEXT, literal: constantKey(expression).key } : { type: TEXT };
      }
      case 'number':
      case 'boolean':
      case 'dateTime':
      case 'duration': {
        const { key, type } = constantKey(expression);
        return { type: { kind: 'base', name: type }, literal: key };
      }
      case 'array':
      case 'set':
        return { type: { kind: expression.type, element: this.elements(expression.elements, facts) } };
      case 'object': {
        const fields = new Map<string, Type>();
        for (const item of expression.items) {
          if (item.name.type === 'builtIn') continue;
          const type = this.value(item.value, facts).type;
          if (type.kind === 'optional') this.uncheckedOptional(type, item.value.position);
          fields.set(item.name.type === 'string' ? textOf(item.name) : item.name.value, type);
        }
        return { type: { kind: 'anonymous', fields } };
      }
      case 'member':
        return { type: this.member(expression, facts) };
      case 'index':
        return { type: this.index(expression, facts) };
      case 'call':
        return { type: this.call(expression, facts) };
      case 'unary':
        return { type: this.unary(expression, facts) };
      case 'binary':
        return { type: this.binary(expression, facts) };
      case 'instanceOf': {
        // Checking a result doesn't use it (docs/adr/0023-error-handling.md).
        this.expression(expression.value, facts);
        this.recordCheck(expression);
        return { type: BOOLEAN };
      }
      case 'canPredicate':
        if (expression.group !== undefined) this.group(expression.group, facts);
        return { type: BOOLEAN };
      case 'rolePredicate':
        this.group(expression.group, facts);
        return { type: BOOLEAN };
      case 'isPredicate':
        return { type: BOOLEAN };
    }
  }

  private nameType(name: Extract<Expression, { type: 'identifier' | 'qualifiedIdentifier' }>, facts: Facts): Type {
    if (name.type === 'identifier') {
      const local = this.locals.get(name);
      if (local !== undefined) return facts.get(local.declaration) ?? this.bindings.get(local.declaration) ?? UNCHECKED;
    }
    const symbol = this.references.get(name);
    if (symbol?.declaration?.type === 'const') return this.constantType(symbol.declaration);
    return UNCHECKED;
  }

  /** The types of the built-in values (docs/adr/0024-built-in-values.md, 0026, 0037). */
  private builtInType(builtIn: Extract<Expression, { type: 'builtIn' }>, quiet = false): Type {
    switch (builtIn.name) {
      case 'now':
        return DATE_TIME;
      case 'subject':
        return { kind: 'subject' };
      case 'result': {
        const action = this.triggerAction();
        return action === undefined ? UNCHECKED : this.actionResult(action);
      }
      case 'error': {
        // Outside a test case, @error has already been reported as misplaced.
        const action = this.trigger?.source.value === 'TestCase' ? this.triggerAction() : undefined;
        if (action === undefined) return UNCHECKED;
        const actionResult = this.actionResult(action);
        if (actionResult.kind !== 'result') {
          if (!quiet) this.report(error('no-errors', `${action.name.value} can't give an error, so @error would never hold one.`, builtIn.position));
          return UNCHECKED;
        }
        return optional(actionResult.anyError ? { kind: 'error' } : { kind: 'error', among: actionResult.errors });
      }
      default:
        // `@request` and `@message` are typed by their sources, which aren't defined yet.
        return UNCHECKED;
    }
  }

  private triggerAction(): ActionDeclaration | undefined {
    const declaration = this.trigger === undefined ? undefined : this.references.get(this.trigger.action)?.declaration;
    return declaration?.type === 'action' ? declaration : undefined;
  }

  /** A value interpolated into text must be one that converts to text (docs/adr/0011-converting-values-to-text.md). */
  private interpolated(expression: Expression, facts: Facts): void {
    const type = this.value(expression, facts).type;
    if (type.kind === 'optional') this.uncheckedOptional(type, expression.position);
    else if (type.kind === 'void' || type.kind === 'unknown' || type.kind === 'nothing' || (type.kind === 'error' && type.symbol === undefined && type.among !== undefined)) {
      this.report(
        error(
          'not-text',
          type.kind === 'unknown'
            ? "An UNKNOWN can't be interpolated. Narrow it with `instanceOf` first."
            : type.kind === 'error'
              ? 'An error can only be converted to text once it has been narrowed to a specific error, or to ERROR.'
              : `${describe(type)} has no value, so it can't be interpolated.`,
          expression.position,
        ),
      );
    }
  }

  /** The element type of an array or set value, all of whose elements must have one type (docs/adr/0021-collections.md). */
  private elements(elements: Expression[], facts: Facts): Type {
    let element: Type = NOTHING;
    for (const expression of elements) {
      const type = this.value(expression, facts).type;
      if (type.kind === 'optional') {
        this.uncheckedOptional(type, expression.position);
        continue;
      }
      if (element.kind === 'nothing') element = type;
      else if (!this.assignable(type, element)) {
        if (this.assignable(element, type)) element = type;
        else {
          this.report(
            error('type-mismatch', `A collection's elements must all have one type, but this is ${describe(type)} and an earlier one is ${describe(element)}.`, expression.position),
          );
        }
      }
    }
    return element;
  }

  private member(expression: Extract<Expression, { type: 'member' }>, facts: Facts): Type {
    // `Status.Open`: the enum is resolved, and the member checked, by the name resolver.
    const enumSymbol = expression.object.type === 'identifier' || expression.object.type === 'qualifiedIdentifier' ? this.references.get(expression.object) : undefined;
    if (enumSymbol?.typeKind === 'enum' && (expression.object.type !== 'identifier' || this.locals.get(expression.object) === undefined)) {
      return typeOfSymbol(enumSymbol);
    }
    const object = this.value(expression.object, facts).type;
    return this.memberOf(object, expression.property, expression.object.position);
  }

  /** The type of `object.name`. */
  private memberOf(object: Type, property: Identifier, position: Position): Type {
    const name = property.value;
    const missing = (owner: string): Type => {
      this.report(error('unknown-field', `${owner} has no field called ${name}.`, property.position));
      return UNCHECKED;
    };
    switch (object.kind) {
      case 'unchecked':
        return UNCHECKED;
      case 'model': {
        const field = this.shared.modelFields(object.declaration).get(name);
        return field === undefined ? missing(object.symbol.name) : field.type;
      }
      case 'anonymous':
        return object.fields.get(name) ?? missing('This object');
      case 'entity': {
        const field = this.shared.entityFields(object.symbol, object.declaration).get(name);
        return field ?? missing(`${object.symbol.name}, as exposed,`);
      }
      case 'map':
        // A map's type doesn't say which members it has (docs/adr/0021-collections.md).
        return optional(object.value);
      case 'subject':
        if (name === 'entityName') return TEXT;
        if (name === 'identityFields') return { kind: 'array', element: TEXT };
        this.report(error('unknown-field', `@subject has no field called ${name} until it is narrowed with \`@subject is <entity>\`.`, property.position));
        return UNCHECKED;
      case 'error':
        return this.errorMember(object, property);
      case 'optional':
        this.uncheckedOptional(object, position);
        return UNCHECKED;
      case 'unknown':
        this.report(error('unknown-value', "An UNKNOWN's fields can't be read. Narrow it with `instanceOf` first.", position));
        return UNCHECKED;
      default:
        this.report(error('no-fields', `${describe(object)} has no fields.`, property.position));
        return UNCHECKED;
    }
  }

  /** An error's only field is `data`, once it is narrowed to an error that has one (docs/adr/0023-error-handling.md). */
  private errorMember(object: Extract<Type, { kind: 'error' }>, property: Identifier): Type {
    if (property.value !== 'data') {
      this.report(error('unknown-field', `An error's only field is data. Use \`instanceOf\` to find out which error it is.`, property.position));
      return UNCHECKED;
    }
    if (object.symbol === undefined) {
      this.report(error('unknown-field', 'Only a specific error has data. Narrow it with `instanceOf` to the error first.', property.position));
      return UNCHECKED;
    }
    const data = object.declaration === undefined ? undefined : this.shared.dataModelOf(object.declaration);
    if (data === undefined) {
      this.report(error('unknown-field', `${object.symbol.name} has no data.`, property.position));
      return UNCHECKED;
    }
    return { kind: 'model', symbol: { kind: 'type', typeKind: 'model', name: data.name.value, module: object.symbol.module }, declaration: data };
  }

  private index(expression: Extract<Expression, { type: 'index' }>, facts: Facts): Type {
    const object = this.value(expression.object, facts).type;
    const index = this.value(expression.index, facts);
    switch (object.kind) {
      case 'unchecked':
        return UNCHECKED;
      case 'array':
        if (!this.assignable(index.type, NUMBER)) this.mismatch(index.type, NUMBER, expression.index.position, 'An index');
        return object.element.kind === 'nothing' ? UNCHECKED : optional(object.element);
      case 'map':
        this.interpolated(expression.index, facts);
        return object.value.kind === 'nothing' ? UNCHECKED : optional(object.value);
      case 'model':
      case 'anonymous':
      case 'entity': {
        const fields =
          object.kind === 'model'
            ? new Map([...this.shared.modelFields(object.declaration)].map(([name, field]) => [name, field.type]))
            : object.kind === 'entity'
              ? this.shared.entityFields(object.symbol, object.declaration)
              : object.fields;
        // A literal name works exactly like `.name` (docs/adr/0027-object-shapes.md).
        if (expression.index.type === 'string' && expression.index.parts.every((part) => part.type === 'text')) {
          const name = textOf(expression.index);
          const field = fields.get(name);
          if (field === undefined) {
            this.report(error('unknown-field', `${describe(object)} has no field called ${name}.`, expression.index.position));
            return UNCHECKED;
          }
          return field;
        }
        const types = [...fields.values()].map((type) => (type.kind === 'optional' ? type.inner : type));
        const first = types[0];
        return first !== undefined && types.every((type) => this.assignable(type, first) && this.assignable(first, type))
          ? optional(first)
          : optional(UNKNOWN);
      }
      case 'set':
        this.report(error('set-index', "A set's elements have no indexes, so they can't be reached with [ ].", expression.position));
        return UNCHECKED;
      case 'optional':
        this.uncheckedOptional(object, expression.object.position);
        return UNCHECKED;
      default:
        this.report(error('no-index', `${describe(object)} can't be indexed.`, expression.object.position));
        return UNCHECKED;
    }
  }

  private call(expression: Extract<Expression, { type: 'call' }>, facts: Facts): Type {
    const callee = expression.callee;
    const symbol = callee.type === 'identifier' || callee.type === 'qualifiedIdentifier' ? this.references.get(callee) : undefined;
    const action = symbol?.declaration;
    if (action?.type !== 'action') {
      // A standard library action, whose signature isn't written down yet, or a call the
      // name resolver has already reported.
      for (const argument of expression.arguments) this.value(argument.value, facts);
      if (symbol?.module === 'cant::Collections' && (symbol.name === 'add' || symbol.name === 'remove')) {
        this.navigationChange(expression, facts);
      }
      return UNCHECKED;
    }
    let converted = false;
    for (const [argument, parameter] of this.matchArguments(action, expression.arguments)) {
      if (parameter === undefined) this.value(argument.value, facts);
      else if (this.argument(argument.value, parameter.valueType, parameter.optional, facts, parameter.name.value)) converted = true;
    }
    // An argument converted to an enum when the program runs can fail, as part of the call's
    // result (docs/adr/0013-enums.md).
    return this.actionResult(action, converted ? [builtInError('InvalidEnumValue')] : []);
  }

  /**
   * `add` or `remove` on a to-many navigation field changes a relationship, so it is treated as
   * a statement that can raise CardinalityViolation (docs/adr/0035-entity-relationships.md).
   */
  private navigationChange(expression: Extract<Expression, { type: 'call' }>, facts: Facts): void {
    const set = expression.arguments.find((argument) => argument.name?.value === 'set') ?? expression.arguments[0];
    const target = set?.value;
    if (target?.type !== 'member') return;
    const object = this.peek(target.object, facts);
    if (object.kind === 'entity' && this.shared.navigationOf(object.symbol).has(target.property.value)) {
      this.requireRaised('CardinalityViolation', expression.position, this.ignoring, 'changing a relationship');
    }
  }

  /** Whether the expression being checked is under `ignore`. */
  private ignoring = false;

  /** Pair each argument with the parameter it is for, with the short forms of docs/adr/0020-action-parameters.md. */
  private matchArguments(action: ActionDeclaration, args: Argument[]): [Argument, Parameter | undefined][] {
    const byName = new Map(action.parameters.map((parameter) => [parameter.name.value, parameter]));
    const required = action.parameters.filter((parameter) => !parameter.optional);
    return args.map((argument) => {
      if (argument.name !== undefined) return [argument, byName.get(argument.name.value)];
      if (argument.value.type === 'identifier' && byName.has(argument.value.value)) return [argument, byName.get(argument.value.value)];
      if (args.length === 1 && required.length === 1) return [argument, required[0]];
      return [argument, undefined];
    });
  }

  private unary(expression: Extract<Expression, { type: 'unary' }>, facts: Facts): Type {
    if (expression.operator === 'ignore') {
      // `ignore` marks a potential error as not handled on purpose, but doesn't use the value.
      const ignoring = this.ignoring;
      this.ignoring = true;
      const operand = this.expression(expression.argument, facts).type;
      this.ignoring = ignoring;
      this.markHandled(expression.argument);
      if (operand.kind !== 'result' && operand.kind !== 'unchecked') {
        this.report(error('nothing-to-ignore', `\`ignore\` is for a value that may hold an error, but this is ${describe(operand)}.`, expression.argument.position));
      }
      return operand;
    }
    const operand = this.value(expression.argument, facts).type;
    switch (expression.operator) {
      case '!':
        if (!this.assignable(operand, BOOLEAN)) this.mismatch(operand, BOOLEAN, expression.argument.position, "`!`'s operand");
        return BOOLEAN;
      case '-':
        if (isBase(operand, 'DURATION')) return DURATION;
        if (!this.assignable(operand, NUMBER)) this.mismatch(operand, NUMBER, expression.argument.position, "`-`'s operand");
        return NUMBER;
      case 'isEmpty':
        if (operand.kind !== 'optional' && operand.kind !== 'unchecked') {
          this.report(error('not-optional', `\`isEmpty\` only applies to an optional, but this is ${describe(operand)}, which always has a value.`, expression.argument.position));
        }
        return BOOLEAN;
    }
  }

  private binary(expression: Extract<Expression, { type: 'binary' }>, facts: Facts): Type {
    const { operator } = expression;

    if (operator === 'and' || operator === 'or') {
      this.condition(expression.left, facts, `\`${operator}\`'s left operand`);
      // The right operand only runs when the left one didn't decide, so it gets that narrowing.
      const rightFacts = extend(facts, this.narrow(expression.left, operator === 'and', facts));
      this.condition(expression.right, rightFacts, `\`${operator}\`'s right operand`);
      return BOOLEAN;
    }

    // `orElse` doesn't use an optional's value unless it has one, but it does use a result.
    const left = this.value(expression.left, facts).type;
    const right = this.value(expression.right, facts).type;
    if (left.kind === 'unchecked' || right.kind === 'unchecked') {
      return operator === 'orElse' ? (right.kind === 'optional' ? right : UNCHECKED) : isComparison(operator) ? BOOLEAN : UNCHECKED;
    }

    if (operator === 'orElse') return this.orElse(expression, left, right);

    // Operators other than `orElse` use an optional's value, so it must be checked first.
    for (const [type, side] of [[left, expression.left], [right, expression.right]] as const) {
      if (type.kind === 'optional') {
        this.uncheckedOptional(type, side.position);
        return isComparison(operator) ? BOOLEAN : UNCHECKED;
      }
    }

    if (operator === '==' || operator === '!=') {
      if (!this.comparable(left, right)) {
        this.report(error('type-mismatch', `${describe(left)} and ${describe(right)} can't be compared: they have different types.`, expression.position));
      }
      return BOOLEAN;
    }
    if (operator === '<' || operator === '<=' || operator === '>' || operator === '>=') {
      const ordered = orderedType(left);
      if (ordered === undefined || orderedType(right) !== ordered) {
        this.report(
          error(
            'type-mismatch',
            ordered === undefined
              ? `${describe(left)} values can't be ordered. NUMBER, DATE_TIME, DURATION and TEXT can, and enums of them.`
              : `${describe(left)} and ${describe(right)} can't be ordered against each other.`,
            expression.position,
          ),
        );
      }
      return BOOLEAN;
    }
    if (operator === 'in') return this.inOperator(expression, left, right);
    return this.arithmetic(expression, left, right);
  }

  private orElse(expression: Extract<Expression, { type: 'binary' }>, left: Type, right: Type): Type {
    if (left.kind !== 'optional') {
      this.report(error('not-optional', `\`orElse\` needs an optional on its left, but this is ${describe(left)}, which always has a value.`, expression.left.position));
      return right;
    }
    const fallback = right.kind === 'optional' ? right.inner : right;
    if (!this.assignable(fallback, left.inner) && !this.assignable(left.inner, fallback)) {
      this.report(error('type-mismatch', `The fallback must be ${describe(left.inner)} or ${describe(left)}, but this is ${describe(right)}.`, expression.right.position));
    }
    // The result has the fallback's type (docs/adr/0016-handling-optional-values.md).
    return right.kind === 'optional' ? optional(left.inner) : this.assignable(left.inner, fallback) ? fallback : left.inner;
  }

  /** `==` and `!=` need operands of one type, except enums, compared by value, and UNKNOWN (docs/adr/0019-operators.md). */
  private comparable(left: Type, right: Type): boolean {
    if (left.kind === 'unknown' || right.kind === 'unknown') return true;
    if (left.kind === 'enum' && right.kind === 'enum') return left.valueType === right.valueType;
    if (left.kind === 'enum') return right.kind === 'base' && right.name === left.valueType;
    if (right.kind === 'enum') return left.kind === 'base' && left.name === right.valueType;
    if (left.kind === 'error' || right.kind === 'error') return false;
    return this.assignable(left, right) || this.assignable(right, left);
  }

  private inOperator(expression: Extract<Expression, { type: 'binary' }>, value: Type, collection: Type): Type {
    switch (collection.kind) {
      case 'array':
      case 'set':
        if (collection.element.kind !== 'nothing' && !this.comparable(value, collection.element)) {
          this.report(
            error('type-mismatch', `${describe(value)} can't be in ${describe(collection)}: its elements are ${describe(collection.element)}.`, expression.left.position),
          );
        }
        return BOOLEAN;
      case 'map':
        // `in` checks a map's member names, which can be any value that converts to text.
        this.interpolated(expression.left, NO_FACTS);
        return BOOLEAN;
      default:
        this.report(error('type-mismatch', `\`in\` needs an array, a map or a set on its right, but this is ${describe(collection)}.`, expression.right.position));
        return BOOLEAN;
    }
  }

  /** The arithmetic operators, on numbers, and on dates and durations (docs/adr/0019-operators.md, 0026). */
  private arithmetic(expression: Extract<Expression, { type: 'binary' }>, left: Type, right: Type): Type {
    const { operator } = expression;
    const is = (type: Type, name: 'NUMBER' | 'DATE_TIME' | 'DURATION'): boolean => isBase(type, name) || (type.kind === 'enum' && type.valueType === name);
    let type: Type | undefined;
    if (is(left, 'NUMBER') && is(right, 'NUMBER')) type = NUMBER;
    else if (operator === '+' && ((is(left, 'DATE_TIME') && is(right, 'DURATION')) || (is(left, 'DURATION') && is(right, 'DATE_TIME')))) type = DATE_TIME;
    else if (operator === '-' && is(left, 'DATE_TIME') && is(right, 'DURATION')) type = DATE_TIME;
    else if (operator === '-' && is(left, 'DATE_TIME') && is(right, 'DATE_TIME')) type = DURATION;
    else if ((operator === '+' || operator === '-') && is(left, 'DURATION') && is(right, 'DURATION')) type = DURATION;
    else if (operator === '*' && ((is(left, 'DURATION') && is(right, 'NUMBER')) || (is(left, 'NUMBER') && is(right, 'DURATION')))) type = DURATION;
    else if (operator === '/' && is(left, 'DURATION') && is(right, 'NUMBER')) type = DURATION;
    else if (operator === '/' && is(left, 'DURATION') && is(right, 'DURATION')) type = NUMBER;

    if (type === undefined) {
      const hint = operator === '+' && (isBase(left, 'TEXT') || isBase(right, 'TEXT')) ? ' `+` doesn\'t join text: interpolate instead, as in "${a}${b}".' : '';
      this.report(error('type-mismatch', `\`${operator}\` can't be used on ${describe(left)} and ${describe(right)}.${hint}`, expression.position));
      return UNCHECKED;
    }
    return operator === '/' || operator === '%' ? this.division(expression, type) : type;
  }

  /**
   * `/` and `%` raise DivisionByZero, and `%` FractionalModulo, unless the compiler can tell they
   * can't, from constant operands (docs/adr/0019-operators.md, 0023).
   */
  private division(expression: Extract<Expression, { type: 'binary' }>, type: Type): Type {
    const divisor = this.constantNumber(expression.right);
    if (divisor === 0) {
      this.report(error('division-by-zero', 'This divides by zero.', expression.right.position));
      return type;
    }
    const errors: ModuleSymbol[] = divisor === undefined ? [builtInError('DivisionByZero')] : [];
    if (expression.operator === '%') {
      const dividend = this.constantNumber(expression.left);
      const fractional = [dividend, divisor].some((value) => value !== undefined && !Number.isInteger(value));
      if (fractional) {
        this.report(error('fractional-modulo', '`%` only works on whole numbers.', expression.position));
      } else if (dividend === undefined || divisor === undefined) {
        errors.push(builtInError('FractionalModulo'));
      }
    }
    return result(type, errors);
  }

  /** The value of a `NUMBER` constant expression, if the compiler can work it out (docs/adr/0023-error-handling.md). */
  private constantNumber(expression: Expression, seen = new Set<ConstDeclaration>()): number | undefined {
    switch (expression.type) {
      case 'number':
        return expression.value;
      case 'unary': {
        if (expression.operator !== '-') return undefined;
        const value = this.constantNumber(expression.argument, seen);
        return value === undefined ? undefined : -value;
      }
      case 'binary': {
        const left = this.constantNumber(expression.left, seen);
        const right = this.constantNumber(expression.right, seen);
        if (left === undefined || right === undefined) return undefined;
        switch (expression.operator) {
          case '+':
            return left + right;
          case '-':
            return left - right;
          case '*':
            return left * right;
          case '/':
            return right === 0 ? undefined : left / right;
          case '%':
            return right === 0 ? undefined : ((left % right) + right) % right;
          case '**':
            return left ** right;
          default:
            return undefined;
        }
      }
      case 'identifier': {
        const local = this.locals.get(expression);
        if (local !== undefined) return this.constantValues.get(local.declaration);
        const symbol = this.references.get(expression);
        return symbol?.declaration?.type === 'const' ? this.constantOf(symbol.declaration, seen) : undefined;
      }
      case 'qualifiedIdentifier': {
        const symbol = this.references.get(expression);
        return symbol?.declaration?.type === 'const' ? this.constantOf(symbol.declaration, seen) : undefined;
      }
      default:
        return undefined;
    }
  }

  private constantOf(constant: ConstDeclaration, seen: Set<ConstDeclaration>): number | undefined {
    if (seen.has(constant)) return undefined;
    seen.add(constant);
    return this.constantNumber(constant.value, seen);
  }

  /** The group in `within` must be a group entity (docs/adr/0010-security.md). */
  private group(expression: Expression, facts: Facts): void {
    const type = this.value(expression, facts).type;
    if (type.kind === 'unchecked') return;
    if (type.kind === 'optional') {
      this.uncheckedOptional(type, expression.position);
      return;
    }
    if (type.kind !== 'entity' || !type.declaration.lines.some((line) => line.type === 'groupLine')) {
      this.report(error('not-a-group', `\`within\` needs a group entity, but this is ${describe(type)}.`, expression.position));
    }
  }

  // ----- Narrowing: docs/adr/0016-handling-optional-values.md, 0023, 0033, 0010 -----

  /** The type a name has now, without checking the expression again. */
  private peek(expression: Expression, facts: Facts): Type {
    const key = this.key(expression);
    if (key === undefined) return UNCHECKED;
    if (typeof key === 'string') return facts.get(key) ?? UNCHECKED;
    const type = facts.get(key) ?? this.bindings.get(key) ?? UNCHECKED;
    return type.kind === 'result' ? type.value : type;
  }

  /** The type a key has now: a local's binding, or a built-in's. */
  private typeOfKey(key: Identifier | string, facts: Facts): Type {
    const known = facts.get(key);
    if (known !== undefined) return known;
    if (typeof key !== 'string') return this.bindings.get(key) ?? UNCHECKED;
    return UNCHECKED;
  }

  /** Record which errors an `instanceOf` checks a held result for. */
  private recordCheck(expression: Extract<Expression, { type: 'instanceOf' }>): void {
    if (expression.value.type !== 'identifier') return;
    const declaration = this.locals.get(expression.value)?.declaration;
    const held = declaration === undefined ? undefined : this.held.get(declaration);
    if (held === undefined) return;
    if (expression.target.type === 'errorType') {
      held.handled = true;
      return;
    }
    const symbol = expression.target.type === 'identifier' || expression.target.type === 'qualifiedIdentifier' ? this.references.get(expression.target) : undefined;
    if (symbol?.typeKind === 'error') held.checked.add(symbolKey(symbol));
  }

  /** What a condition being `truth` says about the names in it. */
  private narrow(condition: Expression, truth: boolean, facts: Facts): Facts {
    switch (condition.type) {
      case 'unary': {
        if (condition.operator === '!') return this.narrow(condition.argument, !truth, facts);
        if (condition.operator !== 'isEmpty') return NO_FACTS;
        const key = this.key(condition.argument);
        if (key === undefined || truth) return NO_FACTS;
        const type = key === '@error' ? this.typeOfKeyOrBuiltIn(key, condition.argument, facts) : this.typeOfKey(key, facts);
        return type.kind === 'optional' ? new Map([[key, type.inner]]) : NO_FACTS;
      }
      case 'binary': {
        if (condition.operator === 'and' && truth) {
          const left = this.narrow(condition.left, true, facts);
          return extend(left, this.narrow(condition.right, true, extend(facts, left)));
        }
        if (condition.operator === 'or' && !truth) {
          const left = this.narrow(condition.left, false, facts);
          return extend(left, this.narrow(condition.right, false, extend(facts, left)));
        }
        return NO_FACTS;
      }
      case 'instanceOf':
        return this.narrowInstanceOf(condition, truth, facts);
      case 'isPredicate': {
        if (!truth || condition.subjectType.type !== 'identifier') return NO_FACTS;
        const symbol = this.references.get(condition.subjectType);
        return symbol === undefined ? NO_FACTS : new Map([['@subject', typeOfSymbol(symbol)]]);
      }
      default:
        return NO_FACTS;
    }
  }

  private typeOfKeyOrBuiltIn(key: string, expression: Expression, facts: Facts): Type {
    const known = facts.get(key);
    if (known !== undefined) return known;
    return expression.type === 'builtIn' ? this.builtInType(expression, true) : UNCHECKED;
  }

  /**
   * `instanceOf` narrows a value to the type it tests when it is `true`. On a result, or an
   * error, it also narrows when it is `false`: the error it tests is ruled out, and once every
   * error is, a result is narrowed to its value (docs/adr/0023-error-handling.md, 0033).
   */
  private narrowInstanceOf(condition: Extract<Expression, { type: 'instanceOf' }>, truth: boolean, facts: Facts): Facts {
    const key = this.key(condition.value);
    if (key === undefined) return NO_FACTS;
    const current = typeof key === 'string' && condition.value.type === 'builtIn' ? this.typeOfKeyOrBuiltIn(key, condition.value, facts) : this.typeOfKey(key, facts);

    const target: Type =
      condition.target.type === 'errorType' ? { kind: 'error' } : typeOf(condition.target, this.references);

    if (target.kind === 'error') {
      const errors =
        current.kind === 'result' ? current.errors : current.kind === 'error' && current.symbol === undefined ? (current.among ?? []) : current.kind === 'error' ? [current.symbol].filter((symbol) => symbol !== undefined) : [];
      const anyError = current.kind === 'result' ? current.anyError : current.kind === 'error' && current.symbol === undefined && current.among === undefined;
      if (current.kind !== 'result' && current.kind !== 'error') return NO_FACTS;
      if (truth) {
        if (target.symbol === undefined) return new Map<Identifier | string, Type>([[key, anyError ? { kind: 'error' } : { kind: 'error', among: errors }]]);
        return new Map([[key, target]]);
      }
      // `false`: the tested error is ruled out, or every error, for `ERROR`.
      if (current.kind !== 'result') return NO_FACTS;
      if (target.symbol === undefined) return new Map([[key, current.value]]);
      const symbol = target.symbol;
      const left = errors.filter((other) => !sameSymbol(other, symbol));
      return new Map([[key, result(current.value, left, anyError)]]);
    }

    if (!truth) return NO_FACTS;
    return new Map([[key, condition.optional ? optional(target) : target]]);
  }

  /** The key narrowing records a name under: its declaration, for a local, or `@name`. */
  private key(expression: Expression): Identifier | string | undefined {
    if (expression.type === 'builtIn') return `@${expression.name}`;
    if (expression.type === 'identifier') return this.locals.get(expression)?.declaration;
    return undefined;
  }
}

type Parameter = ActionDeclaration['parameters'][number];

const isComparison = (operator: string): boolean => ['==', '!=', '<', '<=', '>', '>=', 'in'].includes(operator);

/** The type a value is ordered as, if it can be ordered (docs/adr/0019-operators.md). */
function orderedType(type: Type): string | undefined {
  const name = type.kind === 'base' ? type.name : type.kind === 'enum' ? type.valueType : undefined;
  return name === 'NUMBER' || name === 'DATE_TIME' || name === 'DURATION' || name === 'TEXT' ? name : undefined;
}

const textOf = (literal: { parts: { type: string; value?: unknown }[] }): string =>
  literal.parts.map((part) => (part.type === 'text' && typeof part.value === 'string' ? part.value : '')).join('');

/** Whether a loop body can `break` out of its own loop. */
function breaks(statements: Statement[]): boolean {
  return statements.some((statement) => {
    if (statement.type === 'break') return true;
    if (statement.type === 'if') return statement.children.some((branch) => (branch.type === 'if' ? breaks([branch]) : breaks(branch.children)));
    return false;
  });
}
