import type {
  ActionDeclaration,
  Argument,
  BuiltIn,
  CallExpression,
  Expression,
  Field,
  Identifier,
  Name,
  Parameter,
  Statement,
  TriggerDeclaration,
} from '@dancrumb/cant-shared';
import { MAIN_NAMESPACE } from './declarations.ts';
import { error, type Diagnostic } from './diagnostic.ts';
import { ambiguous, describeName, hasNamespace, symbolsNamed, type LoadedProgram, type Module, type ModuleSymbol } from './modules.ts';
import type { References } from './resolve.ts';

/** A name given a value inside a declaration: a parameter, an assigned identifier or a loop variable. */
export interface LocalBinding {
  kind: 'parameter' | 'local' | 'loop' | 'field';
  /** Where the name is declared. */
  declaration: Identifier;
}

/** Which local binding each identifier in an expression refers to. */
export type Locals = Map<Identifier, LocalBinding>;

/** The built-in values of docs/adr/0024-built-in-values.md, and where each can be written. */
const BUILT_INS = new Set([
  'subject', 'anonymous', 'defined', 'id', 'entity', 'all', 'result', 'error', 'now', 'request', 'message',
  // docs/adr/0040-standard-streams.md
  'stdin', 'stdout', 'stderr',
]);

/** The built-ins that can be used anywhere but in a constant expression. */
const ANYWHERE = ['subject', 'now', 'stdin', 'stdout', 'stderr'];

/** Where an expression is, which decides the built-in values it can use. */
type Context = 'action' | 'field' | 'constant' | 'trigger' | 'source parameters' | 'assertions';

const ALLOWED_BUILT_INS: Record<Context, ReadonlySet<string>> = {
  action: new Set(ANYWHERE),
  field: new Set(ANYWHERE),
  // A constant, and a source's parameters, must be constant expressions, which built-ins never are.
  constant: new Set(),
  'source parameters': new Set(),
  trigger: new Set([...ANYWHERE, 'result', 'request', 'message']),
  assertions: new Set([...ANYWHERE, 'result', 'error', 'request', 'message']),
};

/** Where docs/adr/0024-built-in-values.md lets each built-in be used, for error messages. */
const WHERE: Record<string, string> = {
  subject: 'in any trigger or action',
  now: 'in any trigger or action, but not in a constant expression',
  stdin: 'in any trigger or action, but not in a constant expression',
  stdout: 'in any trigger or action, but not in a constant expression',
  stderr: 'in any trigger or action, but not in a constant expression',
  result: 'only in a trigger',
  request: 'only in a trigger on a source that provides it',
  message: 'only in a trigger on a source that provides it',
  error: "only in a test case's `assertions`",
  anonymous: 'only after `@subject is`',
  defined: 'only after `@subject is`',
  all: 'only in an entity\'s `expose` and `hide` blocks, and in `passes @all`',
  entity: "only as a member name in a test case's `subject`",
  id: 'nowhere: it cannot be read in Cant code',
};

/** The parameters of the `TestCase` source (docs/adr/0037-test-case-trigger-source.md, 0026). */
const TEST_CASE_PARAMETERS = new Set(['name', 'subject', 'now']);

/** A block's names, and the blocks around it. */
class Scope {
  readonly names = new Map<string, LocalBinding>();
  readonly parent: Scope | undefined;

  constructor(parent?: Scope) {
    this.parent = parent;
  }

  find(name: string): LocalBinding | undefined {
    return this.names.get(name) ?? this.parent?.find(name);
  }
}

