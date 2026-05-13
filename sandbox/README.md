# Sandbox Service

A small standalone Bun process that exposes file and command-execution tools to the Implementor agent over MCP (HTTP). Runs directly on the host — no Docker, no container, no image.

The main Mastra app at `mastra/` connects to this service via `MCPClient`. The two are separate services that talk over `localhost`.

## Run

```sh
bun install
cp .env.example .env
bun run dev
```

The MCP endpoint will be available at `http://localhost:${SANDBOX_HTTP_PORT}/mcp` (default `4311`).

## Workspace

All file operations and command execution are scoped to the workspace root resolved in `src/index.ts` (`process.env.WORKSPACE_PATH ?? <repo>/sandbox/.workspace`, computed file-anchored from `import.meta.url`). The default directory is `.gitignore`d. Paths supplied to tools are resolved relative to this root and rejected if they escape it.

## Tool Surface

See [`docs/local-sandbox-service-design.md`](../docs/local-sandbox-service-design.md) for the full tool list and rules.

## Scaffolding Status

This package is scaffolded but not yet implemented. Follow [`tasks/T6-sandbox-service.md`](../tasks/T6-sandbox-service.md) to fill it in.
