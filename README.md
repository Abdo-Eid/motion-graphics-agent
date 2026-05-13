# Motion Graphics Agent

A multi-agent system for turning user prompts into editable Remotion code with a live preview.

The architecture is a supervisor + two subagents:

```text
Planner (supervisor) ──▶ agent-artDirector ──▶ Art Director
                    └──▶ agent-implementor ──▶ Implementor
```

- **Planner** owns the user conversation, classifies intent, produces the brief, **and dispatches** the other agents through subagent tools.
- **Art Director** (subagent) turns the brief into scene-by-scene creative direction.
- **Implementor** (subagent) uses sandbox tools to write Remotion code, styling, animations, and transitions in one pass.

There is no separate orchestration layer — the routing rules live in the Planner's system prompt. The frontend provides chat, preview, activity, and file inspection. The backend runs Mastra agents. Code execution happens in a local Bun sandbox process exposed through MCP/HTTP — no Docker.

## How It Works

1. The user describes a video goal.
2. The **Planner** asks clarifying questions if needed, produces a structured brief, and decides how to delegate.
3. For creative or structural work the Planner calls `agent-artDirector`, which produces scene designs and updates shared style context.
4. The Planner then calls `agent-implementor` (per scene, optionally in parallel via Mastra's parallel tool calls). The Implementor reads scene designs, writes Remotion code in the sandbox, runs typecheck, and fixes errors.
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

Vite + React frontend, Mastra agent server, local Bun sandbox over MCP/HTTP, LibSQL persistence, Remotion preview. For the canonical tech stack table with doc links, see [`AGENTS.md`](AGENTS.md#tech-stack-quick-reference).

## Project Structure

```text
motion-graphics-agent/
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
|  |- architecture.md
|  |- SETUP_GUIDE.md
|  |- local-sandbox-service-design.md
|  |- project-knowledge-and-skills.md
|  |- upload-walkthroughs.md
|  |- learning/
|  `- reference/                Historical / external reference material
`- tasks/
   |- phase-2-frontend.md
   |- T2-planner-agent.md
   |- T3-art-director-agent.md
   `- T4-implementor-agent.md
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- Node.js 22.13+ (Mastra requirement)
- An API key for an [AI SDK provider](https://sdk.vercel.ai) reachable via Mastra's [model router](https://mastra.ai/models)

No Docker required.

### Environment

Create `.env` at the repo root:

```env
AZURE_RESOURCE_NAME=<azure-resource-name>
AZURE_API_KEY=<azure-resource-key>
AZURE_API_VERSION=preview
AZURE_CHAT_DEPLOYMENT=<chat-deployment-name>
AZURE_EMBEDDING_DEPLOYMENT=<embedding-deployment-name>
SANDBOX_MCP_URL=http://localhost:4311/mcp
SANDBOX_HTTP_PORT=4311
# Optional. Defaults to <repo>/sandbox/.workspace.
# WORKSPACE_PATH=C:\absolute\path\to\workspace
```

The LibSQL DB path is **not** an env var — both Memory and the Knowledge Store pin `file:./mastra.db` (resolves to `mastra/mastra.db`).

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

| Document                                                                       | Description                                                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md)                                   | Product vision, architecture, agent responsibilities                                      |
| [`AGENTS.md`](AGENTS.md)                                                       | Rules for AI coding agents working in this repo                                           |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                                           | Task board, dependency graph, suggested allocation                                        |
| [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md)                                   | Phase-by-phase setup and implementation checkpoints                                       |
| [`docs/architecture.md`](docs/architecture.md)                                 | Architecture details, routing rules, memory structures                                    |
| [`docs/project-knowledge-and-skills.md`](docs/project-knowledge-and-skills.md) | State-layer principles, retrieval rules, agent responsibilities, and staged skill loading |
| [`docs/upload-walkthroughs.md`](docs/upload-walkthroughs.md)                   | End-to-end ingest traces per file type (PDF, CSV, image, font)                            |
| [`docs/local-sandbox-service-design.md`](docs/local-sandbox-service-design.md) | Local Bun sandbox + MCP design (no Docker)                                                |

## Status

Phase 1 (monorepo scaffold) and Phase 2 (frontend shell, static) are done. Phase 3 (backend) is in progress — see `CONTRIBUTING.md`.

`docs/reference/` contains historical and external reference material and is intentionally frozen.

## License

Private. All rights reserved.
