# Editing Agent — Setup Guide

Overview of phases and what to set up. See docs for detailed syntax — this guide shows the architecture and checkpoints.

---

## Prerequisites

- **Bun**: [bun.sh](https://bun.sh) — used as the package manager throughout this guide
- **Docker Desktop**: [docs.docker.com](https://docs.docker.com/desktop)
- **LLM API key**: This guide uses [Z.AI (Zhipu/GLM)](https://open.bigmodel.cn) with `zhipu-ai-sdk-provider`. Swap for any [AI SDK provider](https://sdk.vercel.ai) (OpenAI, Anthropic, Google, etc.) if preferred.

---

## Target Structure

```
editing-agent/
├── web/                        ← TanStack Start (port 3000)
│   ├── src/routes/
│   ├── preview/                ← host-side .tsx copies
│   └── package.json
├── mastra/                     ← Mastra server (port 4111)
│   ├── src/
│   │   ├── agents/             ← planner, editor, motion stubs
│   │   ├── sandbox/            ← SandboxSession class
│   │   └── index.ts            ← Mastra + chatRoute
│   └── package.json
├── sandbox/
│   ├── Dockerfile
│   ├── mcp-server/             ← MCP tools (read/edit/exec)
│   ├── remotion-deps/
│   └── skills/                 ← remotion.md, transitions.md, etc.
├── package.json                ← workspaces
└── .env                        ← LLM_API_KEY, DOCKER_IMAGE, SANDBOX_PORT
```

---

## Phase 1 — Monorepo Scaffold

1. Create directories (PowerShell):

    ```powershell
    New-Item -ItemType Directory -Force -Path mastra, sandbox/mcp-server, sandbox/skills
    ```

2. Initialize root `package.json` and define workspaces:

    ```bash
    bun init
    ```

    Then edit `package.json` to look like this:

    ```json
    {
        "name": "editing-agent",
        "private": true,
        "workspaces": ["web", "mastra"],
        "scripts": {
            "dev": "bun run dev:web & bun run dev:mastra",
            "dev:web": "cd web && bun run dev",
            "dev:mastra": "cd mastra && bun run dev",
            "sandbox:build": "docker build -t editing-agent-sandbox ./sandbox"
        }
    }
    ```

    See [Bun workspaces](https://bun.sh/docs/install/workspaces) for details.

3. Scaffold the `web/` workspace using the TanStack Start CLI:

    ```powershell
    bunx @tanstack/cli@latest create web --package-manager bun --no-install --no-git --add-ons shadcn,tanstack-query
    ```

    See [CLI add-on decisions](#tanstack-cli-add-on-decisions) below for why these specific add-ons.

4. Add Remotion and Vercel AI SDK (not available as TanStack add-ons):

    ```powershell
    cd web && bun add remotion @remotion/player @ai-sdk/react && cd ..
    ```

5. Initialize `mastra/` workspace using the Mastra CLI:

    ```powershell
    bunx create-mastra@latest mastra --no-example --llm openai
    ```

    This creates `mastra/` with `src/mastra/` structure, deps, and scripts. No example code, no interactive prompts. Uses OpenAI as the CLI default (ignored — we use the built-in `zai-coding-plan` provider instead).

    After creation, install the Mastra AI SDK adapter (needed for `chatRoute()`):

    ```powershell
    cd mastra && bun add @mastra/ai-sdk@latest && cd ..
    ```

6. Clean up CLI-generated files that conflict with the monorepo:

    ```powershell
    Remove-Item -Recurse -Force web\.git -ErrorAction SilentlyContinue
    Remove-Item -Force mastra\.gitignore -ErrorAction SilentlyContinue
    ```
    also delete the .env.example files if you want.
    
7. Create `.env` at root (the Mastra CLI created `mastra/.env.example` — put your actual key at root):

    ```
    ZHIPU_API_KEY=<your-z.ai-key>
    DOCKER_IMAGE=editing-agent-sandbox
    SANDBOX_PORT=3001
    ```

    Mastra's built-in `zai-coding-plan` provider reads `ZHIPU_API_KEY` automatically. No provider package needed.

8. Run `bun install` from root to link workspaces.

**Checkpoint:** `bun install` succeeds with no workspace errors.

---

## Phase 2 — TanStack Start Frontend

The TanStack Start CLI (Phase 1, step 3) scaffolded the project with shadcn and tanstack-query. Remaining work:

1. Build the 3-panel layout (chat left | Remotion Player center | agent log right) + file tree viewer at the bottom using shadcn components (`ResizablePanelGroup`, `ScrollArea`, `Card`, etc.).

2. Embed Remotion `<Player>` in the center panel for live video preview.

3. Set up `useChat()` from `@ai-sdk/react` (installed in Phase 1 step 4). Point it at:

    ```
    http://localhost:4111/chat/planner-agent
    ```

    This won't connect until Phase 3 (Mastra) is running — but the UI can be built and tested standalone first.

**Checkpoint:** `cd web && bun run dev` → `localhost:3000` renders the 3-panel shell, no errors.

---

## Phase 3 — Mastra Agents

The Mastra CLI (Phase 1, step 5) created a clean `src/mastra/` with a blank `index.ts`. Now add your agents.

1. Create three agent files in `src/mastra/agents/`: `planner.ts`, `editor.ts`, `motion.ts`.
   Each agent uses Mastra's built-in `zai-coding-plan` provider — no extra provider package needed:

    ```ts
    import { Agent } from '@mastra/core/agent'

    export const plannerAgent = new Agent({
      id: 'planner-agent',
      name: 'Planner',
      instructions: `...`,
      model: 'zai-coding-plan/glm-4.7-flash',
      tools: {},
    })
    ```

    Available models (all accessed via `'zai-coding-plan/<model>'`):

    | Model | Notes |
    |---|---|
    | `glm-5.1` | Latest flagship |
    | `glm-5` | Flagship, agent-optimized |
    | `glm-4.7` | High-performance |
    | `glm-4.7-flash` | Fast, good for POC |
    | `glm-4.7-flashx` | Fast extended |
    | `glm-4.6` | Previous-gen flagship |

    See [Mastra Z.AI provider](https://mastra.ai/models/providers/zai-coding-plan) for the full list. Auth uses `ZHIPU_API_KEY` env var (set in Phase 1 step 7).

2. Edit `src/mastra/index.ts` to register the three agents and add `chatRoute()`:

    ```ts
    import { Mastra } from '@mastra/core/mastra';
    import { chatRoute } from '@mastra/ai-sdk';
    import { plannerAgent } from './agents/planner';
    import { editorAgent } from './agents/editor';
    import { motionAgent } from './agents/motion';

    export const mastra = new Mastra({
      agents: { plannerAgent, editorAgent, motionAgent },
      server: {
        apiRoutes: [
          chatRoute({ path: '/chat/:agentId' }),
        ],
      },
    });
    ```

**Checkpoint:** `cd mastra && bun run dev` → starts on `:4111`, agents appear in logs.

---

## Phase 4 — Docker Sandbox

### MCP Server

1. Create `sandbox/mcp-server/` with a TypeScript HTTP server.  
   See [MCP spec](https://spec.modelcontextprotocol.io/) for protocol details.

2. Implement tools:
    - **Read:** `read_file(path, offset?, limit?)`, `list_files(dir)`, `grep(pattern)`
    - **Write:** `edit_file(path, old_string, new_string, replace_all?)`, `create_file(path, content)`
    - **Skills:** `list_skills()`, `load_skill(name)`
    - **Exec:** `run_typecheck()`, `run_render_check()`
    - **Sync:** `get_pending_changes()` (returns diff patches for live preview)

3. Track all edits in a buffer so the host can pull diffs later.

### Skills

Create markdown files in `sandbox/skills/`:

- `remotion.md` — Remotion API reference (useCurrentFrame, spring, AbsoluteFill, etc.)
- `remotion-transitions.md` — TransitionSeries, slide, fade, flip, etc.
- `remotion-audio.md` — Audio, useAudioData, visualizeAudio
- `tailwind.md` — Available Tailwind utilities in Remotion

### Dockerfile

```dockerfile
FROM node:22-slim
RUN apt-get update && apt-get install -y ripgrep git chromium [browser deps]
RUN useradd -m -u 1001 agent
USER agent
WORKDIR /workspace

# Pre-install Remotion deps
COPY sandbox/remotion-deps/package.json /home/agent/deps/
RUN cd /home/agent/deps && npm install --omit=dev
ENV NODE_PATH=/home/agent/deps/node_modules

# Skills + MCP server
COPY sandbox/skills/ /.skills/
COPY sandbox/mcp-server/ /home/agent/mcp-server/
RUN cd /home/agent/mcp-server && npm install --omit=dev && npm run build

EXPOSE 3001
CMD ["node", "/home/agent/mcp-server/index.js"]
```

Build: `bun run sandbox:build`

**Checkpoint:**

```bash
docker run --rm -p 3001:3001 editing-agent-sandbox
# Should log: "MCP server listening on :3001"
# In another terminal: curl http://localhost:3001/ → "ok"
```

---

## Phase 5 — Wire Agents to Sandbox

### SandboxSession (Host)

Create `mastra/src/sandbox/sandbox-session.ts`: Use `dockerode` to spin up containers, `@modelcontextprotocol/sdk` to connect as an MCP client.

```ts
class SandboxSession {
    async start() {
        // docker.createContainer() with resource limits
        // connect MCP client to http://localhost:SANDBOX_PORT/mcp
    }
}
```

### Inject Tools into Agents

In `mastra/src/mastra/index.ts`:

1. `SandboxSession.start()` on init
2. Use `MCPClient` to discover tools from the sandbox
3. Inject those tools into editor/motion agents' `tools` field

**Checkpoint:**

```bash
# Terminal 1
bun run sandbox:build

# Terminal 2 — both servers
bun run dev

# Should log:
# [sandbox] connected on port 3001
# [mastra] sandbox tools loaded: read_file, edit_file, list_files, ...
```

---

## Phase 6 — Smoke Test

1. Open `http://localhost:3000` → 3-panel UI visible
2. Type in chat → streams to planner agent
3. Verify both servers log activity

---

## Fast Setup Commands

If you want to skip the walkthrough and scaffold everything at once:

```powershell
# Create structure (web/ created by TanStack CLI, mastra/ by Mastra CLI)
New-Item -ItemType Directory -Force -Path sandbox/mcp-server, sandbox/skills, sandbox/remotion-deps

# Root setup
New-Item -ItemType File -Force -Path package.json, .env
# (add workspaces, dev scripts, .env vars)

# Web — scaffold with TanStack CLI
bunx @tanstack/cli@latest create web --package-manager bun --no-install --add-ons shadcn,tanstack-query
Remove-Item -Recurse -Force web\.git -ErrorAction SilentlyContinue
cd web && bun add remotion @remotion/player @ai-sdk/react && cd ..

# Mastra — scaffold with Mastra CLI (built-in zai-coding-plan provider, no extra install)
bunx create-mastra@latest mastra --no-example --llm openai
Remove-Item -Force mastra\.gitignore -ErrorAction SilentlyContinue
cd mastra && bun add @mastra/ai-sdk@latest && cd ..

# Root install — links all workspaces
bun install
```

Then proceed with Phase 2 (frontend UI), Phase 3 (replace weather agents with your own), and Phase 4 (sandbox).

---

## What Each Checkpoint Verifies

| Phase | Checkpoint                                   | What it proves                     |
| ----- | -------------------------------------------- | ---------------------------------- |
| 1     | `bun install`                                | Workspace is valid                 |
| 2     | TanStack dev server on `:3000`               | Frontend builds and renders        |
| 3     | Mastra dev server on `:4111`                 | Agents are registered              |
| 4     | Docker container runs & responds to `curl`   | Sandbox is isolated and responsive |
| 5     | Both servers start, logs show "tools loaded" | MCP wiring works end-to-end        |
| 6     | Chat message streams to agent                | Full loop works                    |

---

## Next Steps for Your Team

After this scaffold:

1. Write real agent instructions (start with Editor doing one hardcoded scene)
2. Test `edit_file` → `run_typecheck` → fix errors loop
3. Wire `get_pending_changes` polling in the frontend for live preview sync
4. Add Supabase storage for assets (Phase 5 in main spec)
5. Build out the file explorer UI

---

## TanStack CLI Add-on Decisions

### What we use

| Add-on | Why |
|---|---|
| `shadcn` | Pre-styled components (`ResizablePanelGroup`, `ScrollArea`, `Card`, `Button`) — zero runtime cost, perfect for the 3-panel layout. Sets up `cn()` utility and Tailwind merge. |
| `tanstack-query` | Ideal for polling sandbox status and file changes (`useQuery` with `refetchInterval`), plus devtools for debugging during POC. |

### What we skip and why

| Add-on / Flag | Why skip |
|---|---|
| `ai` | Scaffolds **TanStack AI** (`@tanstack/ai-react`), not Vercel AI SDK. Our chat talks to a Mastra agent backend, not directly to an LLM. We install `@ai-sdk/react` manually. See [TanStack AI assessment](reference/tanstack-ai-assessment.md) for the full analysis. |
| `store` | TanStack Store is alpha. The `ai` add-on depends on it, but since we dropped `ai`, we don't need it. React state + tanstack-query is sufficient for a POC. |
| `eslint` (toolchain) | Unnecessary linting overhead for a POC. If you want zero-config formatting later, use `--toolchain biome`. |
| `--agent` flag | **Not a real flag.** The TanStack CLI docs mention "Agent Usage" for AI coding tools (Cursor, Claude Code) to introspect add-ons — it's not a create command option. |
| `better-auth` | No auth in MVP scope. |
| `convex` | Our backend is Mastra, not Convex. |
| `form` | No form-heavy UI — the chat input handles everything. |

### Flag decisions

| Flag | Decision | Why |
|---|---|---|
| `--no-install` | **Use it** | Bun workspace root handles all installs. Prevents the CLI from running a redundant install inside `web/`. |
| `--package-manager bun` | **Use it** | Consistent with the rest of the monorepo. |
| `--toolchain` | **Omit** | No linting needed for POC. |

---

## LLM Provider Architecture

This project uses **Z.AI (Zhipu/GLM)** models via Mastra's built-in `zai-coding-plan` provider. No extra provider package needed.

### How LLM calls flow

```
Frontend (useChat)  →  HTTP SSE  →  Mastra chatRoute()  →  Agent  →  Z.AI
       ↑                                          ↑
  just HTTP streaming                      LLM provider lives here
  no LLM provider needed                   built-in 'zai-coding-plan' string
```

### Why no `zhipu-ai-sdk-provider` package?

`zhipu-ai-sdk-provider` is a Vercel AI SDK provider — used when calling Z.AI directly through AI SDK. In our architecture, Z.AI is only called **server-side by Mastra agents**. Mastra's built-in `zai-coding-plan` provider handles this internally via its model router (just pass `'zai-coding-plan/glm-4.7-flash'` as a string). The frontend never talks to Z.AI directly — it streams from Mastra's `chatRoute()` via `useChat()`.

| Layer | What it needs | Package |
|---|---|---|
| Mastra agents | `'zai-coding-plan/glm-4.7-flash'` string | Built-in, no install |
| Frontend chat | `useChat()` → Mastra endpoint | `@ai-sdk/react` |

`zhipu-ai-sdk-provider` would only be needed if the frontend called Z.AI directly, which it doesn't.

See [Mastra Z.AI provider](https://mastra.ai/models/providers/zai-coding-plan) for available models and configuration.
