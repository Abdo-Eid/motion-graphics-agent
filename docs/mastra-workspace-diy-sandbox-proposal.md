# DIY Sandbox Replaceability Proposal

## Goal

Build the DIY sandbox as an isolated learning project, but keep the main app tool-agnostic so the DIY sandbox can be replaced later with a hosted or provided sandbox with minimal changes.

## Current Decision

For this project, do **not** use Mastra Workspace for now.

Use the MCP sandbox server as the stable abstraction:

```text
Implementor Agent
  -> generic MCP sandbox tools
      -> SandboxProvider interface
          -> DockerSandboxProvider now
          -> hosted provider SDK/API later
```

Keep the Mastra Workspace route in this document only as a reference alternative in case the project changes direction later.

The key decision is where the stable abstraction should live.

There are two acceptable routes, but Route B is the current choice:

- **Route A: Use Mastra Workspace** as the stable abstraction.
- **Route B: Do not use Mastra Workspace** and make the MCP tool server the stable abstraction. This is the current direction.

Both routes can support the same learning goal. The important rule is that the Implementor agent should not depend on Docker-specific names, vendor SDKs, or implementation details.

## MCP vs SDK Note

MCP and SDK solve different layers and should not be confused:

```text
MCP = how the agent calls tools (agent-facing protocol)
SDK = how the host controls a sandbox provider (provider-facing client)
```

Mastra Workspace itself does **not** use MCP to expose tools to the agent. It registers Mastra-native tools directly. Underneath, Workspace providers talk to backends (Docker, E2B, Daytona, Modal, Blaxel, S3, GCS, etc.) through their **SDKs/APIs**.

Mastra also has a separate MCP feature (`MCPClient`, `MCPServer`), but that is unrelated to Workspace. Workspace itself is SDK-based.

In contrast, the route this project is taking exposes tools to the agent through **MCP**, and the MCP server itself uses **SDKs** (or Docker CLI/dockerode) to control the underlying sandbox.

```text
Mastra Workspace path:
Agent -> Mastra-native tools -> Provider via SDK/API

This project's MCP path:
Agent -> MCP tools -> MCP server -> Docker via SDK now / provider SDK later
```

Both routes use SDKs at the provider layer. They differ only at the agent-facing layer.

## Provider SDK Note

Hosted sandbox providers usually expose an SDK or HTTP API. They are not necessarily MCP-based.

Examples:

- E2B is commonly integrated through the E2B SDK/API.
- Daytona is commonly integrated through the Daytona SDK/API.
- Modal is commonly integrated through Modal APIs.
- Novita or similar providers may expose their own SDK/API surface.

MCP is a tool protocol. It can be used to expose sandbox capabilities to agents, but it is not the sandbox provider itself.

Useful mental model:

```text
Provider SDK/API = how the app talks to the sandbox provider
MCP = one possible way to expose tools to an agent
Docker = one possible runtime for the DIY sandbox
```

So a future replacement may look like:

```text
MCP tool server -> E2B SDK
```

or:

```text
Mastra Workspace -> E2BSandbox provider -> E2B SDK
```

The provider may not use MCP internally.

## Shared Target Direction

Use Option 2: the DIY Docker sandbox owns both execution and files.

```text
isolated Docker container
  -> /workspace files
  -> command execution
```

No host bind mount should be required for generated project files. This gives better isolation and better learning value than a local folder mounted into Docker.

## Route A: If Using Mastra Workspace Later

This route is not the current project decision. Keep it as a reference if the project later decides to use Mastra Workspace.

In this route, Mastra Workspace is the public abstraction.

```text
Implementor Agent
  -> Mastra Workspace tools
      -> DockerWorkspaceFilesystem
      -> DockerWorkspaceSandbox
          -> isolated Docker container
```

Later, the Docker implementation can be replaced behind the workspace boundary:

```text
Implementor Agent
  -> Mastra Workspace tools
      -> S3Filesystem / AgentFSFilesystem / provider filesystem
      -> E2BSandbox / DaytonaSandbox / ModalSandbox / provider sandbox
```

The agent should not need to know which provider is active.

### Why Mastra Workspace

Mastra Workspaces already separate the two concerns needed by this project:

- **Filesystem**: read, write, list, delete, copy, move, grep.
- **Sandbox**: command execution and background processes.

When a workspace is assigned to an agent, Mastra exposes the relevant tools automatically. This means the agent can use the same tool shape regardless of whether the underlying provider is local Docker, E2B, Daytona, Modal, Blaxel, or another future provider.

This avoids creating a custom project-specific tool layer that would later need to be rewritten.

### Proposed Structure

```text
mastra/src/mastra/workspaces/
  editing-workspace.ts        # creates the workspace used by the Implementor
  filesystem-factory.ts       # selects filesystem provider from env/config
  sandbox-factory.ts          # selects sandbox provider from env/config

mastra/src/mastra/sandboxes/docker/
  docker-workspace-filesystem.ts
  docker-workspace-sandbox.ts
  docker-container-manager.ts
  docker-process-manager.ts

sandbox/
  Dockerfile
  workspace-template/
  skills/
```

