# Editing Agent Project Overview

## Executive Summary

Editing Agent is a web app that turns a text prompt into a video project you can edit.

You describe the video you want. The system plans the story, designs the scenes, writes the code, checks that it works, and shows you a live preview.

It is built for short product videos, demos, explainer clips, and screen recordings.

The output is not just a video file. It is real TypeScript and Remotion source code. That means the video can be opened, changed, saved to version control, and improved over time.

The system works in four steps:

```text
Planner -> Art Director -> Implementor -> Preview
```

- **Planner** — understands what the user wants and creates a clear brief.
- **Art Director** — turns the brief into scene-by-scene creative direction.
- **Implementor** — writes the Remotion code based on that direction.
- **Preview** — shows the result and supports fast changes.

For users, it feels like a chat-based video editor. For builders, it is a clear system with separate agents, shared memory, a retrieval layer, a sandboxed code runner, and a live preview.

## Product Vision

Making a product video normally requires writing, design, animation, and frontend skills. Editing Agent brings all of that into one guided workflow.

The goal is not just to generate a video once. It is to support an ongoing creative process. The user can say things like:

- "Make a 20-second launch video for my note-taking app."
- "Make the intro feel more energetic."
- "Use the logo I uploaded."
- "Shorten scene two."
- "Fix the issue in the preview."

The system tracks the current project state and sends each request to the right part of the pipeline. A small tweak goes straight to code. A creative change goes through design first. A code error goes directly to the implementor to fix.

## What The Product Does

Editing Agent helps users create animated videos from text prompts and uploaded files.

It supports:

- Chat-based video creation.
- Asking follow-up questions when details are missing.
- Planning the audience, tone, length, assets, and key messages.
- Designing scenes before writing any code.
- Generating editable Remotion components.
- A live preview of the current video.
- A file viewer so users can inspect the generated code.
- Follow-up edits through natural language.
- Sandboxed code execution to verify the output before showing it.

The MVP focuses on short product videos and screen recordings. It does not try to solve complex 3D, advanced audio, or long-form editing.

## Product Users

Editing Agent is built for people who need to create product videos but do not want to learn animation code or Remotion.

Users should be able to describe the video, upload brand materials, review the preview, and ask for changes — all in plain language. They do not need to know how the system works under the hood.

Typical users:

- Startup founders making launch videos.
- Product marketers making feature demos.
- Designers exploring motion ideas.
- Educators or technical writers making short explainer videos.

## Technical Stakeholders And Builders

The product is aimed at non-technical users, but developers and architects are also an important audience — they will build, maintain, and extend the system.

The key point for technical readers: Editing Agent is not a black box. It produces editable source code, keeps planning and design separate from implementation, runs generated code inside a sandbox, and tracks project state explicitly.

Use this document to understand:

- How the user workflow maps to backend agents.
- Where each step — planning, design, implementation, verification, preview — happens.
- Which component owns which responsibility.
- How to extend the system without merging everything into one agent.

## Architecture Overview

Editing Agent is organized as a monorepo with three major runtime areas:

- Frontend web application.
- Backend agent server.
- Local sandbox service for code execution and verification (a separate Bun process, no Docker).

The architecture separates user experience, agent reasoning, and code execution into different layers. This keeps responsibilities clear and reduces risk.