/**
 * Resolve the names inside expressions and statements, in every module: identifiers, calls and
 * enum members, with the local scopes of docs/adr/0018-immutable-identifiers.md and
 * docs/adr/0020-action-parameters.md. Reports:
 *
 * - names that can't be found, or that name something that can't be used there, such as an
 *   action used as a value, or a call of something that isn't an action;
 * - an identifier assigned twice in one block (docs/adr/0018-immutable-identifiers.md);
 * - `break` or `continue` outside a loop (docs/adr/0007-actions.md);
 * - arguments that don't match the action's parameters, in calls and in triggers
 *   (docs/adr/0020-action-parameters.md), and unknown `TestCase` parameters;
 * - enum members the enum doesn't have (docs/adr/0013-enums.md);
 * - built-in values that don't exist, or are used where they can't be (docs/adr/0024-built-in-values.md).
 *
 * Resolved top-level names are added to `references`, and local ones to the returned `locals`.
 */
export function resolveBodies(program: LoadedProgram, references: References): { locals: Locals; diagnostics: Diagnostic[] } {
  const locals: Locals = new Map();
  const diagnostics: Diagnostic[] = [];
  for (const module of program.modules.values()) {
    new BodyResolver(module, references, locals, (diagnostic) => {
      diagnostics.push({ ...diagnostic, file: module.path });
    }).run();
  }
  return { locals, diagnostics };
}

class BodyResolver {
  private namespace = MAIN_NAMESPACE;
  private context: Context = 'action';
  private loops = 0;

  private readonly module: Module;
  private readonly references: References;
  private readonly locals: Locals;
  private readonly report: (diagnostic: Diagnostic) => void;

  constructor(module: Module, references: References, locals: Locals, report: (diagnostic: Diagnostic) => void) {
    this.module = module;
    this.references = references;
    this.locals = locals;
    this.report = report;
  }

  run(): void {
    for (const declaration of this.module.program?.children ?? []) {
      switch (declaration.type) {
        case 'namespace':
          this.namespace = declaration.name.value;
          break;
        case 'action':
          this.action(declaration);
          break;
        case 'const':
          this.context = 'constant';
          this.expression(declaration.value, new Scope());
          break;
        case 'model':
          this.fields(declaration.fields);
          break;
        case 'errorDeclaration':
          if (Array.isArray(declaration.data)) {
this.fields(declaration.data);
}
          break;
        case 'trigger':
          this.trigger(declaration);
          break;
        default:
          break;
      }
    }
  }

  // ----- Declarations -----

  private action(declaration: ActionDeclaration): void {
    this.context = 'action';
    // Parameters are in a block around the body, and a default can use any other parameter,
    // before or after it in the list (docs/adr/0020-action-parameters.md).
    const parameters = new Scope();
    for (const parameter of declaration.parameters) {
      parameters.names.set(parameter.name.value, { kind: 'parameter', declaration: parameter.name });
    }
    for (const parameter of declaration.parameters) {
      if (parameter.defaultValue !== undefined) {
this.expression(parameter.defaultValue, parameters);
}
    }
    this.block(declaration.children, new Scope(parameters));
  }

  /** A model's or an error's fields, whose defaults can use the object's other fields (docs/adr/0027-object-shapes.md). */
  private fields(fields: Field[]): void {
    this.context = 'field';
    const scope = new Scope();
    for (const field of fields) {
scope.names.set(field.name.value, { kind: 'field', declaration: field.name });
}
    for (const field of fields) {
if (field.defaultValue !== undefined) {
this.expression(field.defaultValue, scope);
}
}
  }

  private trigger(declaration: TriggerDeclaration): void {
    const scope = new Scope();
    const testCase = declaration.source.value === 'TestCase';

    this.context = 'source parameters';
    for (const parameter of declaration.parameters ?? []) {
      if (testCase && !TEST_CASE_PARAMETERS.has(parameter.name.value)) {
        this.report(
          error(
            'unknown-parameter',
            `The TestCase source has no parameter called ${parameter.name.value}. Its parameters are name, subject and now.`,
            parameter.name.position,
          ),
        );
      }
      this.expression(parameter.value, scope, testCase && parameter.name.value === 'subject');
    }
    if (testCase && !(declaration.parameters ?? []).some((parameter) => parameter.name.value === 'name')) {
      this.report(error('missing-parameter', 'A test case needs a `name` parameter.', declaration.source.position));
    }

    this.context = 'trigger';
    if (declaration.auth !== undefined) {
this.expression(declaration.auth, scope);
}
    for (const argument of declaration.arguments ?? []) {
this.expression(argument.value, scope);
}
    const action = this.references.get(declaration.action);
    if (action?.declaration?.type === 'action') {
      this.checkArguments(
        action.declaration,
        (declaration.arguments ?? []).map((argument) => ({ name: argument.name, position: argument.position })),
        declaration.action.position,
      );
    }

    this.context = 'assertions';
    for (const assertion of declaration.assertions ?? []) {
      this.expression(assertion.test, scope);
      this.expression(assertion.message, scope);
    }
  }

