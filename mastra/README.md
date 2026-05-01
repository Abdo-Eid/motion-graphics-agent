# Mastra Server

The `mastra/` workspace runs the backend agent system for Motion Graphics Agent.

Current architecture:

```text
Planner -> Art Director -> Implementor
```

- **Planner**: intake, clarification, brief generation, routing, memory ownership
- **Art Director**: scene-by-scene design and style consistency
- **Implementor**: sandbox-backed code execution, styling, animation, transitions, typecheck loop

## Development

From the repo root:

```bash
bun run dev:mastra
```

Or from `mastra/`:

```bash
bun run dev
```

The Mastra server runs on `http://localhost:4111`.

## Expected Endpoints

With `chatRoute({ path: '/chat/:agentId' })`, the server exposes endpoints such as:

- `POST /chat/planner-agent`
- `POST /chat/art-director-agent`
- `POST /chat/implementor-agent`

## Sandbox Model

This project uses a local Docker sandbox exposed through MCP.

- Planner and Art Director are non-tool agents.
- Implementor is the execution agent that consumes MCP tools.
- The sandbox is expected to provide read/edit/exec-style tools and project skills.

Build the sandbox image from the repo root with:

```bash
bun run sandbox:build
```

## Memory Model

- Planner owns private memory and shared-memory storage.
- Art Director updates shared `styleContext` and scene design data.
- Implementor updates build status, file paths, and error state in shared scene records.

See the repo docs under `../docs/` for the current architecture and implementation details.
