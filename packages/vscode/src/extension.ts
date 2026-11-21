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
  void client.start();
};

export function activate(context: vscode.ExtensionContext): void {
  startServer(context);
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      [{ language: 'cant' }, { language: 'markdown' }],
      provider,
      legend,
    ),
  );
}

export function deactivate(): Promise<void> | undefined {
  return client?.stop();
}
