import type { Readable, Writable } from 'node:stream';
import { CantDuration, CantError } from '@dancrumb/cant-native';
import {
  COMPILED_FORMAT,
  toText,
  type BaseValue,
  type CompiledAction,
  type CompiledExpression,
  type CompiledProgram,
  type CompiledStatement,
  type CompiledTrigger,
  type CompiledTypeRef,
  type SourceMap,
  type SourcePosition,
  type Value,
} from '@dancrumb/cant-shared';
import { STANDARD_ACTIONS } from './stdlib/index.ts';

/**
 * The interpreter (docs/adr/0039-compiled-programs.md): it runs a compiled program by walking its
 * code. For now it runs a program's `Start` triggers (docs/adr/0025-trigger-sources.md), and
 * covers enough of the language for them to call actions, with arguments, defaults, locals,
 * strings with interpolations, and the standard library. Anything else panics, saying the
 * interpreter can't run it yet.
 */

/** The process's standard streams, which `@stdin`, `@stdout` and `@stderr` stand for (docs/adr/0040-standard-streams.md). */
export interface Streams {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
}

export interface RunOptions {
  /** The program's root, which native modules are loaded from. */
  root: string;
  /** The program's source map, for reporting where something happened. */
  sourceMap?: SourceMap;
  /** The streams to give the program, which are the process's own unless given. */
  streams?: Streams;
}

/**
 * A panic (docs/adr/0023-error-handling.md): something the program can't handle, which stops it,
 * at `position` when the interpreter knows where.
 */
export class Panic extends Error {
  readonly position: SourcePosition | undefined;

  constructor(message: string, position?: SourcePosition) {
    super(message);
    this.name = 'Panic';
    this.position = position;
  }
}

type StreamName = keyof Streams;

/** A value while the program runs: a Cant value, a standard stream, or what a call gives. */
type RuntimeValue =
  | Value
  | { kind: 'stream'; name: StreamName }
  /** `NOTHING`, or a parameter or result with no value. */
  | { kind: 'nothing' }
  /** A result that holds an error, rather than a value (docs/adr/0023-error-handling.md). */
  | { kind: 'raised'; error: string; data?: RuntimeValue };

const NOTHING: RuntimeValue = { kind: 'nothing' };

/** The name of an error, from its symbol ID, such as `StreamError` from `cant::IO#StreamError`. */
const nameOf = (symbol: string): string => symbol.slice(symbol.indexOf('#') + 1);

/** The module a symbol is declared in, from its ID. */
const moduleOf = (symbol: string): string => symbol.slice(0, symbol.indexOf('#'));

/**
 * Run a compiled program: start its `Start` triggers, one after another, in the order they are
 * written, and wait for their actions to finish. A program with a trigger source the interpreter
 * can't run yet doesn't start. A `TestCase` only runs when a program's tests are run.
 *
 * @throws {Panic} when the program panics, which stops it.
 */
export async function run(program: CompiledProgram, options: RunOptions): Promise<void> {
  // A compiled program is read from JSON, so its format is only known when it is checked here.
  const format: unknown = program.format;
  if (format !== COMPILED_FORMAT) {
    throw new Error(
      `This compiled program is in format ${String(format)}, but this interpreter runs format ${String(COMPILED_FORMAT)}. Build it again with the same version of Cant.`,
    );
  }
  const triggers = program.triggers.filter((trigger) => trigger.source !== 'TestCase');
  const unsupported = triggers.find((trigger) => trigger.source !== 'Start');
  if (unsupported !== undefined) {
    throw new Panic(`The interpreter can't run ${unsupported.source} triggers yet, only Start triggers.`, unsupported.position);
  }
  const interpreter = new Interpreter(program, options.streams ?? { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr });
  for (const trigger of triggers) {
    await interpreter.trigger(trigger);
  }
}

class Interpreter {
  private readonly program: CompiledProgram;
  private readonly streams: Streams;
  private readonly signal = new AbortController().signal;

  constructor(program: CompiledProgram, streams: Streams) {
    this.program = program;
    this.streams = streams;
  }

  /** Run a trigger's action, with its arguments. An error the action gives stops the program. */
  async trigger(trigger: CompiledTrigger): Promise<void> {
    const action = this.action(trigger.action, trigger.position);
    const args: (RuntimeValue | undefined)[] = [];
    for (const parameter of action.parameters) {
      const argument = trigger.arguments[parameter.name];
      args.push(argument === undefined ? undefined : await this.evaluate(argument, []));
    }
    const result = await this.call(trigger.action, args, trigger.position);
    if (result.kind === 'raised') {
      throw new Panic(`${nameOf(trigger.action)} gave ${nameOf(result.error)}, which nothing handled.`, trigger.position);
    }
  }

