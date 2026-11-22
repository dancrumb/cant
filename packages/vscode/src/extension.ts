import * as vscode from 'vscode';
import { LanguageClient, TransportKind, type LanguageClientOptions, type ServerOptions } from 'vscode-languageclient/node';
import { semanticTokens, TOKEN_TYPES } from './semanticTokens.ts';

const legend = new vscode.SemanticTokensLegend([...TOKEN_TYPES]);

const provider: vscode.DocumentSemanticTokensProvider = {
  provideDocumentSemanticTokens(document) {
    const builder = new vscode.SemanticTokensBuilder(legend);

    for (const token of semanticTokens(document.getText(), document.languageId)) {
      const start = document.positionAt(token.start);
      builder.push(new vscode.Range(start, start.translate(0, token.length)), token.type);
    }

    return builder.build();
  },
};

let client: LanguageClient | undefined;

/**
 * The most recent start, stop or restart of the client. Each one waits for the
 * one before it, so a restart never begins while the client is still starting.
 */
let lifecycle: Promise<void> = Promise.resolve();

const enqueue = (step: (client: LanguageClient) => Promise<void>): Promise<void> => {
  const run = async (): Promise<void> => {
    if (client !== undefined) {
await step(client);
}
  };
  // A failed step has already been reported, and must not stop the ones after it.
  lifecycle = lifecycle.catch(() => undefined).then(run);
  return lifecycle;
};

const stopClient = async (running: LanguageClient): Promise<void> => {
  if (running.needsStop()) {
await running.stop();
}
};

/** Start the Cant language server, which is bundled beside the extension as `dist/server.cjs`. */
const startServer = (context: vscode.ExtensionContext): void => {
  const module = context.asAbsolutePath('dist/server.cjs');
  const server: ServerOptions = {
    run: { module, transport: TransportKind.ipc },
    debug: { module, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6009'] } },
  };
  const options: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'cant' }],
  };
  client = new LanguageClient('cant', 'Cant', server, options);
  void enqueue((created) => created.start());
};

/** Stop the language server, if it is running, and start it again. */
const restartServer = (): Promise<void> =>
  enqueue(async (running) => {
    await stopClient(running);
    await running.start();
  });

export function activate(context: vscode.ExtensionContext): void {
  startServer(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('cant.restartServer', restartServer),
    // The language server colours .cant files, knowing what each name is. Markdown's cant code
    // blocks aren't documents it checks, so they are coloured here, from the tokenizer alone.
    vscode.languages.registerDocumentSemanticTokensProvider([{ language: 'markdown' }], provider, legend),
  );
}

export function deactivate(): Promise<void> {
  return enqueue(stopClient);
}
