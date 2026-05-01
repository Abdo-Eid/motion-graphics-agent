# Local Sandbox Service Design

## Goal

Run the Implementor's sandbox as a small **local service**, not a container. Anyone cloning this repo should be able to start it with `bun install && bun run dev` — no Docker, no images, no container lifecycle.

The application and the sandbox stay as **two separate services** on the same machine. They talk over a local HTTP MCP transport. The boundary between them is a process boundary, not a container boundary.

## Architecture

```text
┌─────────────────────────┐    MCP / HTTP     ┌──────────────────────────┐
│  Main App (mastra/)     │ ────────────────► │  Sandbox Service         │
│   - Planner             │   localhost:4311  │  (sandbox/, standalone)  │
│   - Art Director        │                   │                          │
│   - Implementor         │                   │  Mastra MCPServer        │
│     └─ MCPClient ───────┼──────────────────►│   exposes tools:         │
│                         │                   │     read_file            │
│                         │                   │     write_file           │
│                         │                   │     edit_file            │
│                         │                   │     list_files / grep    │
│                         │                   │     exec_command         │
│                         │                   │     exec_background      │
│                         │                   │     check_background     │
│                         │                   │     kill_background      │
│                         │                   │     run_typecheck        │
│                         │                   │     list_skills          │
│                         │                   │     load_skill           │
│                         │                   │                          │
│                         │                   │  filesystem provider:    │
│                         │                   │   LocalFilesystem rooted │
│                         │                   │   at SANDBOX_WORKSPACE_DIR
│                         │                   │  exec provider:          │
│                         │                   │   child_process scoped   │
│                         │                   │   to the workspace dir   │
└─────────────────────────┘                   └──────────────────────────┘
        package: mastra/                              package: sandbox/
```

Two `bun run` commands. Two processes. One local machine.

## Why Not Docker

Docker added real cost without paying for itself in this project:

- Setup hassle for new contributors (install Docker Desktop, build the image, manage containers).
- Slower local feedback loop (image rebuilds on dependency changes).
- Debugging required `docker exec` and log inspection.
- The "isolation" Docker offered was weak anyway — shared kernel, not a real security boundary.

For a single-developer, single-machine learning project, a host process plus a path-traversal guard plus command timeouts gives the same practical safety with none of the operational friction. The trade-off is honest: this design does not protect against malicious code escaping to the host. It protects against accidental damage outside the workspace folder. That is the right level for this stage of the project.

## Service Separation

The two services stay separate for clear reasons:

- **Different responsibilities.** The main app does agent reasoning, memory, routing. The sandbox does file operations and process execution.
- **Different lifecycles.** You can restart the sandbox after a crashed long-running process without restarting Mastra or losing chat state.
- **Different dependency surfaces.** The sandbox doesn't need to know about agents, models, or memory. The main app doesn't need to know about `child_process` or filesystem internals.
- **Future swap is easier.** When this is replaced with E2B / Daytona / Modal, only the sandbox service changes — the main app keeps the same `MCPClient` config.

The MCP tool surface is the contract between them. As long as the tool names and shapes stay stable, either side can be rewritten independently.

## MCP vs SDK Note

These solve different layers and should not be confused:

```text
MCP = how the agent calls tools (agent-facing protocol)
SDK = how the sandbox service drives the underlying runtime (provider-facing client)
```

In this design the agent talks to the sandbox over **MCP**. Inside the sandbox service, the local provider uses the Node standard library (`node:fs`, `node:child_process`) — no SDK needed. When a hosted provider (E2B, Daytona, etc.) is plugged in later, the sandbox service swaps its internal provider for that vendor's SDK, but the MCP surface the agent sees stays the same.

## Sandbox Service Layout

```text
sandbox/
  package.json
  tsconfig.json
  README.md
  .gitignore                       # ignores .workspace/
  src/
    index.ts                       # boots Mastra MCPServer over HTTP
    server.ts                      # MCPServer wiring
    provider/
      local-provider.ts            # SandboxProvider implementation
      path-guard.ts                # resolves + asserts paths under root
      exec.ts                      # child_process wrapper with timeout
      background.ts                # background process registry
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
  skills/                          # markdown skill docs
    <skill-name>.md
```

Workspace files live at `SANDBOX_WORKSPACE_DIR` (default `sandbox/.workspace/`), which is `.gitignore`d.

## Configuration

The sandbox service reads its configuration from environment variables.

```env
# sandbox/.env
SANDBOX_HTTP_PORT=4311
SANDBOX_WORKSPACE_DIR=./.workspace
SANDBOX_COMMAND_TIMEOUT_MS=60000
SANDBOX_ALLOW_NETWORK=false
```

The main app points its MCP client at the sandbox.

```env
# mastra/.env
SANDBOX_MCP_URL=http://localhost:4311/mcp
```

## MCP Tool Surface

The agent-facing tool names are generic and provider-neutral. They will not change when the underlying provider changes.

