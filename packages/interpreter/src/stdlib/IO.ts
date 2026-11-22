import type { Readable, Writable } from 'node:stream';
import { CantError, CantFile, type NativeAction } from '@dancrumb/cant-native';

/**
 * cant::IO (docs/adr/0042-io.md), declared by packages/compiler/stdlib/IO.cant. The interpreter
 * gives it `@stdin`, `@stdout` and `@stderr` as Node.js's process streams, and a `FILE` as a
 * `CantFile` (docs/adr/0040-standard-streams.md).
 */

const streamError = (caught: unknown): CantError =>
  new CantError('StreamError', { reason: caught instanceof Error ? caught.message : String(caught) });

/**
 * Write `message` to `stream`, encoded as UTF-8, with nothing added. It returns once the stream
 * has accepted the whole message. Node.js streams write in the order they are given, and a write
 * is never split, so each message is written whole, in order.
 */
export const write: NativeAction = async ({ message, stream }) => {
  const target = stream as Writable;
  await new Promise<void>((resolve, reject) => {
    // A stream that is closed or broken, such as a pipe whose reader has exited, fails the write.
    const failed = (caught: unknown): void => {
      reject(streamError(caught));
    };
    target.once('error', failed);
    target.write(message, 'utf8', (caught) => {
      target.off('error', failed);
      if (caught === null || caught === undefined) {
resolve();
} else {
failed(caught);
}
    });
  });
};

/**
 * Read everything left in `stream`, waiting until it ends, as bytes from 0 to 255. A `FILE` is
 * read from the start each time, and standard input, once it has ended, gives `[]`.
 */
export const read: NativeAction = async ({ stream }) => {
  try {
    if (CantFile.is(stream)) {
return [...new Uint8Array(await (await stream.blob()).arrayBuffer())];
}
    const source = stream as Readable;
    if (source.readableEnded || source.destroyed) {
return [];
}
    const chunks: Buffer[] = [];
    for await (const chunk of source) {
chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
}
    return [...Buffer.concat(chunks)];
  } catch (caught) {
    throw streamError(caught);
  }
};

/** Each stream's last `readline`, so that calls made together read one line each, in order. */
const reading = new WeakMap<Readable, Promise<unknown>>();

/**
 * Read the next line of `stream`: what comes before the next line break, `\n` or `\r\n`, decoded
 * as UTF-8, or what is left when the stream ends without one. It gives `undefined`, for `NOTHING`,
 * once the stream has ended with nothing left. Only the line and its break are taken from the
 * stream, so a later `readline` or `read` reads what follows. A `FILE` is read from the start each
 * time, so this gives its first line.
 */
export const readline: NativeAction = async ({ stream }) => {
  try {
    if (CantFile.is(stream)) {
      return firstLine(Buffer.from(await (await stream.blob()).arrayBuffer()));
    }
    const source = stream as Readable;
    const line = (reading.get(source) ?? Promise.resolve()).catch(() => undefined).then(() => nextLine(source));
    reading.set(source, line);
    return await line;
  } catch (caught) {
    throw streamError(caught);
  }
};

const LINE_FEED = 0x0a;

/** A line's text, without its line break. */
const decode = (bytes: Buffer): string => {
  const text = bytes.toString('utf8');
  return text.endsWith('\r') ? text.slice(0, -1) : text;
};

const firstLine = (bytes: Buffer): string | undefined => {
  if (bytes.length === 0) {
    return undefined;
  }
  const end = bytes.indexOf(LINE_FEED);
  return decode(end === -1 ? bytes : bytes.subarray(0, end));
};

/** Take bytes from `source` up to and including the next line feed, and put back any after it. */
async function nextLine(source: Readable): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  for (;;) {
    const chunk = source.read() as Buffer | string | null;
    if (chunk === null) {
      // A stream that failed before or while it was read fails the read.
      if (source.errored !== null) {
        throw source.errored;
      }
      if (source.readableEnded || source.destroyed) {
        break;
      }
      // Wait for more, for the end, or for the stream to fail.
      if (!(await more(source))) {
        break;
      }
      continue;
    }
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const end = bytes.indexOf(LINE_FEED);
    if (end === -1) {
      chunks.push(bytes);
      continue;
    }
    chunks.push(bytes.subarray(0, end));
    if (end + 1 < bytes.length) {
      source.unshift(bytes.subarray(end + 1));
    }
    return decode(Buffer.concat(chunks));
  }
  return chunks.length === 0 ? undefined : decode(Buffer.concat(chunks));
}

/** Wait until `source` has more to read, `true`, or has ended, `false`. A failure rejects. */
const more = (source: Readable): Promise<boolean> =>
  new Promise<boolean>((resolve, reject) => {
    const done = (result: boolean | Error): void => {
      source.off('readable', readable);
      source.off('end', ended);
      source.off('close', ended);
      source.off('error', failed);
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    };
    const readable = (): void => {
      done(true);
    };
    const ended = (): void => {
      done(false);
    };
    const failed = (caught: Error): void => {
      done(caught);
    };
    source.on('readable', readable);
    source.on('end', ended);
    source.on('close', ended);
    source.on('error', failed);
  });
