export { check } from './check.ts';
export type { CheckResult } from './check.ts';

export { collectDeclarations, MAIN_NAMESPACE } from './declarations.ts';
export type {
  CollectedDeclarations,
  InNamespace,
  ModuleSymbols,
  NamespaceSymbols,
  TypeDeclaration,
} from './declarations.ts';

export { formatDiagnostic } from './diagnostic.ts';
export type { Diagnostic } from './diagnostic.ts';