  private action(symbol: string, position: SourcePosition): CompiledAction {
    const action = this.program.actions[symbol];
    if (action === undefined) {
      throw new Panic(`The compiled program has no action ${symbol}.`, position);
    }
    return action;
  }

  /** Call an action, with a value, or `undefined` for one left out, for each of its parameters, in order. */
  private async call(symbol: string, args: (RuntimeValue | undefined)[], position: SourcePosition): Promise<RuntimeValue> {
    const action = this.action(symbol, position);
    // Parameters hold the first slots, in order, so a default can refer to the others (docs/adr/0020-action-parameters.md).
    const frame: (RuntimeValue | undefined)[] = [...args];
    for (const index of action.defaultOrder) {
      const parameter = action.parameters[index];
      if (frame[index] === undefined && parameter?.default !== undefined) {
        frame[index] = await this.evaluate(parameter.default, frame);
      }
    }

    const { implementation } = action;
    switch (implementation.kind) {
      case 'body':
        frame.length = Math.max(frame.length, implementation.locals);
        return (await this.block(implementation.body, frame)) ?? NOTHING;
      case 'standard':
        return this.callStandard(symbol, action, frame, position);
      case 'native':
        throw new Panic(`The interpreter can't call native actions yet, such as ${nameOf(symbol)}.`, position);
    }
  }

  /** Call a standard library action, which the interpreter implements (docs/adr/0036-native-modules.md). */
  private async callStandard(symbol: string, action: CompiledAction, values: (RuntimeValue | undefined)[], position: SourcePosition): Promise<RuntimeValue> {
    const implementation = STANDARD_ACTIONS.get(symbol);
    if (implementation === undefined) {
      throw new Panic(`The interpreter has no implementation of ${symbol}.`, position);
    }
    const args: Record<string, unknown> = {};
    action.parameters.forEach((parameter, index) => {
      const value = values[index];
      if (value !== undefined && value.kind !== 'nothing') {
        args[parameter.name] = this.toNative(value, position);
      }
    });
    let result: unknown;
    try {
      result = await implementation(args, { signal: this.signal });
    } catch (caught) {
      // A declared error is the call's result; anything else is a bug in the native code.
      if (CantError.is(caught)) {
        const data = caught.data === undefined ? undefined : this.fromNative(caught.data, position);
        return { kind: 'raised', error: `${moduleOf(symbol)}#${caught.error}`, ...(data !== undefined && { data }) };
      }
      throw new Panic(`${nameOf(symbol)} failed: ${caught instanceof Error ? caught.message : String(caught)}`, position);
    }
    return action.returns.kind === 'void' ? NOTHING : this.fromNative(result, position, action.returns);
  }

  /** Run statements in order, and give the value a `return` among them gives, if one runs. */
  private async block(statements: CompiledStatement[], frame: (RuntimeValue | undefined)[]): Promise<RuntimeValue | undefined> {
    for (const statement of statements) {
      const returned = await this.statement(statement, frame);
      if (returned !== undefined) {
        return returned;
      }
    }
    return undefined;
  }

  /** Run a statement, and give the value it returns, if it is a `return`. */
  private async statement(statement: CompiledStatement, frame: (RuntimeValue | undefined)[]): Promise<RuntimeValue | undefined> {
    switch (statement.type) {
      case 'expression':
        // A result that isn't used is ignored, even one that holds an error (docs/adr/0023-error-handling.md).
        await this.evaluate(statement.expression, frame);
        return undefined;
      case 'let':
        frame[statement.slot] = await this.evaluate(statement.value, frame);
        return undefined;
      case 'return':
        return statement.value === undefined || statement.value.type === 'nothing' ? NOTHING : this.evaluate(statement.value, frame);
      default:
        throw new Panic(`The interpreter can't run ${statement.type} statements yet.`, statement.position);
    }
  }