  // ----- Statements -----

  private block(statements: Statement[], scope: Scope): void {
    for (const statement of statements) {
this.statement(statement, scope);
}
  }

  private statement(statement: Statement, scope: Scope): void {
    switch (statement.type) {
      case 'expressionStatement':
        this.expression(statement.expression, scope);
        break;
      case 'assignment':
        this.expression(statement.value, scope);
        if (statement.target.type === 'identifier') {
this.declare(statement.target, scope, 'local');
} else {
this.expression(statement.target, scope);
}
        break;
      case 'delete':
        this.expression(statement.target, scope);
        break;
      case 'ignoredStatement':
        this.statement(statement.statement, scope);
        break;
      case 'return':
        if (statement.argument !== undefined && statement.argument.type !== 'nothing') {
          this.expression(statement.argument, scope);
        }
        break;
      case 'raise':
        for (const argument of statement.arguments ?? []) {
this.expression(argument.value, scope);
}
        if (statement.data !== undefined) {
this.expression(statement.data, scope);
}
        break;
      case 'pass':
        this.expression(statement.argument, scope);
        break;
      case 'assert':
        this.expression(statement.test, scope);
        if (statement.message !== undefined) {
this.expression(statement.message, scope);
}
        break;
      case 'break':
      case 'continue':
        if (this.loops === 0) {
          this.report(
            error('outside-loop', `\`${statement.type}\` can only be used inside a \`for\` or \`while\` loop.`, statement.position),
          );
        }
        break;
      case 'for': {
        this.expression(statement.iterable, scope);
        // The loop variable is a new constant on each pass, in the loop's own block, so the
        // body can't assign to it (docs/adr/0018-immutable-identifiers.md).
        const body = new Scope(scope);
        this.declare(statement.variable, body, 'loop');
        this.loop(() => {
          this.block(statement.children, body);
        });
        break;
      }
      case 'while':
        this.expression(statement.test, scope);
        this.loop(() => {
          this.block(statement.children, new Scope(scope));
        });
        break;
      case 'if':
        this.expression(statement.test, scope);
        for (const branch of statement.children) {
          if (branch.type === 'if') {
this.statement(branch, scope);
} else {
this.block(branch.children, new Scope(scope));
}
        }
        break;
    }
  }

  private loop(body: () => void): void {
    this.loops += 1;
    body();
    this.loops -= 1;
  }

  /** Give a name its value in this block. A name can only be assigned once in a block, but can shadow one from an enclosing block. */
  private declare(name: Identifier, scope: Scope, kind: LocalBinding['kind']): void {
    const earlier = scope.names.get(name.value);
    if (earlier !== undefined) {
      this.report(
        error(
          'reassignment',
          earlier.kind === 'loop'
            ? `${name.value} is the loop's variable, so the loop body can't assign to it. Every identifier is a constant.`
            : `${name.value} has already been assigned in this block, on line ${String(earlier.declaration.position.start.line)}. Every identifier is a constant, so it can only be assigned once; a nested block can declare a new ${name.value} that shadows it.`,
          name.position,
        ),
      );
      return;
    }
    scope.names.set(name.value, { kind, declaration: name });
    this.locals.set(name, { kind, declaration: name });
  }

