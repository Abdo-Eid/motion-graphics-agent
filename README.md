# Editing Agent

A multi-agent system for turning user prompts into editable Remotion code with a live preview.

The current architecture is a 3-agent pipeline:

```text
Planner -> Art Director -> Implementor
```

- **Planner** handles intake, clarification, memory, and routing.
- **Art Director** turns the brief into scene-by-scene creative direction.
- **Implementor** uses sandbox tools to write Remotion code, styling, animations, and transitions in one pass.

The frontend provides chat, preview, activity, and file inspection. The backend runs Mastra agents. Code execution happens inside a local Docker sandbox exposed through MCP tools.

## How It Works

1. The user describes a video goal.
2. The **Planner** asks clarifying questions if needed and produces a structured brief.
3. The **Art Director** converts that brief into scene designs and updates shared style context.
4. The **Implementor** reads the scene designs, writes Remotion code in the sandbox, runs typecheck checks, and fixes errors.
5. The frontend syncs the generated files for a live Remotion preview.

For small follow-up edits, the Planner can route directly to the Implementor instead of re-running the full pipeline.

## Architecture

```text
User (chat)
  |
  v
TanStack Start (:3000)          Mastra Server (:4111)
|- Chat panel                   |- Planner agent
|- Remotion <Player>            |- Art Director agent
|- Agent activity log           |- Implementor agent
`- File tree viewer             `- Shared/private memory
                                     |
                                     v
                            Docker Sandbox (:3001)
                            |- MCP server (read/edit/exec tools)
                            |- Remotion project scaffold
                            `- Skills (.skills/*.md)
```

- **Frontend** streams from Mastra with `useChat()`. It does not call an LLM directly.
- **Mastra** owns agent orchestration, routing, and memory.
- **Docker + MCP** is the execution boundary for file reads, edits, and verification.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | TanStack Start, React, Tailwind CSS v4 |
| Video Preview | Remotion, `@remotion/player` |
| Chat | `@ai-sdk/react` streaming from Mastra |
| Agent Framework | Mastra (`@mastra/core`, `@mastra/ai-sdk`) |
| Memory | `@mastra/memory`, `@mastra/libsql` |
| Sandbox | Local Docker container with MCP server |
| Package Manager | Bun workspaces |

## Project Structure

```text
editing-agent/
|- web/                        TanStack Start frontend
|  |- src/routes/              App routes
|  |- src/components/          UI components
|  `- README.md                Frontend-specific notes
|- mastra/                     Mastra server
|  |- src/mastra/
|  |  |- agents/               planner, art-director, implementor
|  |  `- index.ts              Mastra registration
|  `- README.md                Backend-specific notes
|- sandbox/                    Local Docker sandbox
|  |- Dockerfile
|  |- mcp-server/
|  `- skills/
|- docs/
|  |- reference/
|  |  `- multi-agent-architecture.md
|  |- SETUP_GUIDE.md
|  |- editing agent.md
|  |- project-knowledge-and-skills.md
|  `- reference/
`- tasks/
   |- phase-2-frontend.md
   |- phase-3-planner-agent.md
   |- phase-3-art-director-agent.md
   `- phase-3-implementor-agent.md
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- [Docker Desktop](https://docs.docker.com/desktop)
- Z.AI API key for Mastra (`ZHIPU_API_KEY`)

### Environment

Create `.env` at the repo root:

```env
ZHIPU_API_KEY=<your-key>
DOCKER_IMAGE=editing-agent-sandbox
SANDBOX_PORT=3001
```

### Development

```bash
bun install
bun run sandbox:build
bun run dev
```

Useful commands:

```bash
bun run dev:web
bun run dev:mastra
bun run sandbox:build
```

## Documentation

| Document | Description |
|---|---|
| [`docs/reference/multi-agent-architecture.md`](docs/reference/multi-agent-architecture.md) | Architecture decision doc for the Planner / Art Director / Implementor split |
| [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) | Phase-by-phase setup and implementation checkpoints |
| [`docs/editing agent.md`](docs/editing%20agent.md) | Product and system overview aligned to the current architecture |
| [`docs/project-knowledge-and-skills.md`](docs/project-knowledge-and-skills.md) | Project knowledge routing, retrieval, uploads, and staged skill loading |
| [`docs/Building a Local Docker Sandbox for Agentic Apps.md`](docs/Building%20a%20Local%20Docker%20Sandbox%20for%20Agentic%20Apps.md) | Local Docker + MCP sandbox design |

## Status

`docs/reference/multi-agent-architecture.md` is kept as the architecture decision record.

`docs/reference/` contains historical and external reference material and is intentionally left unchanged.

## License

Private. All rights reserved.
