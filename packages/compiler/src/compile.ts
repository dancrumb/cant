import { createHash } from 'node:crypto';
import { dirname, relative, resolve, sep } from 'node:path';
import {
  COMPILED_FORMAT,
  type ActionDeclaration,
  type BaseValue,
  type CompiledAction,
  type CompiledEntity,
  type CompiledExpression,
  type CompiledField,
  type CompiledProgram,
  type CompiledRelation,
  type CompiledStatement,
  type CompiledTarget,
  type CompiledTrigger,
  type CompiledTypeRef,
  type EntityDeclaration,
  type Expression,
  type Field,
  type Identifier,
  type ObjectInstance,
  type Parameter,
  type RelationDeclaration,
  type SourceMap,
  type SourcePosition,
  type Statement,
  type TriggerDeclaration,
  type TypeRef,
  type Value,
} from '@dancrumb/cant-shared';
import type { Position } from 'unist';
import type { LocalBinding } from './bodies.ts';
import type { Diagnostic } from './diagnostic.ts';
import { ConstantValues } from './evaluate.ts';
import { fileSystemHost, type Host } from './host.ts';
import { symbolOf, type Module, type ModuleSymbol } from './modules.ts';
import { checkProgram, type CheckedProgram } from './program.ts';
import { isStandardPath, STANDARD_LIBRARY } from './stdlib.ts';
import { typeOf, type Type } from './types.ts';

export type CompileResult = { program: CompiledProgram; sourceMap: SourceMap; root: string } | { diagnostics: Diagnostic[] };

/**
 * Compile a program, starting from its entry module: check it, and if it has no compile-time
 * errors, give the compiled program the interpreter runs, and its source map
 * (docs/adr/0039-compiled-programs.md). Otherwise, give the diagnostics that stopped it.
 */
export function compile(entry: string, host: Host = fileSystemHost): CompileResult {
  const checked = checkProgram(entry, host);
  if (checked.diagnostics.length > 0) return { diagnostics: checked.diagnostics };
  return new Compiler(checked).compile();
}

/** The program's root: the directory that holds its `cant.json`, or the entry module's directory. */
export const rootOf = (program: CheckedProgram): string => dirname(program.manifest?.path ?? program.entry);

const keyOf = (symbol: ModuleSymbol): string => `${symbol.module}::${symbol.name}`;

/** The locals of one action or trigger, each given a slot. */
class Frame {
  readonly slots = new Map<Identifier, number>();

  slot(declaration: Identifier): number {
    let slot = this.slots.get(declaration);
    if (slot === undefined) {
      slot = this.slots.size;
      this.slots.set(declaration, slot);
    }
    return slot;
  }
}

class Compiler {
  private readonly checked: CheckedProgram;
  private readonly root: string;
  private readonly values: ConstantValues;
  private readonly relationIndexes = new Map<RelationDeclaration, number>();
  /** The module whose code is being compiled. */
  private module!: Module;

  constructor(checked: CheckedProgram) {
    this.checked = checked;
    this.root = rootOf(checked);
    this.values = new ConstantValues(checked.references, (symbol) => this.symbolId(symbol));
  }

  // ----- Names -----

  private moduleId(path: string): string {
    if (path.startsWith('cant::')) return path;
    return relative(this.root, path).split(sep).join('/');
  }

  private symbolId(symbol: ModuleSymbol): string {
    return `${this.moduleId(symbol.module)}#${symbol.name}`;
  }

  private position(position: Position): SourcePosition {
    return {
      module: this.moduleId(this.module.path),
      start: { line: position.start.line, column: position.start.column },
      end: { line: position.end.line, column: position.end.column },
    };
  }

  // ----- The program -----