| Tool                | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `read_file`         | Read a file from the workspace                   |
| `write_file`        | Create or overwrite a file in the workspace      |
| `edit_file`         | Apply a targeted edit (oldString / newString)    |
| `list_files`        | List directory contents                          |
| `grep`              | Search file contents by regex                    |
| `exec_command`      | Run a shell command (blocking, timed out)        |
| `exec_background`   | Start a long-running process, return process id  |
| `check_background`  | Poll a background process by id                  |
| `kill_background`   | Terminate a background process by id             |
| `run_typecheck`     | Convenience wrapper around `tsc --noEmit`        |
| `list_skills`       | Enumerate available skill docs                   |
| `load_skill`        | Read a skill markdown by id                      |

Background process state is scoped to the running sandbox service and cleaned up on shutdown.

Provider-specific names are explicitly avoided:

```text
docker_read_file       ✗
docker_exec            ✗
e2b_run_command        ✗
get_pending_changes    ✗
```

## Local Provider

The local provider implements the internal `SandboxProvider` interface using the Node standard library.

```ts
interface SandboxProvider {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  editFile(input: EditFileInput): Promise<void>
  listFiles(path?: string): Promise<FileEntry[]>
  grep(input: GrepInput): Promise<GrepResult[]>
  execCommand(input: CommandInput): Promise<CommandResult>
  execBackground(input: CommandInput): Promise<{ id: string }>
  checkBackground(id: string): Promise<BackgroundStatus>
  killBackground(id: string): Promise<BackgroundStatus>
}
```

Implementation rules:

- Every path is resolved with `path.resolve(root, input)` and rejected if the result does not start with `root`.
- Every command runs with `cwd = root`, a configurable timeout, captured `stdout` and `stderr`, and `exit code`.
- Background processes are registered in an in-memory map keyed by a generated id, with their `stdout`/`stderr` streamed into ring buffers.
- The provider never resolves paths that contain `..` segments, absolute paths, or symlinks pointing outside the root.

## Local Boundary

This is the substitute for "container boundary":

- Workspace is one folder on the host (`SANDBOX_WORKSPACE_DIR`).
- All file operations are path-guarded to that folder.
- All commands run with `cwd` set to that folder.
- Commands have a hard timeout.
- The sandbox service runs as the same OS user as the developer — there is no privilege boundary. This is acceptable for a local dev tool.
- A future `SANDBOX_ALLOW_NETWORK=false` mode can drop network access by running children with appropriate flags / proxies, but is not required for v1.

## Preview Sync

Because workspace files live on the host filesystem, the frontend preview reads them directly. No export step is needed.

```text
sandbox service writes to SANDBOX_WORKSPACE_DIR
  -> frontend preview reads from the same path
  -> Remotion Player reloads on file change
```

This was a real headache in the Docker plan (host had to "pull" files out of the container after each Implementor turn). Removing the container removes the sync problem entirely.

## Agent Rules

The Implementor is written against the MCP tool surface only. It must not learn provider details.

Good:

```text
Use the available sandbox tools to inspect files, make targeted edits, run typecheck, and fix errors until the project is valid.
```

Bad:

```text
Run docker exec ...
Use the local filesystem at C:/...
Call the E2B run command ...
```

Provider details belong in the sandbox service, not in agent instructions.

## Future Provider Swap

When this project moves off the local provider (for example, to E2B or Daytona):

1. Agent instructions stay unchanged.
2. MCP tool names stay unchanged.
3. The main app's `MCPClient` config stays unchanged.
4. Inside the sandbox service, the `LocalProvider` implementation is replaced with a provider that calls the vendor SDK/API.
5. The vendor SDK dependency is added to `sandbox/package.json` only.

```text
Today:
  MCP tools -> SandboxProvider -> LocalProvider -> child_process + node:fs

Later:
  MCP tools -> SandboxProvider -> E2BProvider -> E2B SDK
```

## What Not To Build

- A Dockerfile, docker-compose file, or any container tooling.
- A custom MCP server inside a container.
- A bind-mount-based sync layer between host and container.
- Provider-specific tool names exposed to the agent.
- Vendor SDK clients leaked through tool arguments or responses.

## Implementation Phases

1. Scaffold the `sandbox/` package: `package.json`, `tsconfig.json`, `src/index.ts`.
2. Boot a Mastra `MCPServer` over HTTP on `SANDBOX_HTTP_PORT`.
3. Implement `LocalProvider` with `read_file`, `write_file`, `list_files`, `grep`, `exec_command`.
4. Add path-traversal guard and command timeout.
5. Add `edit_file` (targeted oldString/newString edit).
6. Add background process tools (`exec_background`, `check_background`, `kill_background`).
7. Add `run_typecheck` convenience tool.
8. Add `list_skills` / `load_skill` against `sandbox/skills/`.
9. In `mastra/`, configure an `MCPClient` pointing at `SANDBOX_MCP_URL` and assign these tools only to the Implementor agent.
10. Smoke test the two-service flow: from the main app, list files, write a file, exec `node --version`, run typecheck.

## Final Position

The sandbox is a small local service the Implementor talks to over MCP. It is built directly on Mastra's MCP and workspace primitives. There is no container, no image, no daemon. Setup is `bun install && bun run dev`. The contract between the main app and the sandbox is the MCP tool surface, and that contract is what stays stable when the underlying provider eventually changes.
