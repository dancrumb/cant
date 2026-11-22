import { accessSync, constants, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

/**
 * The native API (docs/adr/0036-native-modules.md): what native Cant modules, including the
 * standard library's, are written against. Each class is recognised by a brand, not by
 * `instanceof`, so values made by one copy of this package are recognised by another.
 */

const brand = (name: string): symbol => Symbol.for(`@dancrumb/cant-native:${name}`);
const ERROR = brand('CantError');
const DURATION = brand('CantDuration');
const FILE = brand('CantFile');

const branded = (value: unknown, mark: symbol): boolean =>
  typeof value === 'object' && value !== null && Reflect.get(value, mark) === true;

/** What a native action is given besides its arguments (docs/adr/0036-native-modules.md#calling-a-native-action). */
export interface NativeContext {
  /** Aborted if the call times out. */
  signal: AbortSignal;
}

/**
 * A native action's implementation: it takes its arguments, by parameter name, and its context,
 * and returns the action's value, or a `Promise` of it. It raises one of the action's errors by
 * throwing a `CantError`.
 */
export type NativeAction = (args: Record<string, unknown>, context: NativeContext) => unknown;

/**
 * One of a native action's errors (docs/adr/0036-native-modules.md#errors), named as its `raises`
 * clause names it, with the error's `data`, if it has any.
 */
export class CantError extends Error {
  readonly [ERROR] = true;
  /** The error, such as `"PaymentDeclined"`. */
  readonly error: string;
  /** The error's `data`, which is checked against its `data` model. */
  readonly data: unknown;

  constructor(error: string, data?: unknown) {
    super(`Cant error ${error}`);
    this.name = 'CantError';
    this.error = error;
    this.data = data;
  }

  static is(value: unknown): value is CantError {
    return branded(value, ERROR);
  }
}

/** A `DURATION`: a whole number of milliseconds, which can be negative (docs/adr/0026-dates-and-times.md). */
export class CantDuration {
  readonly [DURATION] = true;
  readonly milliseconds: number;

  constructor(milliseconds: number) {
    if (!Number.isInteger(milliseconds)) throw new RangeError(`A DURATION is a whole number of milliseconds, not ${String(milliseconds)}.`);
    this.milliseconds = milliseconds;
  }

  static is(value: unknown): value is CantDuration {
    return branded(value, DURATION);
  }
}

/**
 * A `FILE` (docs/adr/0015-files.md, docs/adr/0017-faceted-types.md), with a method for each of
 * its facets. It is made from one facet, and the others are derived from it when they are asked for.
 */
export class CantFile {
  readonly [FILE] = true;
  readonly #url: URL;
  /** Its contents, when it was made from them rather than from a URL. */
  readonly #contents: Blob | undefined;

  private constructor(url: URL, contents?: Blob) {
    this.#url = url;
    this.#contents = contents;
  }

  /** The URL that points to the file, its identifier facet. It never fails. */
  url(): URL {
    return new URL(this.#url);
  }

  /**
   * A fresh stream of the file's contents. It throws if they can't be reached, such as when the
   * file its URL points to no longer exists, or the stream fails when it is read.
   */
  stream(): ReadableStream<Uint8Array> {
    if (this.#contents !== undefined) return this.#contents.stream();
    if (this.#url.protocol === 'file:') {
      const path = fileURLToPath(this.#url);
      accessSync(path, constants.R_OK);
      return Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
    }
    const url = this.#url;
    let body: ReadableStreamDefaultReader<Uint8Array> | undefined;
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (body === undefined) {
          const response = await fetch(url);
          if (!response.ok || response.body === null) throw new Error(`Can't read ${url.href}: ${String(response.status)} ${response.statusText}`);
          body = response.body.getReader();
        }
        const { done, value } = await body.read();
        if (done) controller.close();
        else controller.enqueue(value);
      },
    });
  }

  /** The file's contents as a `Blob`. It rejects if they can't be reached. */
  async blob(): Promise<Blob> {
    return this.#contents ?? (await new Response(this.stream()).blob());
  }

  /** A `FILE` at a URL. */
  static fromUrl(url: URL | string): CantFile {
    return new CantFile(new URL(url));
  }

  /** A `FILE` that holds a blob, whose URL is a `data:` URL of its contents (docs/adr/0017-faceted-types.md). */
  static async fromBlob(blob: Blob): Promise<CantFile> {
    const bytes = Buffer.from(await blob.arrayBuffer());
    const type = blob.type === '' ? 'application/octet-stream' : blob.type;
    return new CantFile(new URL(`data:${type};base64,${bytes.toString('base64')}`), blob);
  }

  /** A `FILE` that holds what a stream gives, read to its end. */
  static async fromStream(stream: ReadableStream<Uint8Array>, type = ''): Promise<CantFile> {
    const blob = await new Response(stream).blob();
    return CantFile.fromBlob(type === '' ? blob : new Blob([blob], { type }));
  }

  static is(value: unknown): value is CantFile {
    return branded(value, FILE);
  }
}