  compile(): { program: CompiledProgram; sourceMap: SourceMap; root: string } {
    const program: CompiledProgram = {
      format: COMPILED_FORMAT,
      build: '',
      entry: this.moduleId(this.checked.entry),
      types: {},
      actions: {},
      constants: {},
      relations: [],
      permissions: [],
      triggers: [],
    };

    // Relations first, so entities can name the relation that adds each navigation field.
    for (const module of this.checked.modules.values()) {
      this.module = module;
      for (const declaration of module.program?.children ?? []) {
        if (declaration.type !== 'relation') continue;
        this.relationIndexes.set(declaration, program.relations.length);
        program.relations.push(this.relation(declaration));
      }
    }

    for (const module of this.checked.modules.values()) {
      this.module = module;
      for (const declaration of module.program?.children ?? []) {
        switch (declaration.type) {
          case 'enumDeclaration':
            program.types[this.idOfDeclaration(declaration.name)] = {
              kind: 'enum',
              members: declaration.members.map((member) => [member.name.value, member.value === undefined ? { kind: 'text', value: member.name.value } : this.base(member.value)]),
            };
            break;
          case 'model':
            program.types[this.idOfDeclaration(declaration.name)] = { kind: 'model', ...this.fields(declaration.fields) };
            break;
          case 'errorDeclaration':
            program.types[this.idOfDeclaration(declaration.name)] = {
              kind: 'error',
              ...(declaration.data !== undefined && {
                data: Array.isArray(declaration.data) ? this.fields(declaration.data) : { model: this.reference(declaration.data) },
              }),
            };
            break;
          case 'entity':
            program.types[this.idOfDeclaration(declaration.name)] = this.entity(declaration);
            break;
          case 'action':
            program.actions[this.idOfDeclaration(declaration.name)] = this.action(declaration);
            break;
          case 'const': {
            const result = this.values.of(declaration);
            if (result.kind === 'value') {
              const type = declaration.valueType === undefined ? undefined : this.checkedType(declaration.valueType);
              program.constants[this.idOfDeclaration(declaration.name)] = type === undefined ? result.value : this.convertValue(result.value, type);
            }
            break;
          }
          case 'permissions':
            program.permissions.push({
              group: declaration.group.value,
              ...(declaration.role !== undefined && { role: declaration.role.value }),
              permissions: declaration.permissions.map((permission) => this.text(permission)),
            });
            break;
          case 'trigger':
            // Only the entry module's triggers take effect (docs/adr/0006-imports.md).
            if (module.path === this.checked.entry) program.triggers.push(this.trigger(declaration));
            break;
          default:
            break;
        }
      }
    }

    this.standardLibrary(program);

    program.build = createHash('sha256').update(JSON.stringify(program)).digest('hex').slice(0, 16);
    const sources: Record<string, string> = {};
    for (const module of this.checked.modules.values()) sources[this.moduleId(module.path)] = module.source;
    return { program, sourceMap: { format: COMPILED_FORMAT, build: program.build, sources }, root: this.root };
  }

  /**
   * The standard library modules' actions and errors, which the interpreter provides. `cant::Errors`
   * is always included, since the interpreter raises its errors whether or not it is imported.
   */
  private standardLibrary(program: CompiledProgram): void {
    const modules = new Set(['Errors']);
    for (const module of this.checked.modules.values()) {
      for (const target of module.imports.values()) if (target.kind === 'standard') modules.add(target.name);
    }
    for (const name of modules) {
      for (const [member, kind] of STANDARD_LIBRARY.get(name) ?? []) {
        const id = `cant::${name}#${member}`;
        if (kind === 'error') program.types[id] = { kind: 'error' };
        else {
          program.actions[id] = {
            parameters: [],
            returns: { kind: 'unknown' },
            optional: false,
            raises: [],
            passes: [],
            defaultOrder: [],
            implementation: { kind: 'standard' },
          };
        }
      }
    }
  }

  private idOfDeclaration(name: Identifier): string {
    return `${this.moduleId(this.module.path)}#${name.value}`;
  }

  /** The symbol ID a name in a declaration refers to. */
  private reference(name: Expression | TypeRef): string {
    const symbol = name.type === 'identifier' || name.type === 'qualifiedIdentifier' ? this.checked.references.get(name) : undefined;
    if (symbol === undefined) throw new Error(`The compiler couldn't resolve a name at ${this.where(name.position)}.`);
    return this.symbolId(symbol);
  }

  private where(position: Position): string {
    return `${this.module.path}:${String(position.start.line)}:${String(position.start.column)}`;
  }

  // ----- Types -----

  /** The compiler's type for a type written in the program. */
  private checkedType(ref: TypeRef): Type {
    return typeOf(ref, this.checked.references);
  }