The only code that should know about Docker is the Docker provider implementation.

### Workspace Factory

The app should create the Implementor workspace from one central factory.

```ts
import { Workspace } from '@mastra/core/workspace'

export function createEditingWorkspace() {
  return new Workspace({
    filesystem: createFilesystemProvider(),
    sandbox: createSandboxProvider(),
    skills: ['sandbox/skills'],
  })
}
```

The provider choice should be configuration-driven:

```env
WORKSPACE_FILESYSTEM=docker
WORKSPACE_SANDBOX=docker
```

Later, the same app can switch providers with config changes and small factory changes:

```env
WORKSPACE_FILESYSTEM=s3
WORKSPACE_SANDBOX=e2b
```

### Docker Filesystem Provider

The custom Docker filesystem provider should implement Mastra's workspace filesystem interface and store files inside the container, not in a host bind mount.

Responsibilities:

- Create files inside the container workspace.
- Read files from the container workspace.
- Edit existing files safely.
- List directories.
- Delete files if enabled.
- Run grep inside the container or implement grep through file reads.
- Prevent path traversal outside the sandbox workspace.

The filesystem provider should treat the container workspace as the only visible project root:

```text
/workspace
```

No host project path should be exposed to the agent.

### Docker Sandbox Provider

The custom Docker sandbox provider should implement Mastra's `WorkspaceSandbox` interface.

Responsibilities:

- Start the Docker container.
- Stop or destroy the Docker container.
- Execute commands inside `/workspace`.
- Enforce timeouts.
- Capture stdout, stderr, and exit code.
- Support background processes if needed.
- Return basic sandbox information through `getInfo()`.
- Return provider-neutral instructions through `getInstructions()`.

The instructions should describe behavior, not implementation details:

```text
Commands run inside an isolated workspace. Use workspace file tools to inspect and modify files before running checks.
```

Avoid instructions like:

```text
This uses Docker. Run docker exec...
```

The agent should not reason about Docker.

## Route B: Current Direction Without Mastra Workspace

In this route, MCP becomes the public abstraction. This is acceptable if the project intentionally avoids Mastra Workspace.

```text
Implementor Agent
  -> generic MCP sandbox tools
      -> SandboxProvider interface
          -> DockerSandboxProvider now
          -> E2B / Daytona / Novita / other provider later
```

The MCP server should not be designed as a Docker-specific tool server. It should be designed as a provider-neutral sandbox server.

### MCP Tool Naming

Use generic tool names:

- `read_file`
- `write_file`
- `edit_file`
- `list_files`
- `grep`
- `execute_command`
- `start_process`
- `get_process_output`
- `kill_process`
- `export_files`

Background process support is part of the intended MCP tool surface. It is useful for long-running commands such as preview servers, dev servers, watchers, or render processes that need to be started and polled separately.

Expected behavior:

- `start_process` starts a long-running command and returns a process ID.
- `get_process_output` reads stdout, stderr, exit status, and recent output for that process ID.
- `kill_process` stops the process and returns final or recent output.
- Background process state should be scoped to the current sandbox session.
- Background processes should be cleaned up when the sandbox session is destroyed.

Avoid provider-specific tool names:

- `docker_read_file`
- `docker_exec`
- `mcp_edit_file`
- `e2b_run_command`
- `get_docker_changes`

The agent should learn one stable sandbox tool surface. The tool implementation can change later.

### MCP Server Structure

```text
sandbox/mcp-server/
  index.ts
  tools/
    read-file.ts
    write-file.ts
    edit-file.ts
    execute-command.ts
    start-process.ts
    get-process-output.ts
    kill-process.ts
    export-files.ts
  providers/
    sandbox-provider.ts
    docker-provider.ts
    e2b-provider.ts        # future
    daytona-provider.ts    # future
```

The MCP tools should call an internal provider interface.

```ts
interface SandboxProvider {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  editFile(input: EditFileInput): Promise<void>
  listFiles(path?: string): Promise<FileEntry[]>
  grep(input: GrepInput): Promise<GrepResult[]>
  executeCommand(input: CommandInput): Promise<CommandResult>
  exportFiles?(input: ExportInput): Promise<ExportResult>
}
```

The current provider can use Docker:

```text
MCP tools -> SandboxProvider -> DockerSandboxProvider -> Docker container
```

The future provider can use a vendor SDK:

```text
MCP tools -> SandboxProvider -> E2BSandboxProvider -> E2B SDK/API
```

The agent still calls the same MCP tools.

### MCP Replacement Path

The replacement path should look like this:

1. Keep agent instructions mostly unchanged.
2. Keep MCP tool names unchanged.
3. Replace or add a provider behind `SandboxProvider`.
4. Configure provider selection through env.
5. Add the vendor SDK dependency if needed.

Example configuration:

```env
SANDBOX_PROVIDER=docker
```

Later:

```env
SANDBOX_PROVIDER=e2b
```

This keeps MCP as the stable contract while allowing the implementation to move from Docker to a provider SDK/API.

## Container Boundary

For the learning-focused sandbox, prefer a real container boundary:

- Non-root user.
- Dedicated `/workspace` directory.
- No host bind mount for generated project files.
- CPU and memory limits.
- Command timeouts.
- Network disabled by default, or controlled with an allow-list.
- Clean container per project/session unless persistence is explicitly needed.

This makes the DIY sandbox closer to real remote sandbox providers.

## Preview Sync

Because files live inside the container, the frontend preview cannot rely on a shared host folder.

Add an explicit sync step:

```text
container /workspace
  -> export changed files
  -> host preview directory
  -> Remotion Player reloads
```

The sync mechanism should live outside the agent. The agent should only modify sandbox files and run verification. The app/orchestration layer can pull files after a successful Implementor turn.

Possible approaches:

- Track changed files in the Docker filesystem provider or MCP server.
- Export the whole generated Remotion project after each turn for MVP simplicity.
- Later optimize with a diff/change manifest.

For the first version, exporting the whole generated project is acceptable if the project size is small.

## Agent Rules

The Implementor agent should be written against the chosen stable abstraction only.

If using Mastra Workspace, write the agent against workspace behavior.

If not using Mastra Workspace, write the agent against generic MCP sandbox tools.

Good instruction style:

```text
Use workspace tools to inspect files, make targeted edits, run typecheck, and fix errors until the project is valid.
```

Good instruction style for the MCP route:

```text
Use the available sandbox tools to inspect files, make targeted edits, run typecheck, and fix errors until the project is valid.
```

Avoid provider-specific instruction style:

```text
Call Docker tools to edit files.
Use MCP to fetch pending changes.
Use E2B commands.
```

Only the workspace factory, MCP server, and provider implementations should know which backend is active.

## Workspace Replacement Path

The replacement path should look like this:

1. Keep agent instructions unchanged.
2. Keep orchestration unchanged.
3. Keep preview sync contract mostly unchanged.
4. Replace `createFilesystemProvider()` and `createSandboxProvider()` implementations.
5. Add provider package dependencies if needed.

Example future replacement:

```ts
import { Workspace } from '@mastra/core/workspace'
import { S3Filesystem } from '@mastra/s3'
import { E2BSandbox } from '@mastra/e2b'

export function createEditingWorkspace() {
  return new Workspace({
    mounts: {
      '/workspace': new S3Filesystem({
        bucket: process.env.WORKSPACE_BUCKET!,
        region: process.env.AWS_REGION!,
      }),
    },
    sandbox: new E2BSandbox({
      apiKey: process.env.E2B_API_KEY,
      template: process.env.E2B_TEMPLATE,
    }),
  })
}
```

The exact future provider may differ, but the main rule stays the same: provider-specific code stays behind the Mastra Workspace boundary.

If not using Workspace, use the MCP replacement path described above instead.

## What Not To Build

Do not make the Implementor depend directly on custom tools like:

- `docker_read_file`
- `docker_exec`
- `mcp_edit_file`
- `get_pending_changes`

Do not expose Docker container IDs, host paths, vendor SDK clients, or transport details to the agent.

Do not make the sandbox provider responsible for planning, routing, or creative decisions. It should only provide isolated files and command execution.

## Recommended Implementation Phases With Workspace

1. Create `createEditingWorkspace()` and wire it only to the Implementor agent.
2. Implement `DockerWorkspaceSandbox` with foreground command execution first.
3. Implement `DockerWorkspaceFilesystem` with read, write, list, and grep.
4. Add container lifecycle management.
5. Add command timeouts, memory limits, CPU limits, and non-root user enforcement.
6. Add typecheck/render convenience through normal workspace command execution or agent instructions.
7. Add preview export/sync after Implementor runs.
8. Add background process support only if the preview/dev-server workflow needs it.
9. Add provider factories and env-driven selection.

## Recommended Implementation Phases Without Workspace

1. Define the generic MCP tool surface.
2. Define the internal `SandboxProvider` interface.
3. Implement `DockerSandboxProvider` with read, write, list, grep, and foreground command execution.
4. Add container lifecycle management.
5. Add command timeouts, memory limits, CPU limits, and non-root user enforcement.
6. Add preview export/sync outside the agent.
7. Implement background process support with `start_process`, `get_process_output`, and `kill_process`.
8. Add provider selection through env.
9. Later add provider implementations that call hosted provider SDKs/APIs.

## Final Position

Build the DIY sandbox deeply enough to learn real isolation, but keep implementation details invisible to the agent.

If using Mastra Workspace, Workspace should be the stable boundary.

If not using Mastra Workspace, the generic MCP tool server should be the stable boundary.

In both cases, Docker is only the first provider behind that boundary, and future hosted providers will usually be integrated through their SDKs/APIs.
