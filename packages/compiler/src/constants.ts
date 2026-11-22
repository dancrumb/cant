import type {
  ActionDeclaration,
  EntityDeclaration,
  Expression,
  Field,
  Identifier,
  ModelDeclaration,
  TypeRef,
} from '@dancrumb/cant-shared';
import type { Position } from 'unist';
import type { Locals } from './bodies.ts';
import { error, type Diagnostic } from './diagnostic.ts';
import { ConstantValues } from './evaluate.ts';
import type { LoadedProgram } from './modules.ts';
import type { References } from './resolve.ts';

/** What this pass needs from the earlier ones. */
export interface ConstantsInput extends LoadedProgram {
  references: References;
  locals: Locals;
}

/**
 * The checks that need to know which expressions are constant, or that span declarations:
 *
 * - a constant's value, and every trigger source parameter, must be a constant expression
 *   (docs/adr/0023-error-handling.md, 0025, 0034);
 * - a model that is one of an entity's models can't hold entities
 *   (docs/adr/0027-object-shapes.md, 0035);
 * - defaults can't depend on each other in a cycle (docs/adr/0020-action-parameters.md, 0027);
 * - no two test cases in a program have the same name, including names built from constants
 *   (docs/adr/0037-test-case-trigger-source.md).
 */
export function checkConstants(program: ConstantsInput): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const testNames = new Map<string, { file: string; position: Position }>();
  const values = new ConstantValues(program.references);

  for (const module of program.modules.values()) {
    const report = (diagnostic: Diagnostic): void => {
      diagnostics.push({ ...diagnostic, file: module.path });
    };
    const constants = new Constants(program.references);
    // A constant expression that panics would fail when the program starts (docs/adr/0034-top-level-constants.md).
    const reportPanic = (value: Expression): void => {
      const result = values.evaluate(value);
      if (result.kind === 'panic') {
report(error('constant-panics', `This constant expression can't be worked out: ${result.message}`, result.position));
}
    };

    for (const declaration of module.program?.children ?? []) {
      switch (declaration.type) {
        case 'const': {
          const offending = constants.offending(declaration.value);
          if (offending !== undefined) {
report(notConstant(offending, `${declaration.name.value}'s value`));
} else {
reportPanic(declaration.value);
}
          break;
        }
        case 'trigger': {
          for (const parameter of declaration.parameters ?? []) {
            const offending = constants.offending(parameter.value, declaration.source.value === 'TestCase' && parameter.name.value === 'subject');
            if (offending !== undefined) {
report(notConstant(offending, `The source parameter ${parameter.name.value}`));
} else {
reportPanic(parameter.value);
}
          }
          if (declaration.source.value === 'TestCase') {
            const name = declaration.parameters?.find((parameter) => parameter.name.value === 'name')?.value;
            const value = name === undefined ? undefined : values.value(name);
            const text = value?.kind === 'text' ? value.value : undefined;
            if (name !== undefined && text !== undefined) {
              const earlier = testNames.get(text);
              if (earlier === undefined) {
testNames.set(text, { file: module.path, position: name.position });
} else {
                report(
                  error(
                    'duplicate-test-case',
                    `There is already a test case called "${text}", in ${earlier.file === module.path ? 'this file' : earlier.file} on line ${String(earlier.position.start.line)}. Each test case needs its own name.`,
                    name.position,
                  ),
                );
              }
            }
          }
          break;
        }
        case 'action':
          checkDefaultCycles(declaration.parameters, 'parameter', program.locals, report);
          break;
        case 'model':
          checkDefaultCycles(declaration.fields, 'field', program.locals, report);
          break;
        case 'errorDeclaration':
          if (Array.isArray(declaration.data)) {
checkDefaultCycles(declaration.data, 'field', program.locals, report);
}
          break;
        case 'entity':
          checkEntityModels(declaration, program.references, report);
          break;
        default:
          break;
      }
    }
  }
  return diagnostics;
}

const notConstant = (offending: Expression, what: string): Diagnostic =>
  error(
    'not-constant',
    `${what} must be a constant expression, which the compiler can work out before the program runs: literals, enum values, constants, and operators, strings and objects made of them. ${describeOffending(offending)}`,
    offending.position,
  );

function describeOffending(expression: Expression): string {
  switch (expression.type) {
    case 'call':
      return 'A call is not.';
    case 'array':
    case 'set':
      return "A collection is not, since its contents can change.";
    case 'identifier':
    case 'qualifiedIdentifier':
      return 'This name is not a constant.';
    default:
      return 'This is not.';
  }
}

/** Works out which part of an expression stops it being constant. */
class Constants {
  private readonly references: References;

  constructor(references: References) {
    this.references = references;
  }