  private typeRef(ref: TypeRef): CompiledTypeRef {
    switch (ref.type) {
      case 'baseType':
        return { kind: 'base', name: ref.name };
      case 'unknownType':
        return { kind: 'unknown' };
      case 'enum':
        return { kind: 'enum', values: ref.values.map((value) => this.base(value)) };
      case 'arrayType':
        return { kind: 'array', element: this.typeRef(ref.elementType) };
      case 'setType':
        return { kind: 'set', element: this.typeRef(ref.elementType) };
      case 'mapType':
        return { kind: 'map', value: this.typeRef(ref.valueType) };
      case 'identifier':
      case 'qualifiedIdentifier': {
        // An internal type of the standard library has no declaration to name (docs/adr/0042-io.md).
        if (this.checked.references.get(ref)?.typeKind === 'internal') return this.fromType(this.checkedType(ref));
        return { kind: 'named', symbol: this.reference(ref) };
      }
    }
  }

  /** A type the type checker worked out, as a compiled program writes it. */
  private fromType(type: Type): CompiledTypeRef {
    switch (type.kind) {
      case 'base':
        return { kind: 'base', name: type.name };
      case 'unknown':
      case 'unchecked':
        return { kind: 'unknown' };
      case 'void':
      case 'nothing':
        return { kind: 'nothing' };
      case 'enum':
        if (type.symbol !== undefined) return { kind: 'named', symbol: this.symbolId(type.symbol) };
        return { kind: 'enum', values: [...type.values].map(baseFromKey) };
      case 'array':
      case 'set':
        return { kind: type.kind, element: this.fromType(type.element) };
      case 'map':
        return { kind: 'map', value: this.fromType(type.value) };
      case 'model':
      case 'entity':
        return { kind: 'named', symbol: this.symbolId(type.symbol) };
      case 'anonymous':
        return { kind: 'object', fields: Object.fromEntries([...type.fields].map(([name, field]) => [name, this.fromType(field)])) };
      case 'error':
        return type.symbol === undefined ? { kind: 'anyError' } : { kind: 'named', symbol: this.symbolId(type.symbol) };
      case 'result':
        return this.fromType(type.value);
      case 'optional':
        return { kind: 'optional', inner: this.fromType(type.inner) };
      case 'subject':
        return { kind: 'subject' };
      case 'stream':
        return { kind: 'stream', direction: type.direction, ...(type.file && { file: true }) };
    }
  }

  /** A literal's value, as an enum member's value or an inline enum's. */
  private base(value: Expression): BaseValue {
    const result = this.values.value(value);
    if (result === undefined || result.kind === 'enum' || result.kind === 'object') {
      throw new Error(`The compiler couldn't work out a value at ${this.where(value.position)}.`);
    }
    return result;
  }

  private text(value: Expression): string {
    const result = this.values.value(value);
    return result?.kind === 'text' ? result.value : '';
  }

  // ----- Declarations -----

  private fields(fields: Field[]): { fields: CompiledField[]; defaultOrder: number[] } {
    const frame = new Frame();
    return {
      fields: fields.map((field) => ({
        name: field.name.value,
        type: this.typeRef(field.valueType),
        optional: field.optional,
        ...(field.defaultValue !== undefined && { default: this.expression(field.defaultValue, frame) }),
      })),
      defaultOrder: this.defaultOrder(fields, 'field'),
    };
  }

  /**
   * The order to work out defaults in, so that each default is worked out after the ones it
   * uses. Defaults that depend on each other in a cycle have already been reported.
   */
  private defaultOrder(items: (Field | Parameter)[], kind: LocalBinding['kind']): number[] {
    const indexes = new Map(items.map((item, index) => [item.name, index]));
    const order: number[] = [];
    const done = new Set<number>();
    const visit = (index: number): void => {
      if (done.has(index)) return;
      done.add(index);
      const item = items[index];
      if (item?.defaultValue === undefined) return;
      walk(item.defaultValue, (node) => {
        if (node.type !== 'identifier') return;
        const binding = this.checked.locals.get(node as Identifier);
        const used = binding?.kind === kind ? indexes.get(binding.declaration) : undefined;
        if (used !== undefined) visit(used);
      });
      order.push(index);
    };
    items.forEach((item, index) => {
      if (item.defaultValue !== undefined) visit(index);
    });
    return order;
  }

