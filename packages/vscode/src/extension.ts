import * as vscode from 'vscode';
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

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      [{ language: 'cant' }, { language: 'markdown' }],
      provider,
      legend,
    ),
  );
}
