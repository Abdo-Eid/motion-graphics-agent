# Motion Graphics Agent Project Overview

## Executive Summary

Motion Graphics Agent is a web app that turns a text prompt into an editable Remotion video project.

You describe the video you want. The system plans the story, designs the scenes, writes the code, checks that it works, and shows a live preview.

The system works in four steps:

```text
Planner -> Art Director -> Implementor -> Preview
```

- **Planner** understands what the user wants and creates a clear brief.
- **Art Director** turns the brief into scene-by-scene creative direction.
- **Implementor** writes the Remotion code based on that direction.
- **Preview** shows the result and supports fast changes.

For users, it feels like a chat-based video editor. For builders, it is a Mastra app with separate agents, shared memory, retrieval, Workspace-backed execution tools, and a live preview.

## Product Vision

Making a product video normally requires writing, design, animation, and frontend skills. Motion Graphics Agent brings that into one guided workflow.

The goal is not just to generate a video once. It is to support an ongoing creative process. The user can say things like:

- "Make a 20-second launch video for my note-taking app."
- "Make the intro feel more energetic."
- "Use the logo I uploaded."
- "Shorten scene two."
- "Fix the issue in the preview."

The system tracks current project state and sends each request to the right part of the pipeline. A small tweak goes straight to code. A creative change goes through design first. A code error goes directly to the Implementor.

## What The Product Does

Motion Graphics Agent helps users create animated videos from text prompts and uploaded files.

It supports:

- Chat-based video creation.
- Asking follow-up questions when details are missing.
- Planning audience, tone, length, assets, and key messages.
- Designing scenes before writing code.
- Generating editable Remotion components.
- A live preview of the current video.
- A file viewer so users can inspect generated code.
- Follow-up edits through natural language.
- Local code execution to verify output before showing it.

The MVP focuses on short product videos and screen recordings. It does not try to solve complex 3D, advanced audio, or long-form editing.

## Architecture Overview

Motion Graphics Agent is organized as a monorepo with two runtime areas:

- Frontend web application.
- Mastra backend agent server.

The Mastra server owns agents, memory, retrieval, uploads, workspace file access, and command execution.

```text
                              User
                               |
                               v
┌─────────────────────────────────────────────────────────────────┐
│                       Frontend Web App                          │
│      Chat      Live Preview      Agent Activity      Files       │
└───────────────────────────────┬─────────────────────────────────┘
                                │ stream / status / uploads
                                v
┌─────────────────────────────────────────────────────────────────┐
│                       Mastra Agent Server                       │
│   Planner ──▶ Art Director ──▶ Implementor                      │
│      │             │              │                             │
│      └──── Memory + Knowledge + Event Bus ─────┐                │
│                                                │                │
│                         Mastra Workspace tools │                │
│                         LocalFilesystem + LocalSandbox          │
└─────────────────────────────────────────────────────────────────┘
```

The frontend never calls the AI model directly. It streams messages and status updates from the backend. The backend owns model calls, agent routing, project state, file access, and verification.

## Terminology

The word "workspace" is overloaded. These are the important meanings:

| Term | What it is | Where it lives |
|---|---|---|
| **Workspace State** | Structured project state (`brief`, `styleContext`, `sceneRegistry`, `assets`). Implemented as Mastra working memory with a zod schema, thread-scoped per project. | `mastra/src/mastra/memory/` |
| **Workspace root** | Filesystem directory for generated Remotion files, uploads, assets, and build outputs. `WORKSPACE_PATH` can override it. Lives at `mastra/.workspace`, tracked by the main repo, auto-reset on each `dev:mastra` start. | `mastra/.workspace` |
| **Mastra Workspace** | Framework feature from `@mastra/core/workspace` that provides file and command tools. The Implementor uses it directly. | `mastra/src/mastra/workspace-config.ts` |

Additionally, "Bun workspaces" is the package-manager concept covering `web/` and `mastra/`.