```
                              ┌─────────────────────────────────────────────┐
                              │                   User                      │
                              └───────────────────────┬─────────────────────┘
                                                      │ prompt / files
                                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Frontend Web App                                   │
│    ┌────────────┐   ┌──────────────┐   ┌─────────────────┐   ┌───────────┐  │
│    │    Chat    │   │ Live Preview │   │ Agent Activity  │   │   Files   │  │
│   └ ────────────┘   └──────────────┘   └─────────────────┘   └───────────┘  │
└───────────────────────────────────────────┬─────────────────────────────────┘
                                            │ stream / status
                                            ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        Backend Agent Server                                │
│   ┌─────────┐      ┌──────────────┐      ┌─────────────┐                   │
│   │ Planner │────▶│ Art Director │─────▶│ Implementor │                   │
│   └─────────┘      └──────────────┘      └─────────────┘                   │
│   ┌──────────────────────┐   ┌───────────────────────────┐                 │
│   │    Orchestration     │   │    Memory + Retrieval     │                 │
│   └──────────────────────┘   └───────────────────────────┘                 │
└──────────────────────────────────────────┬─────────────────────────────────┘
                                           │ file / verify tools
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                Local Sandbox Service (separate Bun process, MCP/HTTP)       │
│   ┌──────────┐   ┌──────────────┐   ┌──────────────┐   ┌────────────────┐   │
│   │  Files   │   │    Skills    │   │  Typecheck   │   │   Remotion     │   │
│   │  (R/W)   │   │  (on-demand) │   │   / Render   │   │   Workspace    │   │
│   └──────────┘   └──────────────┘   └──────────────┘   └────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

The frontend never calls the AI model directly. It streams messages and status updates from the backend. The backend owns the agent workflow, routing, memory, and model calls. The sandbox is the controlled environment where generated code is read, written, and verified.

## System Design Principles

### Separation Of Responsibilities

The Planner, Art Director, and Implementor are kept separate on purpose. Each one does a different kind of work.

- The Planner handles conversation and decisions. It does not write code.
- The Art Director handles creative design. It does not write code or touch files.
- The Implementor writes and verifies code. It follows the approved design — it does not invent new creative direction.

This separation makes the system easier to debug and improve. It also prevents planning, design, and code from getting mixed into one messy response.

### Editable Output

The system generates Remotion source code, not just a video file. The code can be reviewed, changed, saved to version control, or reused elsewhere.

### Sandboxed Execution

Generated code runs inside a local sandbox. The sandbox gives access to a limited set of tools: read files, edit files, load skills, and run checks. This keeps a clear boundary between agent reasoning and code execution.

Only the Implementor uses sandbox tools. The Planner and Art Director stay as reasoning agents with no direct file access.

### Memory And Retrieval Are Separate

Memory holds the current project state: what has been decided, built, and changed so far.

Retrieval holds knowledge from uploaded files, assets, data, and generated artifacts.

Keeping them separate means the working state stays clean, while agents can still look up facts when they need them.

### Iterative Routing

Not every request needs the full pipeline. The Planner reads each follow-up and picks the right route.

For example, "make the title bigger" goes straight to the Implementor. "Make the intro feel more premium" goes through the Art Director first because it changes creative direction. "Add a pricing scene" needs a full scene-structure update.

## Major Components

### Frontend Web Application

The frontend is the user's workspace. It has four main areas:

- Chat panel — where the user types prompts and reads responses.
- Live preview — shows the generated video.
- Agent activity panel — shows what the system is currently doing.
- File viewer — lets the user inspect the generated source code.

The frontend only handles display and interaction. It does not call the AI model or run agent logic. It sends messages to the backend and shows the streamed results.

### Backend Agent Server

The backend runs the agents and manages shared state. It receives messages, runs the right workflow, and streams progress back to the frontend.

It is responsible for:

- Running the Planner, Art Director, and Implementor in the right order.
- Classifying follow-up requests and routing them.
- Managing the project's workspace state and conversation context.
- Looking up project knowledge from the knowledge store when an agent asks for it.
- Giving the Implementor access to sandbox tools.

### Planner Agent

The Planner is the first stop for every user request. It:

- Reads what the user wants.
- Asks one focused question if important details are missing.
- Creates a structured brief: goal, audience, tone, length, assets, and key messages.
- Initializes the project's Workspace State.
- Classifies follow-up requests and **decides** which route they should take.

The Planner is the decision-maker, not the executor. It outputs a routing decision (e.g. "exact tweak → Implementor", "creative change → Art Director then Implementor"), but it does not run the next agent itself. The orchestration layer below does that.

### Art Director Agent

The Art Director turns the Planner's brief into a visual plan. It:

- Designs each scene: layout, hierarchy, pacing, motion, and transitions.
- Keeps the style consistent across all scenes.
- Updates the shared style context.
- Writes scene design records into the scene registry.

It works in design language, not code. It says "a confident fade-up with subtle scale" — not which animation API to use. That is the Implementor's job.

### Implementor Agent

The Implementor writes and verifies the code. It:

- Reads the scene designs and style context.
- Checks the current project files in the sandbox.
- Loads relevant skills only when needed.
- Writes Remotion components, styling, animations, and transitions.
- Runs typecheck and optional render checks.
- Fixes errors until the code is valid.
- Updates each scene's build status, file path, and any errors.

It is the only agent with file-editing and verification tools. It follows the Art Director's design and uses its own judgment only to fill small gaps.

### Orchestration Layer

The orchestration layer is **not an agent**. It is the runtime glue that takes the Planner's routing decision and actually executes the pipeline reliably.

It controls:

- The order agents run in.
- Calling the next agent based on the Planner's decision.
- How handoffs pass between agents (brief → scene designs → code).
- Enforcing field ownership (no agent overwrites another agent's fields).
- Error handling and retries.
- Progress events sent to the frontend.

For the MVP the pipeline runs one step at a time. The design leaves room for running scenes in parallel once their designs are finalized.

#### Planner vs Orchestration

The split keeps responsibilities clean:

| Concern | Planner | Orchestration |
|---|---|---|
| Understands user intent | yes | no |
| Decides which agent should run next | yes | no |
| Actually invokes the next agent | no | yes |
| Manages handoffs and field ownership | no | yes |
| Handles sequencing, errors, retries | no | yes |

The Planner is the **brain** of the routing decision. The orchestration layer is the **runtime** that carries that decision out. LLMs are good at intent, code is good at deterministic control flow, so each owns what it does best.

### Project State Layers

Editing Agent organizes project state into three layers, all scoped to a single project session. There is **no cross-session or user-level memory** in the MVP — each project starts fresh.

The three layers are:

1. **Conversation Context** — the chat thread for this session, with rolling summarization when it gets long.
2. **Workspace State** — the structured, mutable state of the project that agents read and write.
3. **Project Knowledge Store** — uploaded files and large documents, queried via tools only when needed.

#### Conversation Context

The current chat thread: user messages, agent responses, recent tool results. When the thread gets long, older turns are summarized so the model still sees the relevant history without overflowing.

#### Workspace State

Holds the live state of the project. Agents read and write these fields directly. Key structures:

- **Brief** — the structured understanding of what the user wants.
- **Style context** — the visual language: colors, fonts, mood, animation feel, transitions.
- **Scene registry** — each scene's design, build status, file path, and any errors.
- **Routing decision** — the Planner's classification of the latest request.
- **Assets** — typed list of uploaded assets (logos, images) with metadata and file paths.
- **Data summaries** — derived facts from CSV execution (small structured results, not raw rows).
- **Document summaries** — short summaries of large uploaded documents, with a pointer into the Knowledge Store.

Workspace State is small, structured, and mutable. It is the single source of truth for "what is this project right now."

#### Project Knowledge Store

Holds the heavy content from uploaded files: chunked text from large PDFs and brand guides, with embeddings for retrieval. It is **not** queried automatically on every user message. Agents call a retrieval tool only when Workspace State doesn't already have the fact they need.

What goes where, by upload type:

| Input | Lands in |
|---|---|
| Short text or markdown | Workspace State (full content inlined) |
| Large PDF or doc | Knowledge Store (chunks) + Workspace State (summary + pointer) |
| Tiny CSV | Workspace State (inlined) |
| Analytical CSV | Execution store + Workspace State (schema, summary, derived facts) |
| Image asset (logo) | Workspace State (typed asset entry with metadata) |
| Reference image | Conversation context for that turn |
| Generated artifacts | Workspace State |

The principle: **default to Workspace State; the Knowledge Store is the exception, used only for content that is too large to fit in context.** See [`docs/pdf-upload-walkthrough.md`](docs/pdf-upload-walkthrough.md) and [`docs/upload-walkthroughs.md`](docs/upload-walkthroughs.md) for end-to-end traces.

### Sandbox

The sandbox is where generated code runs. It gives the Implementor a limited set of tools:

- Read files.
- List and search files.
- Create and edit files.
- Load skills.
- Run typecheck.
- Run render checks.

The sandbox lets the system verify code before showing it as done. It also keeps file operations controlled and observable.

### Skills

Skills are short implementation guides the Implementor can load on demand. They are not all loaded upfront.

For example, if a scene needs kinetic typography, the Implementor loads a kinetic-text skill. If it needs a chart animation, it loads a chart skill.

This keeps the agent's context focused on what is actually needed.

## How Components Interact

The agents hand off work through three shared objects: the brief, the style context, and the scene registry.

```
  User
   │ prompt
   ▼