  private action(action: ActionDeclaration): CompiledAction {
    const frame = new Frame();
    for (const parameter of action.parameters) frame.slot(parameter.name);
    const parameters = action.parameters.map((parameter) => ({
      name: parameter.name.value,
      type: this.typeRef(parameter.valueType),
      optional: parameter.optional,
      ...(parameter.defaultValue !== undefined && { default: this.expression(parameter.defaultValue, frame) }),
    }));
    const passes = action.passes.some((name) => name.type === 'builtIn')
      ? ('all' as const)
      : action.passes.flatMap((name) => (name.type === 'builtIn' ? [] : [this.reference(name)]));

    let implementation: CompiledAction['implementation'];
    if (action.native === undefined) {
      const body = this.block(action.children, frame);
      implementation = { kind: 'body', locals: frame.slots.size, body };
    } else if (isStandardPath(this.module.path)) {
      // The interpreter provides the standard library's implementations itself.
      implementation = { kind: 'standard' };
    } else {
      // The native module, relative to the program's root (docs/adr/0036-native-modules.md).
      const path = resolve(dirname(this.module.path), this.text(action.native));
      implementation = { kind: 'native', module: this.moduleId(path) };
    }

    return {
      parameters,
      returns: action.returnType.type === 'voidType' ? { kind: 'void' } : this.typeRef(action.returnType),
      optional: action.optional,
      raises: action.raises.map((name) => this.reference(name)),
      passes,
      defaultOrder: this.defaultOrder(action.parameters, 'parameter'),
      implementation,
      position: this.position(action.position),
    };
  }

  private entity(entity: EntityDeclaration): CompiledEntity {
    const symbol = symbolOf(this.module.path, entity);
    const modelName = entity.lines.find((line) => line.type === 'modelsBlock')?.models[0];
    const modelSymbol = modelName === undefined ? undefined : this.checked.references.get(modelName);
    const model = modelSymbol?.declaration?.type === 'model' ? modelSymbol.declaration : undefined;
    const modelFields = model?.fields.map((field) => field.name.value) ?? [];

    // `expose` and `hide`, with `@all` and renaming (docs/adr/0022-entities.md).
    const exposed = new Map<string, string>();
    const items = entity.lines.filter((line) => line.type === 'exposeBlock').flatMap((line) => line.items);
    const hidden = new Set(
      entity.lines.filter((line) => line.type === 'hideBlock').flatMap((line) => line.items.flatMap((item) => (item.type === 'identifier' ? [item.value] : []))),
    );
    if (items.some((item) => item.type === 'builtIn')) {
      for (const name of modelFields) if (!hidden.has(name)) exposed.set(name, name);
    }
    for (const item of items) {
      if (item.type === 'builtIn') continue;
      if (item.as !== undefined) exposed.delete(item.field.value);
      exposed.set(item.as?.value ?? item.field.value, item.field.value);
    }

    const navigation: CompiledEntity['navigation'] = {};
    for (const [name, field] of this.checked.navigation.get(keyOf(symbol)) ?? []) {
      const { relation } = field;
      const leftIsThis = relation.left.field.value === name && this.checked.references.get(relation.left.entity)?.name === entity.name.value;
      navigation[name] = {
        entity: this.symbolId(field.far),
        cardinality: field.farCardinality,
        inverse: (leftIsThis ? relation.right.field : relation.left.field).value,
        relation: this.relationIndexes.get(relation) ?? -1,
      };
    }

    const identityLine = entity.lines.find((line) => line.type === 'identityLine');
    const group = entity.lines.find((line) => line.type === 'groupLine');
    const membership = entity.lines.find((line) => line.type === 'membershipLine');
    return {
      kind: 'entity',
      model: modelSymbol === undefined ? '' : this.symbolId(modelSymbol),
      exposed: Object.fromEntries(exposed),
      identity: (identityLine?.fields ?? []).map((field) => (field.value in navigation ? { navigation: field.value } : { field: field.value })),
      navigation,
      subject: entity.lines.some((line) => line.type === 'subjectLine'),
      ...(group !== undefined && {
        group: { kind: group.name.value, roles: entity.lines.flatMap((line) => (line.type === 'roleLine' ? [line.name.value] : [])) },
      }),
      ...(membership !== undefined && {
        membership: { member: membership.member.value, group: membership.group.value, ...(membership.roles !== undefined && { roles: membership.roles.value }) },
      }),
    };
  }

