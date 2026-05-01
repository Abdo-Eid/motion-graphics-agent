# Editing Agent

A multi-agent system for turning user prompts into editable Remotion code with a live preview.

The architecture is a supervisor + two subagents:

```text
Planner (supervisor) ──▶ delegateToArtDirector ──▶ Art Director
                    └──▶ delegateToImplementor ──▶ Implementor
```

- **Planner** owns the user conversation, classifies intent, produces the brief, **and dispatches** the other agents through subagent tools.
- **Art Director** (subagent) turns the brief into scene-by-scene creative direction.
- **Implementor** (subagent) uses sandbox tools to write Remotion code, styling, animations, and transitions in one pass.

There is no separate orchestration layer — the routing rules live in the Planner's system prompt. The frontend provides chat, preview, activity, and file inspection. The backend runs Mastra agents. Code execution happens in a local Bun sandbox process exposed through MCP/HTTP — no Docker.

## How It Works

1. The user describes a video goal.
2. The **Planner** asks clarifying questions if needed, produces a structured brief, and decides how to delegate.
3. For creative or structural work the Planner calls `delegateToArtDirector`, which produces scene designs and updates shared style context.
4. The Planner then calls `delegateToImplementor` (per scene, optionally in parallel). The Implementor reads scene designs, writes Remotion code in the sandbox, runs typecheck, and fixes errors.
5. The frontend syncs the generated files for a live Remotion preview.

For small follow-up edits, the Planner skips the Art Director and calls the Implementor directly.

## Architecture

```text
User (chat)
  |
  v
Vite + React (:3000)            Mastra Server (:4111)
|- Chat panel                   |- Planner (supervisor)
|- Remotion <Player>            |- Art Director (subagent)
|- Agent activity log           |- Implementor (subagent)
`- File tree viewer             `- Memory + Knowledge + Event bus
                                     |
                                     v
                            Sandbox Service (:4311)
                            |- Local Bun process
                            |- MCP server over HTTP (read/edit/exec tools)
                            |- Remotion project scaffold (.workspace/)
                            `- Skills (skills/*.md)
```

- **Frontend** streams from Mastra with `useChat()`. It does not call an LLM directly.
- **Mastra** hosts the agents, memory, and the event bus. Dispatch happens inside the Planner via subagent tool calls.
- **Sandbox + MCP** is the execution boundary for file reads, edits, and verification — a separate Bun process, no Docker.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite, React, Tailwind CSS v4 |
| Video Preview | Remotion, `@remotion/player` |
| Chat | `@ai-sdk/react` streaming from Mastra |
| Agent Framework | Mastra (`@mastra/core`, `@mastra/ai-sdk`) |
| Memory | `@mastra/memory`, `@mastra/libsql` |
| Sandbox | Local Bun process with MCP server (HTTP) |
| Package Manager | Bun workspaces |

## Project Structure

```text
editing-agent/
|- web/                        Vite + React frontend
|  |- src/routes/              App routes
|  |- src/components/          UI components
|  `- README.md                Frontend-specific notes
|- mastra/                     Mastra server
|  |- src/mastra/
|  |  |- agents/               planner, art-director, implementor
|  |  `- index.ts              Mastra registration
|  `- README.md                Backend-specific notes
|- sandbox/                    Local Bun sandbox service
|  |- src/
|  |  |- index.ts              MCPServer over HTTP
|  |  |- provider/             LocalProvider (fs + child_process)
|  |  `- tools/                read_file, write_file, exec_command, ...
|  |- .workspace/              gitignored, generated project files
|  `- skills/                  markdown skill docs
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
- Node.js 22.13+ (Mastra requirement)
- Z.AI API key for Mastra (`ZHIPU_API_KEY`)

No Docker required.

### Environment

Create `.env` at the repo root:

```env
ZHIPU_API_KEY=<your-key>
SANDBOX_MCP_URL=http://localhost:4311/mcp
```

### Development

```bash
bun install
bun run dev
```

Useful commands:

```bash
bun run dev:web      # http://localhost:3000
bun run dev:mastra   # http://localhost:4111
bun run dev:sandbox  # http://localhost:4311
```

## Documentation

| Document | Description |
|---|---|
| [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) | Product vision, architecture, agent responsibilities |
| [`AGENTS.md`](AGENTS.md) | Rules for AI coding agents working in this repo |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Task board, dependency graph, suggested allocation |
| [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) | Phase-by-phase setup and implementation checkpoints |
| [`docs/editing agent.md`](docs/editing%20agent.md) | Architecture details, routing rules, memory structures |
| [`docs/project-knowledge-and-skills.md`](docs/project-knowledge-and-skills.md) | Project knowledge routing, retrieval, uploads, and staged skill loading |
| [`docs/local-sandbox-service-design.md`](docs/local-sandbox-service-design.md) | Local Bun sandbox + MCP design (no Docker) |

## Status

Phase 1 (monorepo scaffold) and Phase 2 (frontend shell, static) are done. Phase 3 (backend) is in progress — see `CONTRIBUTING.md`.

`docs/reference/` contains historical and external reference material and is intentionally frozen.

## License

Private. All rights reserved.
