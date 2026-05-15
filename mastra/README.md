# Mastra Server

The `mastra/` workspace runs the backend agent system for Motion Graphics Agent.

Current architecture:

```text
Planner -> Art Director -> Implementor
```

- **Planner**: intake, clarification, brief generation, routing, memory ownership.
- **Art Director**: scene-by-scene design and style consistency.
- **Implementor**: Workspace-backed code execution, styling, animation, transitions, typecheck loop.

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

The server exposes agent endpoints such as:

- `POST /chat/planner-agent`
- `POST /chat/art-director-agent`
- `POST /chat/implementor-agent`

It also owns upload, event-stream, and workspace read-through routes as those phases land.

## Workspace Tools

This project uses Mastra Workspace inside the Mastra server for local file and command tools.

- Planner and Art Director do not receive filesystem or command tools.
- Implementor is the only execution agent.
- Generated files live under the configured workspace root.
- `WORKSPACE_PATH` can override the workspace root for development or tests.

## Memory Model

- Planner owns the brief.
- Art Director updates `styleContext` and scene design data.
- Implementor reads shared scene records and writes generated files through Workspace tools.

See the repo docs under `../docs/` for current architecture and implementation details.