  private relation(relation: RelationDeclaration): CompiledRelation {
    const end = (side: RelationDeclaration['left']): CompiledRelation['left'] => ({
      entity: this.reference(side.entity),
      field: side.field.value,
      cardinality: side.cardinality,
    });
    return { left: end(relation.left), right: end(relation.right) };
  }

  private trigger(trigger: TriggerDeclaration): CompiledTrigger {
    const frame = new Frame();
    const parameters: Record<string, Value> = {};
    let subject: CompiledTrigger['subject'];
    for (const parameter of trigger.parameters ?? []) {
      if (trigger.source.value === 'TestCase' && parameter.name.value === 'subject' && parameter.value.type === 'object') {
        subject = this.testSubject(parameter.value);
        continue;
      }
      const value = this.values.value(parameter.value);
      if (value !== undefined) parameters[parameter.name.value] = value;
    }
    const args: Record<string, CompiledExpression> = {};
    for (const argument of trigger.arguments ?? []) args[argument.name.value] = this.expression(argument.value, frame);
    return {
      action: this.reference(trigger.action),
      source: trigger.source.value,
      parameters,
      ...(subject !== undefined && { subject }),
      arguments: args,
      ...(trigger.auth !== undefined && { auth: this.expression(trigger.auth, frame) }),
      assertions: (trigger.assertions ?? []).map((assertion) => ({
        test: this.expression(assertion.test, frame),
        message: this.expression(assertion.message, frame),
      })),
      position: this.position(trigger.position),
    };
  }

  /** A test case's subject: the entity its `@entity` names, and its fields as an object of the entity's model. */
  private testSubject(value: Extract<Expression, { type: 'object' }>): CompiledTrigger['subject'] {
    const entityName = value.items.find((item) => item.name.type === 'builtIn' && item.name.name === 'entity')?.value;
    const entity = entityName === undefined ? undefined : this.checked.references.get(entityName as Identifier);
    const declaration = entity?.declaration;
    if (entity === undefined || declaration?.type !== 'entity') return undefined;
    const modelName = declaration.lines.find((line) => line.type === 'modelsBlock')?.models[0];
    const model = modelName === undefined ? undefined : this.checked.references.get(modelName);
    const fields = this.values.value(value);
    if (fields === undefined || model?.declaration?.type !== 'model') return undefined;
    return { entity: this.symbolId(entity), fields: this.convertValue(fields, { kind: 'model', symbol: model, declaration: model.declaration }) };
  }

  /**
   * A constant value, given where `type` is expected: a base value given for an enum becomes the
   * enum's member, and an object given for a model becomes an object of the model, with its
   * defaults filled in where the compiler can work them out.
   */
  private convertValue(value: Value, type: Type): Value {
    if (type.kind === 'enum' && type.symbol !== undefined && value.kind !== 'enum' && value.kind !== 'object') {
      return { kind: 'enum', enum: this.symbolId(type.symbol), value };
    }
    if (type.kind === 'model' && value.kind === 'object') {
      const declaration = type.declaration;
      const given = new Map(value.members);
      const known = new Map<Identifier, Value>();
      const members: [string, Value][] = [];
      for (const field of declaration.fields) {
        const member = given.get(field.name.value);
        if (member !== undefined) known.set(field.name, this.convertValue(member, this.checkedType(field.valueType)));
      }
      for (const index of this.defaultOrder(declaration.fields, 'field')) {
        const field = declaration.fields[index];
        if (field?.defaultValue === undefined || given.has(field.name.value)) continue;
        const defaulted = this.values.value(field.defaultValue, this.checked.locals, known);
        if (defaulted !== undefined) known.set(field.name, defaulted);
      }
      for (const field of declaration.fields) {
        const member = known.get(field.name);
        if (member !== undefined) members.push([field.name.value, member]);
      }
      const object: ObjectInstance = { kind: 'object', model: this.symbolId(type.symbol), members };
      return object;
    }
    return value;
  }

