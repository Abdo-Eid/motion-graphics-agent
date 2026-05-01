# Editing Agent — Setup Guide

Overview of phases and what to set up. See docs for detailed syntax — this guide shows the architecture and checkpoints.

---

## Prerequisites

- **Bun**: [bun.sh](https://bun.sh) — used as the package manager throughout this guide.
- **Node.js 22.13+** — required by Mastra.
- **LLM API key**: This guide uses [Z.AI (Zhipu/GLM)](https://open.bigmodel.cn) with Mastra's built-in `zai-coding-plan` provider. Swap for any [AI SDK provider](https://sdk.vercel.ai) (OpenAI, Anthropic, Google, etc.) if preferred.

No Docker required. The sandbox runs as a local Bun process — see [`local-sandbox-service-design.md`](local-sandbox-service-design.md).

---

## Target Structure

```
editing-agent/
├── web/                        ← Vite + React (port 3000)
│   ├── src/routes/
│   ├── preview/                ← host-side .tsx copies
│   └── package.json
├── mastra/                     ← Mastra server (port 4111)
│   ├── src/mastra/
│   │   ├── agents/             ← planner, art-director, implementor
│   │   ├── memory/             ← shared workspace state
│   │   └── index.ts            ← Mastra + chatRoute + MCPClient wiring
│   └── package.json
├── sandbox/                    ← Sandbox service (port 4311)
│   ├── src/
│   │   ├── index.ts            ← MCPServer over HTTP
│   │   ├── provider/           ← LocalProvider (fs + child_process)
│   │   └── tools/              ← read_file, write_file, exec_command, ...
│   ├── skills/                 ← markdown skill docs
│   ├── .workspace/             ← gitignored, generated project files
│   └── package.json
├── package.json                ← Bun workspaces (web, mastra, sandbox)
└── .env                        ← LLM key + service URLs
```

---

## Phase 1 — Monorepo Scaffold

1. Create directories (PowerShell):

    ```powershell
    New-Item -ItemType Directory -Force -Path mastra, sandbox/src, sandbox/skills
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
        "workspaces": ["web", "mastra", "sandbox"],
        "scripts": {
            "dev": "bun run dev:sandbox & bun run dev:mastra & bun run dev:web",
            "dev:web": "cd web && bun run dev",
            "dev:mastra": "cd mastra && bun run dev",
            "dev:sandbox": "cd sandbox && bun run dev"
        }
    }
    ```

    See [Bun workspaces](https://bun.sh/docs/install/workspaces) for details.

3. Scaffold the `web/` workspace using Vite:

    ```powershell
    bunx create-vite@latest web --template react-ts
    ```

4. Add routing, data, styling, Remotion, and Vercel AI SDK dependencies:

    ```powershell
    cd web && bun add @tanstack/react-router @tanstack/react-query @tanstack/router-plugin tailwindcss @tailwindcss/vite remotion @remotion/player @ai-sdk/react && cd ..
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

    Also delete the `.env.example` files if you want.

7. Create `.env` at root:

    ```
    ZHIPU_API_KEY=<your-z.ai-key>
    SANDBOX_MCP_URL=http://localhost:4311/mcp
    ```

    Mastra's built-in `zai-coding-plan` provider reads `ZHIPU_API_KEY` automatically. No provider package needed.

8. Run `bun install` from root to link workspaces.

**Checkpoint:** `bun install` succeeds with no workspace errors.

---

## Phase 2 — Vite + React Frontend

The Vite React scaffold in Phase 1 created the frontend. Remaining work:

1. Build the full-screen layout around four panels:

    - chat
    - Remotion preview
    - agent activity
    - file viewer

2. Stream chat from:

    ```text
    http://localhost:4111/chat/planner-agent
    ```

3. Reflect the current pipeline in the UI:

    - Planner intake and routing
    - Art Director design phase
    - Implementor execution phase

**Checkpoint:**

```bash
bun run dev:web
```

Open `http://localhost:3000` and verify the shell renders.

---

## Phase 3 — Mastra Agents and Backend

The Mastra CLI in Phase 1 created the `mastra/` workspace. Now build the agent system and the backend layers it depends on:

### Task breakdown

| Order | Task | File | What to build |
|-------|------|------|---------------|
| 1 | Memory, Knowledge, Uploads | `tasks/phase-3-memory-knowledge-uploads.md` | Workspace State + LibSQL persistence + conversation summarization + Knowledge Store + upload pipeline |
| 2 | Planner Agent (Supervisor) + Delegation Tools | `tasks/phase-3-planner-agent.md` | Supervisor agent + `delegateToArtDirector`/`delegateToImplementor` tool wrappers + in-process event bus |
| 3 | Art Director Agent | `tasks/phase-3-art-director-agent.md` | Subagent. Scene design, styleContext, sceneRegistry design data |
| 4 | Implementor Agent | `tasks/phase-3-implementor-agent.md` | Subagent. Remotion code execution, sandbox tools, typecheck loop |
| 5 | Sandbox Service | `tasks/phase-3-sandbox-service.md` | Local Bun MCP service exposing file + exec tools |
| 6 | MCP Client + Skills | `tasks/phase-3-mcp-client-and-skills.md` | Wire main app to sandbox; ship v1 skill docs |

> **Architecture note.** The Planner is the supervisor — it dispatches the Art Director and Implementor directly via subagent tools. There is no separate orchestrator. Routing rules live in the Planner's system prompt.

### Execution order

T1 (memory) first — it's the data spine. T3 and T4 (the two subagents) can be built in parallel after T1. T2 (Planner + delegation tools) wires last because it dispatches into T3 and T4 as subagents. T5 (sandbox) is independent and can run alongside everything. T6 (MCP client) needs T5 reachable and attaches sandbox tools to the Implementor.

Within a running pipeline:

```text
User -> Planner -> Art Director -> Implementor -> Preview
```

For incremental edits the Planner delegates only what's needed:

- exact tweak -> `delegateToImplementor` only
- creative change -> `delegateToArtDirector` then `delegateToImplementor`
- major restructure -> full pipeline (all delegation tools)

### Key structures

- `styleContext` — current visual language, owned by Art Director
- `sceneRegistry` — per-scene design, status, file paths, errors; design owned by Art Director, status/errors owned by Implementor

See [`phase-3-planner-agent.md`](../tasks/phase-3-planner-agent.md) for the supervisor agent, delegation-tool wiring, and event-bus details.

**Checkpoint:**

```bash
bun run dev:mastra
```

Verify all three agents respond:

- `POST /chat/planner-agent`
- `POST /chat/art-director-agent`
- `POST /chat/implementor-agent`

---

## Phase 4 — Frontend Integration

Turn the Phase 2 shell into a live surface: activity stream, real file tree, real Remotion preview, upload UI, connection status.

Follow `tasks/phase-4-frontend-integration.md`.

**Checkpoint:** with all three services running, sending a prompt streams events into the activity panel, the file tree populates as the Implementor writes, and the preview plays the generated composition.

---

## Phase 5 — End-to-End Smoke Test

1. Start the sandbox service.
2. Start the frontend and Mastra server.
3. Open `http://localhost:3000`.
4. Send a prompt.
5. Confirm the Planner responds and downstream work appears in the activity UI.

Quickest path with the root script:

```bash
bun run dev
```

This launches sandbox, mastra, and web in parallel.

---

## What Each Checkpoint Proves

| Phase | Checkpoint | What it proves |
|---|---|---|
| 1 | `bun install` | Workspace is valid |
| 2 | Frontend on `:3000` | UI builds and renders |
| 3 | Mastra on `:4111`, sandbox on `:4311`, agents respond, MCP client discovers tools | Backend layers are wired |
| 4 | Activity events stream, file tree + preview live-update | Frontend integration works |
| 5 | Prompt flows through system end-to-end | Full loop works |

---

## Next Steps

After this scaffold:

1. Finalize Planner instructions for briefing and routing.
2. Finalize Art Director instructions for scene design output.
3. Finalize Implementor instructions for code generation and verification.
4. Add file sync from `sandbox/.workspace/` to frontend preview files.
5. Expand shared-memory persistence and retrieval (Workspace State + Knowledge Store).

---

## Related Docs

- [`editing agent.md`](editing%20agent.md)
- [`project-knowledge-and-skills.md`](project-knowledge-and-skills.md)
- [`local-sandbox-service-design.md`](local-sandbox-service-design.md)
- [`reference/docker-sandbox-historical.md`](reference/docker-sandbox-historical.md) — rejected container-based approach (context only)
