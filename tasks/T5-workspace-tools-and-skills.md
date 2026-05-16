# Phase 3 — Workspace Tools + Skills

## Your Role

Attach Mastra Workspace tools to the Implementor agent and add the v1 skill-loading surface it uses before editing Remotion code.

This replaces the old two-service execution design. There is no separate execution service for this task. Work stays inside the `mastra/` package.

## What To Build

Two pieces ship together:

1. **Workspace tools** — direct `@mastra/core/workspace` tools attached to Implementor only.
2. **Skills** — short Remotion implementation guides loaded on demand by Implementor.

## Where To Work

```text
mastra/src/mastra/
  workspace-config.ts          # configure Workspace, LocalFilesystem, LocalSandbox, tool names
  agents/implementor.ts        # attach tools and update instructions
  index.ts                     # register the final Implementor agent shape if factory wiring is needed
  skills/                      # v1 skill markdown docs or skill loader source
```

## Workspace Root

Use one workspace root for uploads, generated files, preview routes, and Workspace tools.

Rules:

- `WORKSPACE_PATH` can override the workspace root.
- If unset, default to `mastra/.workspace` — tracked by the main repo. Each `dev:mastra` start resets it to the committed baseline via `git checkout`.
- Upload handlers write `assets/` and `uploads/`.
- Implementor writes generated code under `src/` and build artifacts under `out/`.
- Raw uploads are inputs. Do not mutate uploaded files in place.

## Tool Attachment

Only Implementor receives file and command tools.

- Planner: no filesystem tools, no command tools.
- Art Director: no filesystem tools, no command tools.
- Implementor: full execution tool surface.

Mastra's Workspace tools are prefixed with `mastra_workspace_` at runtime, but the agent instructions should use the generic conceptual names below. The agent will understand either form. The conceptual tool surface is:

- `list_files` — list directory contents
- `read_file` — read file contents
- `write_file` — create or overwrite a file
- `edit_file` — make targeted edits to an existing file
- `grep` — search file contents by pattern
- `exec_command` — run shell commands in the workspace

Background command tools are optional for the first checkpoint.

## Skill Docs

**In progress.** The skill directory and markdown files have not been created yet. The `workspace-config.ts` declares `skills: ['skills']` and the Implementor instructions reference `skill`, `skill_search`, and `skill_read`, but the actual skill files are deferred.

Planned v1 skill set:

| File | Covers |
|---|---|
| `remotion-basics.md` | `AbsoluteFill`, `useCurrentFrame`, `useVideoConfig`, `spring`, `interpolate`, fps conventions, time-to-frames math. |
| `transitions.md` | Scene-to-scene transitions: fade, slide, wipe, scale, masked reveals. |
| `kinetic-typography.md` | Animated text: per-letter/per-word entrances, masking, readability. |
| `logo-reveal.md` | Logo entrances and holds: pacing, breathing room, reveal shapes. |
| `chart-animation.md` | Numeric counters, bar/line chart entrances, value labels. |

Authoring rules:

- Keep each doc short enough to load into context.
- Describe reusable Remotion patterns, not this repo's filesystem layout.
- Do not reference execution internals.
- Examples should show shape and timing patterns, not paste-ready scene code.

## Implementor Prompt Updates

Update `mastra/src/mastra/agents/implementor.ts` so it says:

- Workspace tools are attached directly by the Mastra server.
- Use `skill_search` / `skill` before editing when a skill is relevant.
- Use `list_files` before assuming project structure.
- Use `read_file` before editing an existing file.
- Prefer targeted edits over full rewrites.
- Run typecheck through `exec_command` or a helper built on top of it.
- Report changed files and verification results naturally.

Remove any wording that says tools come from a separate service.

## Checkpoint

Run Mastra:

```bash
bun run dev
```

From Mastra Studio or the Implementor chat endpoint, ask:

```text
List files in the workspace, write hello.txt with the content hi, then run node --version.
```

Expected:

- Implementor invokes `list_files`.
- Implementor writes `hello.txt` under the workspace root.
- Implementor invokes `exec_command` and reports the Node version.
- Planner and Art Director do not have these tools attached.

Skill checkpoint (deferred until skill files are created):

```text
List available skills, then load the kinetic typography skill.
```

Expected:

- `skill_search` returns the v1 skill list.
- `skill` returns the requested skill body.

## Constraints

- No second service.
- No MCP transport.
- No Docker.
- Do not attach Workspace tools to Planner or Art Director.
- Do not give Implementor Knowledge Store retrieval.

## Reference

- [`T4-implementor-agent.md`](T4-implementor-agent.md) — Implementor behavior and prompt contract
- [`../docs/architecture.md`](../docs/architecture.md) — active architecture
- [`../docs/project-knowledge-and-skills.md`](../docs/project-knowledge-and-skills.md) — state, retrieval, and skills rules