  /**
   * The part of an expression that stops it being a constant expression, or `undefined` if it is
   * one (docs/adr/0023-error-handling.md). In a test case's `subject`, the `@entity` member names
   * a type, so it is left out.
   */
  offending(expression: Expression, testSubject = false): Expression | undefined {
    switch (expression.type) {
      case 'number':
      case 'boolean':
      case 'dateTime':
      case 'duration':
        return undefined;
      case 'builtIn':
        // Built-in values in these places have already been reported as misplaced.
        return undefined;
      case 'string':
        for (const part of expression.parts) {
          if (part.type === 'interpolation') {
            const offending = this.offending(part.expression);
            if (offending !== undefined) {
return offending;
}
          }
        }
        return undefined;
      case 'object':
        for (const item of expression.items) {
          if (testSubject && item.name.type === 'builtIn') {
continue;
}
          const offending = this.offending(item.value);
          if (offending !== undefined) {
return offending;
}
        }
        return undefined;
      case 'identifier':
      case 'qualifiedIdentifier': {
        // A name a constant expression uses must be a top-level constant. Its own value is
        // checked where it is declared, so it isn't reported again here.
        const symbol = this.references.get(expression);
        return symbol === undefined || symbol.kind === 'const' ? undefined : expression;
      }
      case 'member':
        // An enum value, as in `Status.Open`, or a member of a constant object.
        if (
          (expression.object.type === 'identifier' || expression.object.type === 'qualifiedIdentifier') &&
          this.references.get(expression.object)?.typeKind === 'enum'
        ) {
          return undefined;
        }
        return this.offending(expression.object);
      case 'index':
        return this.offending(expression.object) ?? this.offending(expression.index);
      case 'unary':
        return this.offending(expression.argument);
      case 'binary':
        return this.offending(expression.left) ?? this.offending(expression.right);
      case 'instanceOf':
        return this.offending(expression.value);
      case 'call':
      case 'array':
      case 'set':
      case 'canPredicate':
      case 'rolePredicate':
      case 'isPredicate':
        return expression;
    }
  }

}

/** Defaults that refer to each other in a cycle can't be worked out (docs/adr/0020-action-parameters.md, 0027). */
function checkDefaultCycles(
  items: (ActionDeclaration['parameters'][number] | Field)[],
  kind: 'parameter' | 'field',
  locals: Locals,
  report: (diagnostic: Diagnostic) => void,
): void {
  const byName = new Map(items.map((item) => [item.name, item]));
  const dependencies = new Map<Identifier, Identifier[]>();
  for (const item of items) {
    const found: Identifier[] = [];
    collectNames(item.defaultValue, (identifier) => {
      const binding = locals.get(identifier);
      if (binding?.kind === kind && byName.has(binding.declaration)) {
found.push(binding.declaration);
}
    });
    dependencies.set(item.name, found);
  }

  const reported = new Set<Identifier>();
  const visit = (name: Identifier, path: Identifier[]): void => {
    const start = path.indexOf(name);
    if (start >= 0) {
      const cycle = path.slice(start);
      if (cycle.some((member) => reported.has(member))) {
return;
}
      for (const member of cycle) {
reported.add(member);
}
      report(
        error(
          'default-cycle',
          `${cycle[0]?.value ?? ''}'s default depends on itself, through ${[...cycle, cycle[0]].map((member) => member?.value).join(' → ')}. Defaults can't depend on each other in a cycle.`,
          cycle[0]?.position ?? name.position,
        ),
      );
      return;
    }
    for (const next of dependencies.get(name) ?? []) {
visit(next, [...path, name]);
}
  };
  for (const item of items) {
visit(item.name, []);
}
}

/** Call `found` on every identifier in an expression. */
function collectNames(expression: Expression | undefined, found: (identifier: Identifier) => void): void {
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) {
return;
}
    if (Array.isArray(node)) {
      for (const child of node) {
walk(child);
}
      return;
    }
    const typed = node as { type?: unknown };
    if (typed.type === 'identifier') {
found(node as Identifier);
}
    for (const [key, value] of Object.entries(node)) {
if (key !== 'position') {
walk(value);
}
}
  };
  walk(expression);
}

/**
 * A model that is one of an entity's models can't hold entities: stored entities are linked
 * only by relations (docs/adr/0027-object-shapes.md, 0035).
 */
function checkEntityModels(entity: EntityDeclaration, references: References, report: (diagnostic: Diagnostic) => void): void {
  for (const line of entity.lines) {
    if (line.type !== 'modelsBlock') {
continue;
}
    for (const name of line.models) {
      const model = references.get(name)?.declaration;
      if (model?.type !== 'model') {
continue;
}
      const field = fieldHoldingEntity(model, references, new Set());
      if (field !== undefined) {
        report(
          error(
            'model-holds-entity',
            `${model.name.value} can't be one of ${entity.name.value}'s models, because its field ${field.value} holds an entity. Stored entities are linked only by relations: declare a \`relation\` instead.`,
            name.position,
          ),
        );
      }
    }
  }
}

/** The first field of a model that holds an entity, directly or through collections, optionals and other models. */
function fieldHoldingEntity(model: ModelDeclaration, references: References, seen: Set<ModelDeclaration>): Identifier | undefined {
  if (seen.has(model)) {
return undefined;
}
  seen.add(model);
  const holds = (type: TypeRef): boolean => {
    switch (type.type) {
      case 'arrayType':
      case 'setType':
        return holds(type.elementType);
      case 'mapType':
        return holds(type.valueType);
      case 'identifier':
      case 'qualifiedIdentifier': {
        const declaration = references.get(type)?.declaration;
        if (declaration?.type === 'entity') {
return true;
}
        return declaration?.type === 'model' && fieldHoldingEntity(declaration, references, seen) !== undefined;
      }
      default:
        return false;
    }
  };
  return model.fields.find((field) => holds(field.valueType))?.name;
}
