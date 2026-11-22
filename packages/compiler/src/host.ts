import { readFileSync } from 'node:fs';
import type { StandardLibrary } from './stdlib.ts';

/** How the compiler reads files, so that tests can give it files that live only in memory. */
export interface Host {
  /** The file's text, or `undefined` if it doesn't exist or can't be read. */
  readFile(path: string): string | undefined;
  /**
   * The standard library for the program whose entry is `entry`, or `undefined` for the one the
   * compiler embeds. An editor gives the one the program will run with (see `findStandardLibrary`).
   */
  standardLibrary?(entry: string): StandardLibrary | undefined;
}

/** Reads files from the file system. */
export const fileSystemHost: Host = {
  readFile(path) {
    try {
      return readFileSync(path, 'utf-8');
    } catch {
      return undefined;
    }
  },
};