  // ----- Code -----

  private block(statements: Statement[], frame: Frame): CompiledStatement[] {
    return statements.map((statement) => this.statement(statement, frame, false));
  }

  private statement(statement: Statement, frame: Frame, ignored: boolean): CompiledStatement {
    const position = this.position(statement.position);
    switch (statement.type) {
      case 'expressionStatement':
        return { type: 'expression', expression: this.expression(statement.expression, frame), position };
      case 'assignment':
        if (statement.target.type === 'identifier') {
          return { type: 'let', slot: frame.slot(statement.target), value: this.expression(statement.value, frame), position };
        }
        return { type: 'assign', target: this.target(statement.target, frame), value: this.expression(statement.value, frame), ignored, position };
      case 'delete':
        return { type: 'delete', target: this.target(statement.target, frame), ignored, position };
      case 'ignoredStatement':
        return this.statement(statement.statement, frame, true);
      case 'return': {
        const argument = statement.argument;
        if (argument === undefined) return { type: 'return', position };
        if (argument.type === 'nothing') return { type: 'return', value: { type: 'nothing' }, position };
        return { type: 'return', value: this.expression(argument, frame), position };
      }
      case 'raise': {
        const error = this.reference(statement.error);
        if (statement.data !== undefined) return { type: 'raise', error, data: this.expression(statement.data, frame), position };
        if (statement.arguments === undefined) return { type: 'raise', error, position };
        // The data's fields, which the interpreter makes into the error's data, filling in defaults.
        const members: [string, CompiledExpression][] = statement.arguments.map((argument) => [
          argument.name?.value ?? (argument.value.type === 'identifier' ? argument.value.value : ''),
          this.expression(argument.value, frame),
        ]);
        return { type: 'raise', error, data: { type: 'object', members, position }, position };
      }
      case 'pass':
        return { type: 'pass', value: this.expression(statement.argument, frame), position };
      case 'assert':
        return {
          type: 'assert',
          test: this.expression(statement.test, frame),
          ...(statement.message !== undefined && { message: this.expression(statement.message, frame) }),
          position,
        };
      case 'break':
        return { type: 'break', position };
      case 'continue':
        return { type: 'continue', position };
      case 'for':
        return {
          type: 'for',
          slot: frame.slot(statement.variable),
          iterable: this.expression(statement.iterable, frame),
          body: this.block(statement.children, frame),
          position,
        };
      case 'while':
        return { type: 'while', test: this.expression(statement.test, frame), body: this.block(statement.children, frame), position };
      case 'if': {
        const [consequent, alternate] = statement.children;
        return {
          type: 'if',
          test: this.expression(statement.test, frame),
          then: this.block(consequent.children, frame),
          ...(alternate !== undefined && {
            else: alternate.type === 'if' ? [this.statement(alternate, frame, false)] : this.block(alternate.children, frame),
          }),
          position,
        };
      }
    }
  }

  private target(target: Extract<Expression, { type: 'member' | 'index' }>, frame: Frame): CompiledTarget {
    const position = this.position(target.position);
    return target.type === 'member'
      ? { type: 'member', object: this.expression(target.object, frame), name: target.property.value, position }
      : { type: 'index', object: this.expression(target.object, frame), index: this.expression(target.index, frame), position };
  }

