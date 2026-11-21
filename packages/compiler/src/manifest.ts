import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Position } from 'unist';
import { error, type Diagnostic } from './diagnostic.ts';
import type { Host } from './host.ts';

/** The manifest's file name (docs/adr/0031-module-resolution.md). */
export const MANIFEST = 'cant.json';

/** A program's `cant.json`: where each scope's modules are. */
export interface Manifest {
  path: string;
  /** Each scope's directory, as an absolute path ending in the path separator. */
  scopes: Map<string, string>;
}

export interface LoadedManifest {
  manifest?: Manifest;
  diagnostics: Diagnostic[];
}

const START: Position = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };

/** The position of the first `"text"` in `source`, or the start of the file if it isn't there. */
function positionOf(source: string, text: string): Position {
  const offset = source.indexOf(JSON.stringify(text));
  if (offset < 0) return START;
  const before = source.slice(0, offset).split('\n');
  const line = before.length;
  const column = (before.at(-1)?.length ?? 0) + 1;
  const length = JSON.stringify(text).length;
  return {
    start: { line, column, offset },
    end: { line, column: column + length, offset: offset + length },
  };
}

/**
 * Find the program's manifest: `cant.json` in the entry module's directory, or the nearest
 * directory above it that has one. A program with no manifest can only use the `cant` scope and
 * URL imports.
 */
export function findManifest(entry: string, host: Host): LoadedManifest {
  let directory = dirname(entry);
  for (;;) {
    const path = join(directory, MANIFEST);
    const source = host.readFile(path);
    if (source !== undefined) return readManifest(path, source);
    const parent = dirname(directory);
    if (parent === directory) return { diagnostics: [] };
    directory = parent;
  }
}

/** Read a manifest's scopes, reporting anything that breaks the rules of docs/adr/0031-module-resolution.md. */
export function readManifest(path: string, source: string): LoadedManifest {
  const diagnostics: Diagnostic[] = [];
  const fail = (code: string, message: string, position = START): LoadedManifest => {
    diagnostics.push({ ...error(code, message, position), file: path });
    return { diagnostics };
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (caught) {
    return fail('manifest', `${MANIFEST} isn't valid JSON: ${caught instanceof Error ? caught.message : String(caught)}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return fail('manifest', `${MANIFEST} must hold a JSON object.`);
  }

  const scopes = new Map<string, string>();
  const declared: unknown = (parsed as Record<string, unknown>).scopes;
  if (declared === undefined) return { manifest: { path, scopes }, diagnostics };
  if (typeof declared !== 'object' || declared === null || Array.isArray(declared)) {
    return fail('manifest', '`scopes` must be an object that maps each scope to a directory.', positionOf(source, 'scopes'));
  }

  const base = pathToFileURL(path);
  for (const [scope, value] of Object.entries(declared)) {
    const position = positionOf(source, scope);
    const report = (message: string): void => {
      diagnostics.push({ ...error('manifest', message, position), file: path });
    };
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(scope)) {
      report(`The scope "${scope}" isn't an identifier.`);
    } else if (scope === 'cant') {
      report('The `cant` scope is built into the interpreter, so the manifest can\'t map it.');
    } else if (typeof value !== 'string') {
      report(`The scope "${scope}" must map to a directory, written as a string.`);
    } else if (!value.endsWith('/')) {
      report(`The directory for "${scope}", "${value}", must end in /.`);
    } else {
      const url = new URL(value, base);
      if (url.protocol !== 'file:') {
        report(`The directory for "${scope}", "${value}", must be a local file URL: modules can't be fetched from remote URLs.`);
      } else {
        scopes.set(scope, fileURLToPath(url));
      }
    }
  }
  return { manifest: { path, scopes }, diagnostics };
}