┌─────────┐  brief   ┌──────────────┐  scene designs   ┌─────────────┐
│ Planner │─────────▶│ Art Director │────────────────▶│ Implementor │
│         │          └──────────────┘                  │             │
│ routing │               │ style context              │  sandbox    │
│decision │               ▼                            │  tools      │
└─────────┘        ┌──────────────┐                    └──────┬──────┘
                   │Scene Registry│◀──── build status ────────┘
                   └──────────────┘           │
                                              │ progress events
                                              ▼
                                        ┌──────────┐
                                        │ Frontend │
                                        │ Preview  │
                                        └──────────┘
```

- The **brief** goes from the Planner to the Art Director.
- The **style context** goes from the Art Director to the Implementor and is updated whenever the creative direction changes.
- The **scene registry** is shared. The Art Director writes the design fields. The Implementor writes the build status, file paths, and errors.

## Product Flow

### Initial Video Generation

```
┌──────┐     ┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────┐
│ User │────▶│ Planner │────▶│ Art Director │────▶│ Implementor │────▶│ Preview │
└──────┘     └────┬────┘     └──────────────┘     └──────┬──────┘     └─────────┘
                  │ (if info missing)                    │
                  ▼                                      ▼
           Clarifying Q                             Sandbox verify
```

1. The user describes the video they want. Example: _"Create a 20-second product demo for a note-taking app. Clean, fast, trustworthy. Show capture, organize, and share."_
2. The Planner checks if enough detail is there. If not, it asks one question. If yes, it creates a brief.
3. The Art Director turns the brief into scenes — intro, features, CTA — and sets the visual style.
4. The Implementor writes the Remotion code: components, layout, animations, composition.
5. The sandbox runs typecheck and optionally a render check. The Implementor fixes any errors.
6. The frontend updates the preview. The user can watch, inspect files, and ask for changes.

### Follow-Up Editing

Each follow-up is routed based on what the user is asking for:

```text
Exact tweak -> Planner -> Implementor -> Preview
Creative change -> Planner -> Art Director -> Implementor -> Preview
Structural change -> Planner -> Art Director -> Implementor -> Preview
Error fix -> Planner -> Implementor -> Preview
```

| User Request | Type | Route |
|---|---|---|
| "Make the title bigger." | Exact tweak | Planner → Implementor |
| "Make the intro more energetic." | Creative change | Planner → Art Director → Implementor |
| "Add a pricing scene." | Structural change | Planner → Art Director → Implementor |
| "Fix the typecheck error." | Error fix | Planner → Implementor |

Small changes stay fast. Larger creative changes go through the Art Director to keep the design consistent.

## Data And State Flow

The three layers connect in a clear flow. Conversation Context holds what was just said. Workspace State holds the current project. The Knowledge Store holds the heavy uploaded content.

```
┌──────────────────────────────────────────────────────────────┐
│                    Conversation Context                      │
│       chat thread (with summarization when long)             │
└────────────────────────────┬─────────────────────────────────┘
                             │ recent turns + summary
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                       Workspace State                        │
│   brief · style context · scene registry · routing ·         │
│   assets · data summaries · document summaries · errors      │
└────────────────────────────┬─────────────────────────────────┘
                             │ tool call (only when needed)
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                   Project Knowledge Store                    │
│       chunked large docs · vector index · raw uploads        │
└──────────────────────────────────────────────────────────────┘
```

Agents read Workspace State by default. They call into the Knowledge Store only when a needed fact is not already there.

For example, when a user uploads a brand guide PDF, the system extracts a short summary and stores it in Workspace State right away. The Planner uses that summary to draft the brief. If the Planner later needs a specific detail the summary did not cover, it calls a retrieval tool to pull the relevant chunks from the Knowledge Store. The chunks are used for that turn but are not stored in Workspace State.

## Error Handling And Recovery

The system is designed to detect and repair implementation issues.

Common errors include:

- TypeScript type errors.
- Missing imports.
- Invalid component references.
- Broken scene paths.
- Render-time issues.
- Mismatches between generated files and preview expectations.

When an error occurs, the Implementor updates the scene registry with the error state, inspects the relevant files, applies a fix, and reruns verification. The frontend can show the user where the pipeline is and whether the system is fixing an issue.

For product usability, this is important because users should not have to understand TypeScript errors to continue editing a video.

## Security And Safety Boundaries

The most important boundary is between reasoning and execution.

The Planner and Art Director do not receive direct file-editing tools. They produce structured intent and design direction.

The Implementor receives execution tools, but only through the sandbox. This makes generated code operations more controlled and observable.

Additional safety rules include:

- User uploads should be treated as read-only source inputs.
- Generated outputs should be written to working or output locations, not back into upload sources.
- Browser-executed Remotion compositions should not make external API calls.
- Browser-executed compositions should not access the filesystem.
- Verification should run before marking generated code as complete.

## Technical Stack

The project uses a modern TypeScript-based stack.

| Layer | Technology |
|---|---|
| Frontend | Vite and React |
| Styling | Tailwind CSS |
| Video rendering and preview | Remotion |
| Streaming chat UI | AI SDK React utilities |
| Agent framework | Mastra |
| Workspace state | Mastra memory and LibSQL concepts |
| Knowledge store | Vector index for large uploaded docs (queried on demand) |
| Execution boundary | Local sandbox service (separate Bun process, no Docker) |
| Tool protocol | MCP (HTTP) between main app and sandbox service |
| Package management | Bun workspaces |

This stack supports a local development workflow where the frontend, backend, and sandbox can run as separate cooperating services.


## User Story 1: Founder Creates A Launch Video

A startup founder is launching a sales dashboard tool. It shows revenue in real time, tracks deals through the pipeline, and alerts the team when a deal is about to close. The founder wants a video for the product hunt launch but has no video or animation experience.

**Goal:** A 20-second video that shows the dashboard in action — live numbers, pipeline view, and smart alerts — and ends with a clear call to action.

**How it goes:**

1. The founder types: _"Create a 20-second launch video for a sales dashboard. Audience: sales managers and startup founders. Feel: sharp, fast, data-driven. Show the live revenue counter, the deal pipeline, and the close-alert notification."_
2. The Planner reads the request, finds it complete, and creates a brief.
3. The Art Director designs four scenes: a bold revenue number counting up, a pipeline board with deals moving across stages, a close-alert notification popping in, and a CTA screen.
4. The Implementor writes the Remotion code — animated counters, card transitions, notification entrance — and the sandbox verifies it.
5. The frontend shows the live preview and generated files.
6. The founder says: _"The revenue counter feels too slow. Make it faster and punch the final number."_
7. The Planner routes it as a direct tweak. The Implementor adjusts the animation and the preview refreshes.

**Result:** The founder gets a sharp, data-driven launch video in minutes — no motion designer, no video tool, no code.

## User Story 2: Designer Creates A Brand Reveal Video

A designer is launching a new brand identity for a client. They have a logo file, a color palette document, and a custom font. They want a short reveal video to share on social media when the rebrand goes live — something that feels intentional and premium, not templated.

**Goal:** A 20-second brand reveal that unveils the logo, walks through the color system, shows the typography in motion, and ends with the full brand lockup.

**How it goes:**

1. The designer uploads the logo, a brand guide PDF, and the font files.
2. The system indexes the brand guide, stores the logo and fonts as assets, and extracts the color values and tone of voice.
3. The designer types: _"Make a 20-second brand reveal video for our client's rebrand. It should feel premium and minimal. Unveil the logo, show the color palette, then the typography, and close with the full brand lockup."_
4. The Planner reads the uploaded materials and creates a brief that captures the visual language and intended mood.
5. The Art Director designs the scenes using the actual brand colors and font: a dark open, the logo drawing in, each color sliding into frame with its name, the custom font setting a headline, and a final hold on the full lockup.
6. The Implementor loads a logo animation skill, applies the exact brand colors and font, and writes the Remotion scenes. The sandbox verifies the result.
7. The frontend shows the preview. The designer sees the actual brand assets in the video — not placeholders.
8. The designer says: _"The logo reveal feels too quick. Give it more pause before the tagline comes in."_
9. The Planner routes it as a direct timing tweak. The Implementor adjusts the hold and the preview updates.

**Result:** The designer delivers a polished brand reveal without opening After Effects. The video uses the real assets, reflects the actual brand system, and can be handed off as editable source code if the client wants changes later.

## Why This Design Matters

Editing Agent is not a chatbot that writes code. It is a structured creative production system.

Each agent protects a different part of the quality. The Planner makes sure the system understands what the user actually wants before doing anything. The Art Director makes sure the video has a clear visual direction before any code is written. The Implementor makes sure the code works before the result is shown.

Good video output is not a single response — it is a chain of decisions: understand the user, set a direction, build it right, check it, and be ready to change it. Doing all of that in one step produces output that is hard to trust and hard to fix. Keeping it separate produces something the user can iterate on with confidence.