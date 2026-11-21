<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo/cant-mark-on-dark.svg">
    <img src="docs/logo/cant-mark.svg" alt="Cant" width="120">
  </picture>
</p>

# cant

TypeScript monorepo, managed with pnpm workspaces and Turborepo.

| Workspace | Package |
| --- | --- |
| `packages/shared` | `@dancrumb/cant-shared` |
| `packages/compiler` | `@dancrumb/cant-compiler` |
| `packages/interpreter` | `@dancrumb/cant-interpreter` |
| `packages/lsp` | `@dancrumb/cant-lsp` |
| `packages/vscode` | `cant-vscode`, the VS Code extension |

## Development

```sh
pnpm install
pnpm build        # turbo: builds workspaces in dependency order, cached
pnpm test         # builds first, then runs node:test suites
pnpm typecheck
pnpm lint
pnpm clean
```

To build the VS Code extension as `packages/vscode/dist/cant.vsix`, run `pnpm build`, then `pnpm --filter cant-vscode run package`. Install it with `code --install-extension packages/vscode/dist/cant.vsix`.

## Logo

The logo is in [`docs/logo`](docs/logo): the mark for light backgrounds (`cant-mark.svg`), for dark backgrounds (`cant-mark-on-dark.svg`), and the app icon (`cant-icon.svg`). Its colours are ink `#16181D`, paper `#F6F5F1` and amber `#E8A33D`.

## Publishing

Pushing a `v*` tag, as `pnpm release` makes, runs `.github/workflows/publish.yml`. It publishes the npm packages and the VS Code extension, the extension to the Visual Studio Marketplace as publisher `wasakatechnologies`. Both use trusted publishing from GitHub Actions, so no tokens are stored.

## Architecture decisions

Significant design decisions are recorded in [`docs/adr`](docs/adr/README.md).
