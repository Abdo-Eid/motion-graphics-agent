# Motion Graphics Agent

A multi-agent system for turning user prompts into editable Remotion code with a live preview.

The architecture is a Mastra supervisor plus two subagents:

```text
Planner (supervisor) ──▶ agent-artDirector ──▶ Art Director
                    └──▶ agent-implementor ──▶ Implementor
```

- **Planner** owns the user conversation, classifies intent, produces the brief, and dispatches the other agents through subagent tools.
- **Art Director** turns the brief into scene-by-scene creative direction.
- **Implementor** uses Mastra Workspace tools to write Remotion code, styling, animations, and transitions.

There is no separate orchestration layer and no second execution service. The routing rules live in the Planner's system prompt. The frontend provides chat, preview, activity, and file inspection. The Mastra server owns agents, memory, uploads, workspace tools, and generated project files.

## How It Works

1. The user describes a video goal.
2. The Planner asks clarifying questions if needed, produces a structured brief, and decides how to delegate.
3. For creative or structural work the Planner calls `agent-artDirector`, which produces scene designs and updates shared style context.
4. The Planner then calls `agent-implementor`. The Implementor reads scene designs, writes Remotion code through Mastra Workspace tools, runs checks, and fixes errors.
5. The frontend reads workspace files through Mastra routes and reloads the preview when files change.

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
`- File tree viewer             |- Memory + Knowledge + Event bus
                                 `- Mastra Workspace tools
                                      |- LocalFilesystem
                                      |- LocalSandbox
                                      `- .workspace/
```

- **Frontend** streams from Mastra and never calls an LLM directly.
- **Mastra** hosts the agents, memory, uploads, event bus, workspace routes, and execution tools.
- **Mastra Workspace** is the execution layer for file reads, edits, grep/search, and command execution. Only the Implementor gets those tools.

## Tech Stack

Vite + React frontend, Mastra agent server, Mastra Workspace tools, LibSQL persistence, Remotion preview, Bun workspaces. For the canonical tech stack table with doc links, see [`AGENTS.md`](AGENTS.md#tech-stack-quick-reference).

## Project Structure

```text
motion-graphics-agent/
|- web/                        Vite + React frontend
|  |- src/components/          UI components
|  `- README.md                Frontend-specific notes
|- mastra/                     Mastra server
|  |- src/mastra/
|  |  |- agents/               planner, art-director, implementor
|  |  |- memory/               Workspace State
|  |  |- uploads/              upload route + handlers
|  |  `- index.ts              Mastra registration
|  |- .workspace/              Remotion project (tracked, auto-reset on dev)
|  `- README.md                Backend-specific notes
|- docs/
|  |- architecture.md
|  |- project-knowledge-and-skills.md
|  `- upload-walkthroughs.md
`- tasks/
   |- T1-memory-knowledge-uploads.md
   |- T2-planner-agent.md
   |- T3-art-director-agent.md
   |- T4-implementor-agent.md
   |- T5-workspace-tools-and-skills.md
   `- phase-4-frontend-integration.md
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- Node.js 22.13+ (Mastra requirement)
- Azure OpenAI environment variables used by `mastra/src/mastra/model.ts`

No Docker and no second execution process are required.

### Environment

Copy `.env.example` to `.env` at the repo root and fill in the empty values.

The LibSQL DB path is not an env var. Memory and the Knowledge Store pin `file:./mastra.db`, which resolves to `mastra/mastra.db` when Mastra runs from the `mastra/` workspace.

`WORKSPACE_PATH` is optional. If unset, generated files live under the Mastra workspace's default local `.workspace` directory.

### Development

```bash
bun install
bun run dev
```

Useful commands:

```bash
bun run dev:web      # http://localhost:3000
bun run dev:mastra   # http://localhost:4111
```

## Documentation

| Document | Description |
|---|---|
| [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) | Product vision, architecture, agent responsibilities |
| [`AGENTS.md`](AGENTS.md) | Rules for AI coding agents working in this repo |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Task board, dependency graph, suggested allocation |
| [`docs/architecture.md`](docs/architecture.md) | Architecture details, routing rules, memory structures |
| [`docs/project-knowledge-and-skills.md`](docs/project-knowledge-and-skills.md) | State-layer principles, retrieval rules, agent responsibilities, and staged skill loading |
| [`docs/upload-walkthroughs.md`](docs/upload-walkthroughs.md) | End-to-end ingest traces per file type |

## Status

The backend agent baseline is in place with a working preview pipeline. The Mastra server runs under Bun, bundles Remotion scenes via `Bun.build`, and serves them to the frontend through an iframe-based Player. Tailwind CSS is loaded via CDN in the preview. Each `dev:mastra` start resets `.workspace/` to the committed baseline (`1483557`) so every session begins clean.

## License

Private. All rights reserved.
