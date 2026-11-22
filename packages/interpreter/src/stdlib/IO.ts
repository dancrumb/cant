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