When you see `memory: { workspace: memory }` in `mastra/src/mastra/index.ts`, the key `workspace` is a Mastra memory registry identifier. It is not `@mastra/core/workspace`.

## System Design Principles

### Separation Of Responsibilities

The Planner, Art Director, and Implementor are kept separate on purpose:

- The Planner handles conversation and decisions. It does not write code.
- The Art Director handles creative design. It does not write code or touch files.
- The Implementor writes and verifies code. It follows the approved design and does not invent new creative direction.

### Editable Output

The system generates Remotion source code, not just a video file. The code can be reviewed, changed, saved to version control, or reused elsewhere.

### Workspace-Backed Execution

Generated code is edited and checked through Mastra Workspace tools inside the Mastra server. Only the Implementor gets file and command tools. Planner and Art Director remain reasoning agents with no direct filesystem access.

### Memory And Retrieval Are Separate

Memory holds current project state. Retrieval holds knowledge from uploaded files, assets, data, and generated artifacts.

Keeping them separate keeps working state clean while still allowing agents to look up facts when needed.

### Iterative Routing

Not every request needs the full pipeline. The Planner reads each follow-up and picks the right route.

For example, "make the title bigger" goes straight to Implementor. "Make the intro feel more premium" goes through Art Director first. "Add a pricing scene" needs a structure/design update before implementation.

## Major Components

### Frontend Web Application

The frontend has four main areas:

- Chat panel.
- Live preview.
- Agent activity panel.
- File viewer.

It only handles display and interaction. It sends messages to Mastra and shows streamed results.

### Backend Agent Server

The backend runs the agents and manages shared state. It is responsible for:

- Hosting Planner, Art Director, and Implementor.
- Persisting Workspace State and conversation context.
- Looking up project knowledge when Planner or Art Director asks.
- Giving Implementor access to Mastra Workspace tools.
- Streaming activity events to the frontend.
- Serving workspace read-through routes for the file viewer and preview.

### Planner Agent

The Planner is the entry point for every user request and the supervisor that dispatches other agents. It creates the plan, asks focused questions, initializes Workspace State, classifies follow-ups, and delegates through `agent-artDirector` / `agent-implementor`.

### Art Director Agent

The Art Director turns the Planner's brief into visual direction. It writes `styleContext` and scene design records into Workspace State. It works in design language, not code.

### Implementor Agent

The Implementor writes and verifies code. It reads scene designs and style context, inspects project files, loads relevant skills, writes Remotion components, runs checks, fixes errors, and reports changed files or blockers naturally.

It is the only agent with file-editing and command tools.

### Delegation

There is no separate orchestration layer. The Planner is a Mastra supervisor agent. It lists Art Director and Implementor under `agents: { ... }`, and Mastra auto-generates one tool per subagent:

- `agent-artDirector`
- `agent-implementor`

Bus emission (`agent.start`, `agent.end`, `agent.error`) lives in the Planner's delegation hooks, not in wrapper code.

For initial generation, the Planner usually calls Art Director once to design the full video, then calls Implementor scene-by-scene.

## Project State Layers

Motion Graphics Agent organizes project state into three project-scoped layers:

1. **Conversation Context** — chat thread plus Mastra Observational Memory.
2. **Workspace State** — structured working memory for brief, style, scene designs, and assets.
3. **Project Knowledge Store** — vector index for large uploaded documents.

There is no cross-session or user-level memory in the MVP.

## Related Docs

- [`docs/architecture.md`](docs/architecture.md) — engineer-facing architecture
- [`docs/project-knowledge-and-skills.md`](docs/project-knowledge-and-skills.md) — state, retrieval, and skills rules
- [`docs/upload-walkthroughs.md`](docs/upload-walkthroughs.md) — upload ingest traces
- [`tasks/T2-planner-agent.md`](tasks/T2-planner-agent.md) — supervisor wiring and delegation hooks
