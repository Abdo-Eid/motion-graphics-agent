# Phase 3 — Sandbox Service

## Your Role

Build the **Sandbox Service** — a small standalone Bun process that exposes file and command-execution tools over MCP. The main Mastra app connects to it via `MCPClient`. No Docker, no container — runs directly on the host.

This is a separate service, not a module inside `mastra/`. It lives in its own package at `sandbox/`.

## Reference Design

Read first: [`docs/local-sandbox-service-design.md`](../docs/local-sandbox-service-design.md). It defines architecture, tool surface, local provider rules, and the local boundary.

## Where To Work

```text
sandbox/
  package.json
  tsconfig.json
  README.md
  .gitignore
  .env.example
  src/
    index.ts
    server.ts
    provider/
      local-provider.ts
      path-guard.ts
      exec.ts
      background.ts
    tools/
      read-file.ts
      write-file.ts
      edit-file.ts
      list-files.ts
      grep.ts
      exec-command.ts
      exec-background.ts
      check-background.ts
      kill-background.ts
      run-typecheck.ts
      list-skills.ts
      load-skill.ts
  skills/
```

## Configuration

```env
# sandbox/.env
SANDBOX_HTTP_PORT=4311
# Optional override. Defaults to <repo>/sandbox/.workspace via file-anchored
# resolve in sandbox/src/index.ts (so it works under any CWD).
# WORKSPACE_PATH=C:\absolute\path\to\workspace
SANDBOX_COMMAND_TIMEOUT_MS=60000
SANDBOX_ALLOW_NETWORK=false
```

```env
# mastra/.env
SANDBOX_MCP_URL=http://localhost:4311/mcp
```

## Implementation Steps

1. **Scaffold the package.** `sandbox/package.json` with `@mastra/core` (already installed at the repo root via Bun workspaces) and `zod`. Add scripts: `dev` (`bun --watch src/index.ts`) and `start` (`bun src/index.ts`).
2. **Add `sandbox/.gitignore`** with `.workspace/` and `.env`.
3. **Boot Mastra's `MCPServer` over HTTP** in `src/index.ts`, listening on `SANDBOX_HTTP_PORT`. Register every tool in `src/tools/`.
4. **Implement `path-guard.ts`.** Resolves any input path against the workspace root (the resolved `WORKSPACE_PATH ?? <repo>/sandbox/.workspace`), rejects paths that escape the root. Used by every filesystem tool.
5. **Implement `exec.ts`.** Wraps `node:child_process` with `cwd = workspace root`, hard timeout, captured stdout/stderr/exit code.
6. **Implement `local-provider.ts`** against the `SandboxProvider` interface in the design doc.
7. **Implement filesystem tools** (`read-file`, `write-file`, `edit-file`, `list-files`, `grep`) as Mastra tools that call the provider.
8. **Implement command tools** (`exec-command`, `run-typecheck`).
9. **Implement background tools** (`exec-background`, `check-background`, `kill-background`) using an in-memory process registry in `background.ts`.
10. **Implement skill tools** (`list-skills`, `load-skill`) reading from `sandbox/skills/`.
11. **Wire the main app's `MCPClient`** in `mastra/src/mastra/index.ts` to point at `SANDBOX_MCP_URL` and attach those tools to the Implementor agent only.
12. **Smoke test** the two-service flow.

## Smoke Test

In two terminals:

```powershell
# Terminal 1
cd sandbox
bun install
bun run dev
```

```powershell
# Terminal 2
cd mastra
bun run dev
```

Then:

```powershell
curl -X POST http://localhost:4111/chat/implementor-agent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"List files in the workspace, then write a file called hello.txt with the content 'hi', then run node --version.\"}]}"
```

Expected: the Implementor calls `list_files`, `write_file`, and `exec_command` tools served by the sandbox service. The file appears under `sandbox/.workspace/hello.txt`.

## Constraints

- The sandbox service must not import anything from `mastra/`.
- The main app must not import anything from `sandbox/src/`. It only knows the MCP URL and the tool names.
- Tool names must match the surface in the design doc. Do not rename them per-provider.
- No Docker, no `dockerode`, no `docker exec`. If you find yourself adding any of these, you are off the design.

## Reference

- [`docs/local-sandbox-service-design.md`](../docs/local-sandbox-service-design.md) — architecture and rules
- [`phase-3-implementor-agent.md`](phase-3-implementor-agent.md) — the agent that consumes these tools
- [`docs/reference/docker-sandbox-historical.md`](../docs/reference/docker-sandbox-historical.md) — rejected container-based approach (context only)
