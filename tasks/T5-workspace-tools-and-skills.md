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
- If unset, default to a gitignored `.workspace` directory owned by the Mastra package.
- Upload handlers write `assets/` and `uploads/`.
- Implementor writes generated code under `src/` and build artifacts under `out/`.
- Raw uploads are inputs. Do not mutate uploaded files in place.

## Tool Attachment

Only Implementor receives file and command tools.

- Planner: no filesystem tools, no command tools.
- Art Director: no filesystem tools, no command tools.
- Implementor: full execution tool surface.

Expected generic names:

- `read_file`
- `write_file`
- `edit_file`
- `list_files`
- `grep`
- `exec_command`
- `list_skills`
- `load_skill`

Background command tools are optional for the first checkpoint. If enabled, keep names generic (`check_background`, `kill_background`) and document how they map to Mastra Workspace's process tools.

Use Mastra's Workspace name-remapping config instead of teaching the agent provider-specific `mastra_workspace_*` names.

## Skill Docs

Skills are short, opinionated markdown files. They are not uploaded user knowledge and are not part of the vector Knowledge Store.

V1 skill set:

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
- Use `list_skills` / `load_skill` before editing when a skill is relevant.
- Use `list_files` before assuming project structure.
- Use `read_file` before editing an existing file.
- Prefer targeted edits over full rewrites.
- Run typecheck through `exec_command` or a helper built on top of it.
- Report changed files and verification results naturally.

Remove any wording that says tools come from a separate service.

## Checkpoint

Run Mastra:

```bash
bun run dev:mastra
```

From Studio or the Implementor chat endpoint, ask:

```text
List files in the workspace, write hello.txt with the content hi, then run node --version.
```

Expected:

- Implementor invokes `list_files`.
- Implementor writes `hello.txt` under the workspace root.
- Implementor invokes `exec_command` and reports the Node version.
- Planner and Art Director do not have these tools attached.

Skill checkpoint:

```text
List available skills, then load the kinetic typography skill.
```

Expected:

- `list_skills` returns the v1 skill list.
- `load_skill` returns the requested markdown body.

## Constraints

- No second service.
- No MCP transport.
- No Docker.
- No provider-specific tool names in agent instructions.
- Do not attach Workspace tools to Planner or Art Director.
- Do not give Implementor Knowledge Store retrieval.

## Reference

- [`T4-implementor-agent.md`](T4-implementor-agent.md) — Implementor behavior and prompt contract
- [`../docs/architecture.md`](../docs/architecture.md) — active architecture
- [`../docs/project-knowledge-and-skills.md`](../docs/project-knowledge-and-skills.md) — state, retrieval, and skills rules
