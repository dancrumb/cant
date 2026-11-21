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

## Publishing

Pushing a `v*` tag, as `pnpm release` makes, runs `.github/workflows/publish.yml`. It publishes the npm packages with the `NPM_TOKEN` secret, and the VS Code extension to the Visual Studio Marketplace, as publisher `dancrumb`, with the `VSCE_PAT` secret.

## Architecture decisions

Significant design decisions are recorded in [`docs/adr`](docs/adr/README.md).
