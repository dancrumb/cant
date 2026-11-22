import {
  evaluate,
  type BaseValue,
  type ConstDeclaration,
  type Evaluation,
  type EvaluationScope,
  type Expression,
  type Identifier,
  type Value,
} from '@dancrumb/cant-shared';
import type { Locals } from './bodies.ts';
import type { ModuleSymbol } from './modules.ts';
import type { References } from './resolve.ts';

/** A symbol's ID in a compiled program, `<module>#<name>` (docs/adr/0039-compiled-programs.md). */
export const symbolId = (symbol: ModuleSymbol): string => `${symbol.module}#${symbol.name}`;

/**
 * Works out the values of constant expressions with the evaluator the interpreter shares
 * (docs/adr/0039-compiled-programs.md), resolving names through the compiler's references.
 * Each top-level constant is evaluated once.
 */
export class ConstantValues {
  private readonly references: References;
  private readonly idOf: (symbol: ModuleSymbol) => string;
  private readonly values = new Map<ConstDeclaration, Evaluation>();
  private readonly working = new Set<ConstDeclaration>();

  /** `idOf` names an enum's symbol in the values it gives, as a compiled program names it. */
  constructor(references: References, idOf: (symbol: ModuleSymbol) => string = symbolId) {
    this.references = references;
    this.idOf = idOf;
  }

  /** What evaluating a top-level constant's value gives. A constant that depends on itself isn't constant. */
  of(constant: ConstDeclaration): Evaluation {
    let result = this.values.get(constant);
    if (result === undefined) {
      if (this.working.has(constant)) {
return { kind: 'notConstant', expression: constant.value };
}
      this.working.add(constant);
      result = evaluate(constant.value, this.scope());
      this.working.delete(constant);
      this.values.set(constant, result);
    }
    return result;
  }

  /**
   * Evaluate an expression. Inside an action, `locals` says which names are locals, and
   * `localValues` gives the value of those given a constant value, by where they are declared.
   */
  evaluate(expression: Expression, locals?: Locals, localValues?: ReadonlyMap<Identifier, Value>): Evaluation {
    return evaluate(expression, this.scope(locals, localValues));
  }

  /** The value of a constant expression, or `undefined` if it doesn't have one. */
  value(expression: Expression, locals?: Locals, localValues?: ReadonlyMap<Identifier, Value>): Value | undefined {
    const result = this.evaluate(expression, locals, localValues);
    return result.kind === 'value' ? result.value : undefined;
  }

  private scope(locals?: Locals, localValues?: ReadonlyMap<Identifier, Value>): EvaluationScope {
    return {
      value: (name) => {
        if (name.type === 'identifier') {
          const local = locals?.get(name);
          if (local !== undefined) {
return localValues?.get(local.declaration);
}
        }
        const declaration = this.references.get(name)?.declaration;
        if (declaration?.type !== 'const') {
return undefined;
}
        const result = this.of(declaration);
        return result.kind === 'value' ? result.value : undefined;
      },
      enumMember: (object, member) => {
        const symbol = this.references.get(object);
        const declaration = symbol?.declaration;
        if (symbol === undefined || declaration?.type !== 'enumDeclaration') {
return undefined;
}
        const found = declaration.members.find((candidate) => candidate.name.value === member.value);
        if (found === undefined) {
return undefined;
}
        // A member without a value has its name as its value (docs/adr/0013-enums.md).
        let value: BaseValue = { kind: 'text', value: found.name.value };
        if (found.value !== undefined) {
          const result = evaluate(found.value, this.scope());
          if (result.kind !== 'value' || result.value.kind === 'enum' || result.value.kind === 'object') {
return undefined;
}
          value = result.value;
        }
        return { kind: 'enum', enum: this.idOf(symbol), value };
      },
    };
  }
}
