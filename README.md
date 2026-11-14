# cant

TypeScript monorepo, managed with pnpm workspaces and Turborepo.

| Workspace | Package |
| --- | --- |
| `packages/shared` | `@dancrumb/cant-shared` |
| `packages/compiler` | `@dancrumb/cant-compiler` |
| `packages/interpreter` | `@dancrumb/cant-interpreter` |
| `packages/lsp` | `@dancrumb/cant-lsp` |

## Development

```sh
pnpm install
pnpm build        # turbo: builds workspaces in dependency order, cached
pnpm test         # builds first, then runs node:test suites
pnpm typecheck
pnpm lint
pnpm clean
```

## Architecture decisions

Significant design decisions are recorded in [`docs/adr`](docs/adr/README.md).