  // ----- Expressions -----

  private expression(expression: Expression, scope: Scope, testCaseSubject = false): void {
    switch (expression.type) {
      case 'identifier':
        this.value(expression, scope);
        break;
      case 'qualifiedIdentifier':
        this.value(expression, scope);
        break;
      case 'builtIn':
        this.builtIn(expression);
        break;
      case 'string':
        for (const part of expression.parts) {
if (part.type === 'interpolation') {
this.expression(part.expression, scope);
}
}
        break;
      case 'array':
      case 'set':
        for (const element of expression.elements) {
this.expression(element, scope);
}
        break;
      case 'object':
        for (const item of expression.items) {
          if (item.name.type === 'builtIn' && !(testCaseSubject && item.name.name === 'entity')) {
            this.report(
              error(
                'misplaced-built-in',
                `@${item.name.name} can't be a member's name here. A built-in name can only be a member's name as @entity, in a test case's \`subject\`.`,
                item.name.position,
              ),
            );
            continue;
          }
          // `@entity` holds a type, the subject's entity, not a value.
          if (testCaseSubject && item.name.type === 'builtIn' && item.name.name === 'entity') {
            this.subjectEntity(item.value);
            continue;
          }
          this.expression(item.value, scope);
        }
        if (testCaseSubject && !expression.items.some((item) => item.name.type === 'builtIn' && item.name.name === 'entity')) {
          this.report(
            error('missing-entity', "A test case's `subject` needs an @entity member, naming the subject's entity.", expression.position),
          );
        }
        break;
      case 'member':
        if (!this.enumMember(expression, scope)) {
this.expression(expression.object, scope);
}
        break;
      case 'index':
        this.expression(expression.object, scope);
        this.expression(expression.index, scope);
        break;
      case 'call':
        this.call(expression, scope);
        break;
      case 'unary':
        this.expression(expression.argument, scope);
        break;
      case 'binary':
        this.expression(expression.left, scope);
        this.expression(expression.right, scope);
        break;
      case 'instanceOf':
        this.expression(expression.value, scope);
        break;
      case 'canPredicate':
        this.builtIn(expression.subject);
        if (expression.group !== undefined) {
this.expression(expression.group, scope);
}
        break;
      case 'rolePredicate':
        this.builtIn(expression.subject);
        this.expression(expression.group, scope);
        break;
      case 'isPredicate':
        this.builtIn(expression.subject);
        if (expression.subjectType.type === 'builtIn') {
          const name = expression.subjectType.name;
          if (name !== 'anonymous' && name !== 'defined') {
            this.report(
              error(
                'misplaced-built-in',
                `@${name} isn't a kind of subject. After \`@subject is\`, write @anonymous, @defined, or a subject entity.`,
                expression.subjectType.position,
              ),
            );
          }
        }
        break;
      case 'number':
      case 'boolean':
      case 'dateTime':
      case 'duration':
        break;
    }
  }

  /** The entity a test case's `subject` names in its `@entity` member (docs/adr/0037-test-case-trigger-source.md). */
  private subjectEntity(value: Expression): void {
    if (value.type !== 'identifier' && value.type !== 'qualifiedIdentifier') {
      this.report(error('wrong-kind', '@entity must name a subject entity.', value.position));
      return;
    }
    const symbol = this.topLevel(value).find((candidate) => candidate.kind === 'type');
    if (symbol === undefined) {
      this.report(this.ambiguous(value) ?? error('unknown-name', `There is no entity called ${describeName(value)}.`, value.position));
    } else if (symbol.typeKind !== 'entity') {
      this.report(error('wrong-kind', `${describeName(value)} isn't an entity, so it can't be a test case's subject.`, value.position));
    } else {
      this.references.set(value, symbol);
    }
  }

  /** The top-level symbols a name could mean where it appears. */
  private topLevel(name: Name): ModuleSymbol[] {
    if (name.type === 'qualifiedIdentifier') {
      return hasNamespace(this.module, name.namespace.value)
        ? symbolsNamed(this.module, name.namespace.value, name.name.value)
        : [];
    }
    return symbolsNamed(this.module, this.namespace, name.value);
  }