  private async evaluate(expression: CompiledExpression, frame: (RuntimeValue | undefined)[]): Promise<RuntimeValue> {
    switch (expression.type) {
      case 'value':
        return expression.value;
      case 'local': {
        const value = frame[expression.slot];
        if (value === undefined) {
          throw new Panic('This local has no value yet.', expression.position);
        }
        return value;
      }
      case 'builtIn':
        return this.builtIn(expression.name, expression.position);
      case 'template': {
        let written = '';
        for (const part of expression.parts) {
          written += typeof part === 'string' ? part : this.text(await this.evaluate(part, frame), part.position);
        }
        return { kind: 'text', value: written };
      }
      case 'unwrap': {
        const value = await this.evaluate(expression.value, frame);
        if (value.kind === 'raised') {
          throw new Panic(`This held ${nameOf(value.error)}, which was used without being checked.`, expression.position);
        }
        return value;
      }
      case 'call': {
        const args: (RuntimeValue | undefined)[] = [];
        for (const argument of expression.arguments) {
          args.push(argument.type === 'omitted' ? undefined : await this.evaluate(argument, frame));
        }
        return this.call(expression.action, args, expression.position);
      }
      default:
        throw new Panic(`The interpreter can't evaluate ${expression.type} expressions yet.`, expression.position);
    }
  }

  /** A built-in value (docs/adr/0024-built-in-values.md). */
  private builtIn(name: string, position: SourcePosition): RuntimeValue {
    switch (name) {
      case 'stdin':
      case 'stdout':
      case 'stderr':
        return { kind: 'stream', name };
      case 'now':
        return { kind: 'dateTime', value: Date.now() };
      default:
        throw new Panic(`The interpreter can't give @${name} yet.`, position);
    }
  }

  /** A value converted to text, as an interpolation does (docs/adr/0011-converting-values-to-text.md). */
  private text(value: RuntimeValue, position: SourcePosition): string {
    if (value.kind === 'stream' || value.kind === 'nothing' || value.kind === 'raised') {
      throw new Panic(`This ${value.kind === 'raised' ? 'result' : value.kind} can't be converted to text.`, position);
    }
    return toText(value);
  }

  /** A value as native code is given it (docs/adr/0036-native-modules.md#representing-values). */
  private toNative(value: RuntimeValue, position: SourcePosition): unknown {
    switch (value.kind) {
      case 'text':
      case 'number':
      case 'boolean':
        return value.value;
      case 'dateTime':
        return new Date(value.value);
      case 'duration':
        return new CantDuration(value.value);
      case 'enum':
        return this.toNative(value.value, position);
      case 'object':
        return Object.fromEntries(value.members.map(([name, member]) => [name, this.toNative(member, position)]));
      case 'stream':
        return this.streams[value.name];
      case 'nothing':
        return undefined;
      case 'raised':
        throw new Panic('A result that holds an error can\'t be given to native code.', position);
    }
  }

  /**
   * A value native code gave, as a Cant value: of the type the action declares, or the type its
   * JavaScript value gives (docs/adr/0036-native-modules.md#inferring-types).
   */
  private fromNative(value: unknown, position: SourcePosition, type?: CompiledTypeRef): RuntimeValue {
    if (value === undefined) {
      return NOTHING;
    }
    const base = baseOf(value);
    if (base !== undefined) {
      return base;
    }
    if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
      return {
        kind: 'object',
        members: Object.entries(value).map(([name, member]) => [name, this.valueOf(this.fromNative(member, position), position)]),
      };
    }
    throw new Panic(
      `The interpreter can't take ${type === undefined ? 'this value' : `a ${type.kind} value`} from native code yet, such as a collection.`,
      position,
    );
  }

  private valueOf(value: RuntimeValue, position: SourcePosition): Value {
    if (value.kind === 'stream' || value.kind === 'nothing' || value.kind === 'raised') {
      throw new Panic(`An object can't hold ${value.kind === 'raised' ? 'an error' : `a ${value.kind}`}.`, position);
    }
    return value;
  }
}

/** A JavaScript value's base value, if it is one (docs/adr/0036-native-modules.md#inferring-types). */
function baseOf(value: unknown): BaseValue | undefined {
  if (typeof value === 'string') {
    return { kind: 'text', value };
  }
  if (typeof value === 'number') {
    return { kind: 'number', value };
  }
  if (typeof value === 'boolean') {
    return { kind: 'boolean', value };
  }
  if (value instanceof Date) {
    return { kind: 'dateTime', value: value.getTime() };
  }
  if (CantDuration.is(value)) {
    return { kind: 'duration', value: value.milliseconds };
  }
  return undefined;
}