  /**
   * An expression, given where `expected` is expected: what the type checker recorded for it, if
   * nothing else is given. Values given for a model, a map, an enum or a collection are shaped
   * by it, and a result used unchecked is unwrapped (docs/adr/0039-compiled-programs.md).
   */
  private expression(expression: Expression, frame: Frame, expected = this.checked.types.expected.get(expression)): CompiledExpression {
    const position = this.position(expression.position);
    const target = expected?.kind === 'optional' ? expected.inner : expected;

    // Object and collection values take their shape from where they are given.
    if (target !== undefined && expression.type === 'object' && (target.kind === 'model' || target.kind === 'map')) {
      const fields = target.kind === 'model' ? this.checked.types.modelFields(target.declaration) : undefined;
      const members = this.members(expression, frame, (name) => {
        if (target.kind === 'map') return target.value;
        const field = fields?.get(name)?.type;
        return field?.kind === 'optional' ? field.inner : field;
      });
      return target.kind === 'model'
        ? { type: 'construct', model: this.symbolId(target.symbol), value: { type: 'object', members, position }, position }
        : { type: 'map', value: this.fromType(target.value), members, position };
    }
    if (target !== undefined && (expression.type === 'array' || expression.type === 'set') && target.kind === expression.type) {
      return {
        type: expression.type,
        element: this.fromType(target.element),
        elements: expression.elements.map((element) => this.expression(element, frame, target.element)),
        position,
      };
    }

    let node = this.plain(expression, frame);
    if (this.checked.types.unwrapped.has(expression)) node = { type: 'unwrap', value: node, position };
    if (target === undefined) return node;

    let from = this.checked.types.types.get(expression);
    if (from?.kind === 'result') from = from.value;
    if (from?.kind === 'optional') from = from.inner;
    if (from === undefined) return node;

    // A value of an enum's value type, given for the enum (docs/adr/0013-enums.md).
    if (target.kind === 'enum' && from.kind === 'base') {
      const enumType = this.fromType(target);
      if (node.type === 'value' && node.value.kind !== 'enum' && node.value.kind !== 'object') {
        return enumType.kind === 'named' ? { type: 'value', value: { kind: 'enum', enum: enumType.symbol, value: node.value }, position } : node;
      }
      return { type: 'toEnum', enum: enumType, value: node, position };
    }
    if (target.kind === 'model' && from.kind === 'anonymous') return { type: 'construct', model: this.symbolId(target.symbol), value: node, position };
    if (target.kind === 'map' && from.kind === 'anonymous') return { type: 'toMap', value: node, position };
    return node;
  }

  /** An object value's members, each given where its field's type is expected. */
  private members(expression: Extract<Expression, { type: 'object' }>, frame: Frame, expected: (name: string) => Type | undefined): [string, CompiledExpression][] {
    const members: [string, CompiledExpression][] = [];
    for (const item of expression.items) {
      if (item.name.type === 'builtIn') continue;
      const name = item.name.type === 'identifier' ? item.name.value : this.text(item.name);
      members.push([name, this.expression(item.value, frame, expected(name))]);
    }
    return members;
  }

  /** An expression as it is written, before anything its type decides. */
  private plain(expression: Expression, frame: Frame): CompiledExpression {
    const position = this.position(expression.position);
    switch (expression.type) {
      case 'number':
      case 'boolean':
      case 'dateTime':
      case 'duration':
        return { type: 'value', value: this.base(expression), position };
      case 'string':
        if (expression.parts.every((part) => part.type === 'text')) return { type: 'value', value: { kind: 'text', value: this.text(expression) }, position };
        return {
          type: 'template',
          parts: expression.parts.map((part) => (part.type === 'text' ? part.value : this.expression(part.expression, frame))),
          position,
        };
      case 'identifier':
      case 'qualifiedIdentifier': {
        const local = expression.type === 'identifier' ? this.checked.locals.get(expression) : undefined;
        if (local !== undefined) {
          return local.kind === 'field'
            ? { type: 'field', name: local.declaration.value, position }
            : { type: 'local', slot: frame.slot(local.declaration), position };
        }
        return { type: 'constant', symbol: this.reference(expression), position };
      }
      case 'builtIn':
        return { type: 'builtIn', name: expression.name, position };
      case 'array':
      case 'set': {
        const type = this.checked.types.types.get(expression);
        const element = type?.kind === 'array' || type?.kind === 'set' ? this.fromType(type.element) : { kind: 'nothing' as const };
        return { type: expression.type, element, elements: expression.elements.map((element) => this.expression(element, frame)), position };
      }
      case 'object':
        return { type: 'object', members: this.members(expression, frame, () => undefined), position };
      case 'member': {
        const object = expression.object;
        const enumSymbol = object.type === 'identifier' || object.type === 'qualifiedIdentifier' ? this.checked.references.get(object) : undefined;
        if (enumSymbol?.typeKind === 'enum' && (object.type !== 'identifier' || this.checked.locals.get(object) === undefined)) {
          const value = this.values.value(expression);
          if (value !== undefined) return { type: 'value', value, position };
        }
        return { type: 'member', object: this.expression(object, frame), name: expression.property.value, position };
      }
      case 'index':
        return { type: 'index', object: this.expression(expression.object, frame), index: this.expression(expression.index, frame), position };
      case 'call':
        return this.call(expression, frame);
      case 'unary':
        return { type: 'unary', operator: expression.operator, argument: this.expression(expression.argument, frame), position };
      case 'binary':
        return { type: 'binary', operator: expression.operator, left: this.expression(expression.left, frame), right: this.expression(expression.right, frame), position };
      case 'instanceOf': {
        const type: CompiledTypeRef = expression.target.type === 'errorType' ? { kind: 'anyError' } : this.typeRef(expression.target);
        return { type: 'instanceOf', value: this.expression(expression.value, frame), target: expression.optional ? { kind: 'optional', inner: type } : type, position };
      }
      case 'canPredicate':
        return {
          type: 'can',
          permission: this.text(expression.permission),
          ...(expression.group !== undefined && { group: this.expression(expression.group, frame) }),
          position,
        };
      case 'isPredicate': {
        const subjectType = expression.subjectType;
        const target =
          subjectType.type === 'builtIn' ? { builtIn: subjectType.name === 'anonymous' ? ('anonymous' as const) : ('defined' as const) } : { entity: this.reference(subjectType) };
        return { type: 'is', target, position };
      }
      case 'rolePredicate':
        return { type: 'hasRole', role: expression.role.value, group: this.expression(expression.group, frame), position };
    }
  }

