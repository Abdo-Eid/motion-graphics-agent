# Bun Workspaces Notes

> **Historical note.** Tree below predates the `sandbox/` workspace; the current monorepo has three workspaces (`web`, `mastra`, `sandbox`). Behaviour described still applies.

## How Bun Handles `node_modules` in Workspaces

Unlike npm/yarn workspaces which hoist all dependencies to the root `node_modules`, **Bun installs dependencies into each workspace's own `node_modules`** by default.

### What this means for our project

```
editing-agent/
├── node_modules/          ← only root-level deps (@types/bun, etc.)
├── web/
│   ├── node_modules/      ← web's own deps (react, remotion, tanstack, etc.)
│   └── package.json
├── mastra/
│   ├── node_modules/      ← mastra's own deps (will be added in Phase 3)
│   └── package.json
└── package.json           ← workspaces: ["web", "mastra"]
```

### Key behaviors

- `bun add` inside a workspace installs to that workspace's `node_modules`, not root
- Bun resolves imports from the workspace's `node_modules` first, then walks up to root
- `web/node_modules` is **not a symlink** — it's a real directory
- `bun install` from root reconciles all workspaces but keeps deps local

### Running `bun add` from inside a workspace vs root

Both work, but behave slightly differently:

| Command | Where deps go | When to use |
|---|---|---|
| `cd web && bun add foo` | `web/node_modules` | When working on a specific workspace |
| `bun add foo --cwd web` | `web/node_modules` | Same result, from root |
| `bun add foo` (from root, no --cwd) | `node_modules` (root) | Only for root-level deps |

### Vite Scaffold + workspace installs

When using `bunx create-vite@latest web --template react-ts`, Vite creates the `web/` package. The first `bun add` or `bun install` you run from inside `web/` or from root will install frontend dependencies into `web/node_modules`.
