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
├── web/                        ← Vite + React (port 3000)
│   ├── src/routes/
│   ├── preview/                ← host-side .tsx copies
│   └── package.json
├── mastra/                     ← Mastra server (port 4111)
│   ├── src/
│   │   ├── agents/             ← planner, art-director, implementor stubs
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

## Phase 3 — Mastra Agents

The Mastra CLI in Phase 1 created the `mastra/` workspace. Now build the agent system in four tasks:

### Task breakdown

| Order | Task | File | What to build |
|-------|------|------|---------------|
| 1 | Planner Agent | `tasks/phase-3-planner-agent.md` | Intake, clarification, brief generation, routing |
| 2 | Art Director Agent | `tasks/phase-3-art-director-agent.md` | Scene design, styleContext, sceneRegistry design data |
| 3 | Implementor Agent | `tasks/phase-3-implementor-agent.md` | Remotion code execution, sandbox tools, typecheck loop |
| 4 | Orchestration | `tasks/phase-3-orchestration.md` | Ordering, routing, memory handoff, parallelism |

### Execution order

Tasks 1-3 (agents) can be built in any order since each is self-contained. Task 4 (orchestration) must be done last since it wires the agents together.

Within a running pipeline:

```text
User -> Planner -> Art Director -> Implementor -> Preview
```

For incremental edits the Planner skips unnecessary steps:

- exact tweak -> Implementor directly
- creative change -> Art Director -> Implementor
- major restructure -> full pipeline

### Key structures

- `styleContext` — current visual language, owned by Art Director
- `sceneRegistry` — per-scene design, status, file paths, errors; design owned by Art Director, status/errors owned by Implementor

See [`phase-3-orchestration.md`](../tasks/phase-3-orchestration.md) for full memory handoff diagram, routing table, and parallelism details.

**Checkpoint:**

```bash
bun run dev:mastra
```

Verify all three agents respond:

- `POST /chat/planner-agent`
- `POST /chat/art-director-agent`
- `POST /chat/implementor-agent`

---

## Phase 4 — Docker Sandbox

Build the sandbox image and expose an MCP server from inside the container.

1. Implement the sandbox tool groups:

- read: `read_file`, `list_files`, `grep`
- write: `edit_file`, `create_file`
- skills: `list_skills`, `load_skill`
- verification: `run_typecheck`, `run_render_check`
- execution: `exec_command`, `exec_background`, `check_background`, `kill_background`

`run_typecheck` and `run_render_check` are convenience wrappers built on `exec_command`. The agent sees them as named tools for clarity. The execution tools (`exec_command`, `exec_background`, `check_background`, `kill_background`) are the 4 real implementations.

2. Build the image:

```bash
bun run sandbox:build
```

**Checkpoint:**

```bash
docker run --rm -p 3001:3001 editing-agent-sandbox
```

The container should start the MCP server successfully.

---

## Phase 5 — Wire Implementor to Sandbox

1. Start the sandbox container.
2. Connect the host to the MCP endpoint.
3. Discover tools from the sandbox.
4. Inject those tools into the Implementor.
5. Pull file changes for local preview sync.

At this point, only the Implementor should receive MCP tools. Planner and Art Director remain tool-free.

> **RAG vs Memory note:** At this phase the two knowledge systems come together. **Retrieval (RAG)** handles uploaded project knowledge — docs, parsed data, asset metadata — feeding facts into the working state. **Memory** holds the active working state (brief, `styleContext`, `sceneRegistry`, errors, routing). Only the Implementor uses sandbox MCP tools; Planner and Art Director interact with retrieval and memory through their instructions, not through direct tool access.

**Checkpoint:**

- sandbox reachable on `:3001`
- Mastra reachable on `:4111`
- Implementor can access discovered MCP tools

---

## Phase 6 — End-to-End Smoke Test

1. Start the sandbox image.
2. Start the frontend and Mastra server.
3. Open `http://localhost:3000`.
4. Send a prompt.
5. Confirm the Planner responds and downstream work appears in the activity UI.

---

## What Each Checkpoint Proves

| Phase | Checkpoint | What it proves |
|---|---|---|
| 1 | `bun install` | Workspace is valid |
| 2 | Frontend on `:3000` | UI builds and renders |
| 3 | Mastra on `:4111` | Agents are registered |
| 4 | Sandbox on `:3001` | Docker + MCP boundary works |
| 5 | Implementor sees tools | MCP tool injection works |
| 6 | Prompt flows through system | End-to-end loop works |

---

## Next Steps

After this scaffold:

1. Finalize Planner instructions for briefing and routing.
2. Finalize Art Director instructions for scene design output.
3. Finalize Implementor instructions for code generation and verification.
4. Add file sync from sandbox output to frontend preview files.
5. Expand shared-memory persistence and retrieval.

---

## Related Docs

- [`editing agent.md`](editing%20agent.md)
- [`project-knowledge-and-skills.md`](project-knowledge-and-skills.md)
- [`Building a Local Docker Sandbox for Agentic Apps.md`](Building%20a%20Local%20Docker%20Sandbox%20for%20Agentic%20Apps.md)