  /** The error for a name that imports make ambiguous where it appears, if it is one. */
  private ambiguous(name: Name): Diagnostic | undefined {
    return ambiguous(this.module, this.namespace, name);
  }

  /** A name used as a value: a local, or a top-level constant. */
  private value(name: Name, scope: Scope): void {
    if (name.type === 'identifier') {
      const local = scope.find(name.value);
      if (local !== undefined) {
        this.locals.set(name, local);
        return;
      }
    }
    if (name.type === 'qualifiedIdentifier' && !hasNamespace(this.module, name.namespace.value)) {
      this.report(
        error('unknown-namespace', `There is no namespace called ${name.namespace.value} in this module.`, name.namespace.position),
      );
      return;
    }
    const candidates = this.topLevel(name);
    const constant = candidates.find((candidate) => candidate.kind === 'const');
    if (constant !== undefined) {
      this.references.set(name, constant);
      return;
    }
    const other = candidates[0];
    if (other === undefined) {
      this.report(this.ambiguous(name) ?? error('unknown-name', `There is nothing called ${describeName(name)} here.`, name.position));
    } else if (other.kind === 'action') {
      this.report(
        error('action-as-value', `${describeName(name)} is an action, so it can only be called, as in ${describeName(name)}(…).`, name.position),
      );
    } else if (other.typeKind === 'enum') {
      this.report(
        error('type-as-value', `${describeName(name)} is an enum. Name one of its members, as in ${describeName(name)}.Member.`, name.position),
      );
    } else {
      this.report(error('type-as-value', `${describeName(name)} is a type, not a value.`, name.position));
    }
  }

  /** `Status.InProgress`, when `Status` names an enum and isn't shadowed by a local. Returns whether it was one. */
  private enumMember(expression: Extract<Expression, { type: 'member' }>, scope: Scope): boolean {
    const object = expression.object;
    if (object.type !== 'identifier' && object.type !== 'qualifiedIdentifier') {
return false;
}
    if (object.type === 'identifier' && scope.find(object.value) !== undefined) {
return false;
}
    const candidates = this.topLevel(object);
    if (candidates.some((candidate) => candidate.kind === 'const')) {
return false;
}
    const symbol = candidates.find((candidate) => candidate.typeKind === 'enum');
    if (symbol === undefined) {
return false;
}
    this.references.set(object, symbol);
    const declaration = symbol.declaration;
    if (declaration?.type === 'enumDeclaration' && !declaration.members.some((member) => member.name.value === expression.property.value)) {
      this.report(
        error(
          'unknown-enum-member',
          `${describeName(object)} has no member called ${expression.property.value}.`,
          expression.property.position,
        ),
      );
    }
    return true;
  }

  private call(expression: CallExpression, scope: Scope): void {
    for (const argument of expression.arguments) {
this.expression(argument.value, scope);
}

    const callee = expression.callee;
    if (callee.type !== 'identifier' && callee.type !== 'qualifiedIdentifier') {
      this.report(
        error(
          'not-callable',
          'Only an action can be called, by its name. Cant has no methods, so a member of a value can\'t be called.',
          callee.position,
        ),
      );
      return;
    }
    if (callee.type === 'identifier' && scope.find(callee.value) !== undefined) {
      this.report(error('not-callable', `${callee.value} is a local value, not an action, so it can't be called.`, callee.position));
      return;
    }
    if (callee.type === 'qualifiedIdentifier' && !hasNamespace(this.module, callee.namespace.value)) {
      this.report(
        error('unknown-namespace', `There is no namespace called ${callee.namespace.value} in this module.`, callee.namespace.position),
      );
      return;
    }
    const candidates = this.topLevel(callee);
    const action = candidates.find((candidate) => candidate.kind === 'action');
    if (action === undefined) {
      this.report(
        candidates.length === 0
          ? (this.ambiguous(callee) ?? error('unknown-name', `There is no action called ${describeName(callee)} here.`, callee.position))
          : error('not-callable', `${describeName(callee)} isn't an action, so it can't be called.`, callee.position),
      );
      return;
    }
    this.references.set(callee, action);
    if (action.declaration?.type === 'action') {
      this.checkCallArguments(action.declaration, expression.arguments, callee.position);
    }
  }

