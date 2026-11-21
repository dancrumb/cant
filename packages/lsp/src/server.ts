#!/usr/bin/env node
import {
  createConnection,
  DidChangeWatchedFilesNotification,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Workspace, type Uri } from './workspace.ts';

/** How long to wait after a change before checking again, so that typing isn't checked key by key. */
const DEBOUNCE_MS = 200;

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const workspace = new Workspace();

/** The files last published with problems, so that they can be cleared when they have none. */
let published = new Set<Uri>();
let timer: NodeJS.Timeout | undefined;

const publish = (): void => {
  const diagnostics = workspace.diagnostics();
  for (const uri of published) {
    if (!diagnostics.has(uri)) void connection.sendDiagnostics({ uri, diagnostics: [] });
  }
  for (const [uri, list] of diagnostics) void connection.sendDiagnostics({ uri, diagnostics: list });
  published = new Set(diagnostics.keys());
};

const schedule = (): void => {
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    publish();
  }, DEBOUNCE_MS);
};

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    definitionProvider: true,
    referencesProvider: true,
    hoverProvider: true,
    documentSymbolProvider: true,
    completionProvider: { triggerCharacters: [':'] },
  },
}));

connection.onInitialized(() => {
  // Files that open documents import can change on disk, as can cant.json.
  void connection.client.register(DidChangeWatchedFilesNotification.type, {
    watchers: [{ globPattern: '**/*.cant' }, { globPattern: '**/cant.json' }],
  });
});

documents.onDidChangeContent(({ document }) => {
  workspace.set(document.uri, document.getText());
  schedule();
});

documents.onDidClose(({ document }) => {
  workspace.close(document.uri);
  schedule();
});

connection.onDidChangeWatchedFiles(() => {
  workspace.invalidate();
  schedule();
});

connection.onDefinition(({ textDocument, position }) => workspace.definition(textDocument.uri, position) ?? null);
connection.onReferences(({ textDocument, position, context }) =>
  workspace.references(textDocument.uri, position, context.includeDeclaration),
);
connection.onHover(({ textDocument, position }) => workspace.hover(textDocument.uri, position) ?? null);
connection.onDocumentSymbol(({ textDocument }) => workspace.symbols(textDocument.uri));
connection.onCompletion(({ textDocument, position }) => workspace.completions(textDocument.uri, position));

documents.listen(connection);
connection.listen();
