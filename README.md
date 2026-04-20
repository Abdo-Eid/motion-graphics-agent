# Editing Agent

A multi-agent system where AI agents write real Remotion (React) code inside a sandboxed environment, iterate with compiler feedback, and produce motion-graphics videos with a live-updating preview.

Users interact through a chat interface. Agents interpret intent, write TypeScript/Remotion compositions, and the frontend hot-reloads a live video preview as code changes.

## How It Works

1. The user describes a video: *"Make a 30-second product demo highlighting these features"*
2. The **Planner** agent builds a structured scene plan
3. The **Editor** agent writes Remotion `.tsx` composition files inside a Docker sandbox
4. The **Motion** agent adds animations, transitions, and effects
5. A TypeScript compiler feedback loop ensures the code is valid at every step
6. The frontend renders a live-updating Remotion Player preview

The output is editable TypeScript/Remotion code, not a rendered video file. It can be re-run, modified, or extended.

## Architecture

```
User (chat)
  │
  ▼
TanStack Start (:3000)          Mastra Server (:4111)
├── Chat panel                  ├── Planner agent (memory + semantic recall)
├── Remotion <Player>           ├── Editor agent (sandbox tools)
├── Agent activity log          ├── Motion agent (sandbox tools)
└── File tree viewer            └── Docker Sandbox (:3001)
                                    ├── MCP server (read/edit/exec tools)
                                    ├── Remotion project scaffold
                                    └── Skills (remotion.md, transitions.md)
```

- **Frontend** streams from Mastra via `useChat()` (SSE). Never calls the LLM directly.
- **Mastra** handles all agent orchestration, memory, and LLM calls server-side using Z.AI (GLM) models.
- **Docker sandbox** isolates agent file operations. Agents read, write, and typecheck code through MCP tools.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | TanStack Start, React, Tailwind CSS v4, shadcn/ui |
| Video Preview | Remotion, `@remotion/player` |
| Chat | `@ai-sdk/react` (`useChat`) streaming from Mastra |
| Agent Framework | Mastra (`@mastra/core`, `@mastra/ai-sdk`) |
| LLM | Z.AI / GLM via Mastra built-in provider |
| Memory | `@mastra/memory` (working memory, semantic recall), LibSQL storage |
| Sandbox | Docker container with MCP server (read/edit/exec tools) |
| Package Manager | Bun (workspaces) |

## Project Structure

```
editing-agent/
├── web/                        TanStack Start frontend (port 3000)
│   ├── src/routes/             File-based routing
│   ├── src/components/         UI components (chat, player, panels)
│   └── preview/                Remotion compositions (synced from sandbox)
├── mastra/                     Mastra agent server (port 4111)
│   └── src/mastra/
│       ├── agents/             planner.ts, editor.ts, motion.ts
│       ├── sandbox/            SandboxSession (Docker + MCP client)
│       └── index.ts            Mastra + chatRoute registration
├── sandbox/
│   ├── Dockerfile              Container definition
│   ├── mcp-server/             MCP tools (read/edit/exec/skills)
│   ├── remotion-deps/          Pre-installed Remotion dependencies
│   └── skills/                 remotion.md, transitions.md, etc.
├── docs/                       Documentation
│   ├── SETUP_GUIDE.md          Phase-by-phase setup walkthrough
│   ├── editing agent.md        Full architecture and concept doc
│   ├── memory-and-rag.md       Memory and RAG functional spec
│   └── reference/              Deep technical reference docs
└── package.json                Bun workspaces (web, mastra)
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- [Docker Desktop](https://docs.docker.com/desktop)
- Z.AI Coding plan API key from

### Setup

Create a `.env` file at the project root:

```
ZHIPU_API_KEY=<your-key>
DOCKER_IMAGE=editing-agent-sandbox
SANDBOX_PORT=3001
```

```bash
# Install all workspace dependencies
bun install

# Start both servers
bun run dev

# Build the Docker sandbox
bun run sandbox:build
```

### Development

```bash
bun run dev:web          # Frontend only (localhost:3000)
bun run dev:mastra       # Agent server only (localhost:4111)
bun run sandbox:build    # Build/rebuild the Docker sandbox
```

## Documentation

| Document | Description |
|---|---|
| [`docs/editing agent.md`](docs/editing agent.md) | Full architecture, agent design, and concept |
| [`docs/Building a Local Docker Sandbox for Agentic Apps.md`](docs/Building a Local Docker Sandbox for Agentic Apps.md) | Docker sandbox design rationale |
| [`docs/memory-and-rag.md`](docs/memory-and-rag.md) | How memory and RAG function in the system |

## License

Private. All rights reserved.