  private call(expression: Extract<Expression, { type: 'call' }>, frame: Frame): CompiledExpression {
    const position = this.position(expression.position);
    const callee = expression.callee;
    const symbol = callee.type === 'identifier' || callee.type === 'qualifiedIdentifier' ? this.checked.references.get(callee) : undefined;
    if (symbol === undefined) throw new Error(`The compiler couldn't resolve a call at ${this.where(expression.position)}.`);
    const action = symbol.declaration;
    if (action?.type !== 'action') {
      return {
        type: 'callStandard',
        action: this.symbolId(symbol),
        arguments: expression.arguments.map((argument) => ({
          ...(argument.name !== undefined && { name: argument.name.value }),
          value: this.expression(argument.value, frame),
        })),
        position,
      };
    }
    // Each parameter's argument, in order, matched as the type checker matched them (docs/adr/0020-action-parameters.md).
    const required = action.parameters.filter((parameter) => !parameter.optional);
    const byParameter = new Map<string, Expression>();
    for (const argument of expression.arguments) {
      const name =
        argument.name?.value ??
        (argument.value.type === 'identifier' && action.parameters.some((parameter) => parameter.name.value === (argument.value as Identifier).value)
          ? argument.value.value
          : expression.arguments.length === 1 && required.length === 1
            ? required[0]?.name.value
            : undefined);
      if (name !== undefined) byParameter.set(name, argument.value);
    }
    return {
      type: 'call',
      action: this.symbolId(symbol),
      arguments: action.parameters.map((parameter) => {
        const argument = byParameter.get(parameter.name.value);
        return argument === undefined ? { type: 'omitted' as const } : this.expression(argument, frame);
      }),
      position,
    };
  }
}

/** An inline enum's value, from the key the type checker gives it, such as `TEXT:paid`. */
function baseFromKey(key: string): BaseValue {
  const at = key.indexOf(':');
  const kind = key.slice(0, at);
  const value = key.slice(at + 1);
  switch (kind) {
    case 'NUMBER':
      return { kind: 'number', value: Number(value) };
    case 'BOOLEAN':
      return { kind: 'boolean', value: value === 'true' };
    case 'DATE_TIME':
      return { kind: 'dateTime', value: Number(value) };
    case 'DURATION':
      return { kind: 'duration', value: Number(value) };
    default:
      return { kind: 'text', value };
  }
}

/** Call `visit` on every node in an expression. */
function walk(node: unknown, visit: (node: { type: string }) => void): void {
  if (typeof node !== 'object' || node === null) return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  const typed = node as { type?: unknown };
  if (typeof typed.type === 'string') visit(node as { type: string });
  for (const [key, value] of Object.entries(node)) if (key !== 'position') walk(value, visit);
}