  // ----- Arguments: docs/adr/0020-action-parameters.md -----

  /** Match a call's arguments to the action's parameters, with the short forms calls allow. */
  private checkCallArguments(action: ActionDeclaration, args: Argument[], position: Identifier['position']): void {
    const parameterNames = new Set(action.parameters.map((parameter) => parameter.name.value));
    const required = action.parameters.filter((parameter) => !parameter.optional);
    const given: { name: Identifier; position: Identifier['position'] }[] = [];
    let unmatched = false;

    for (const argument of args) {
      if (argument.name !== undefined) {
        given.push({ name: argument.name, position: argument.position });
      } else if (argument.value.type === 'identifier' && parameterNames.has(argument.value.value)) {
        // The matching-identifier form: `SetStatus(invoiceId)` passes `invoiceId := invoiceId`.
        given.push({ name: argument.value, position: argument.position });
      } else if (args.length === 1 && required.length === 1 && required[0] !== undefined) {
        // The one required parameter, unnamed.
        given.push({ name: required[0].name, position: argument.position });
      } else {
        unmatched = true;
        this.report(
          error(
            'unnamed-argument',
            args.length === 1
              ? `${action.name.value} doesn't have exactly one required parameter, so this argument needs a name, as in name := value.`
              : 'An argument without a name must be the only argument. Name every argument, as in name := value.',
            argument.position,
          ),
        );
      }
    }
    // An argument that couldn't be matched may be the one a missing parameter is for, so
    // missing parameters are only reported when every argument was matched.
    this.checkArguments(action, given, position, !unmatched);
  }

  /** Report unknown, repeated and missing parameters, given the parameter each argument is for. */
  private checkArguments(
    action: ActionDeclaration,
    given: { name: Identifier; position: Identifier['position'] }[],
    position: Identifier['position'],
    reportMissing = true,
  ): void {
    const parameters = new Map<string, Parameter>(action.parameters.map((parameter) => [parameter.name.value, parameter]));
    const seen = new Set<string>();
    for (const { name, position: at } of given) {
      if (!parameters.has(name.value)) {
        this.report(error('unknown-parameter', `${action.name.value} has no parameter called ${name.value}.`, at));
      } else if (seen.has(name.value)) {
        this.report(error('duplicate-argument', `${name.value} is given more than once.`, at));
      }
      seen.add(name.value);
    }
    const missing = action.parameters.filter((parameter) => !parameter.optional && !seen.has(parameter.name.value));
    if (reportMissing && missing.length > 0) {
      this.report(
        error(
          'missing-argument',
          `${action.name.value} needs ${missing.map((parameter) => parameter.name.value).join(', ')}, which ${missing.length === 1 ? "isn't" : "aren't"} given.`,
          position,
        ),
      );
    }
  }

  // ----- Built-in values -----

  private builtIn(builtIn: BuiltIn): void {
    const name = builtIn.name;
    if (!BUILT_INS.has(name)) {
      this.report(error('unknown-built-in', `There is no built-in value called @${name}.`, builtIn.position));
      return;
    }
    if (!ALLOWED_BUILT_INS[this.context].has(name)) {
      const here =
        this.context === 'constant' || this.context === 'source parameters'
          ? 'here, since this must be a constant expression'
          : 'here';
      this.report(
        error('misplaced-built-in', `@${name} can't be used ${here}. It can be used ${WHERE[name] ?? 'nowhere'}.`, builtIn.position),
      );
    }
  }
}
