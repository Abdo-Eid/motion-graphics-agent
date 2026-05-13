# Phase 3 — MCP Client + Skills Content

## Your Role

Wire the main Mastra app to the sandbox service over MCP, attach the discovered tools to the Implementor agent only, and ship the v1 skill docs the Implementor will load on demand.

These two pieces ship together because the wiring is only proven once `list_skills` and `load_skill` actually return real content.

## Part A — MCP Client

### What To Build

In `mastra/src/mastra/mcp/client.ts`, instantiate Mastra's `MCPClient` against `SANDBOX_MCP_URL` (default `http://localhost:4311/mcp`). Discover the tool list at startup, log it, and expose a function that returns the discovered tools so the Implementor agent factory can attach them.

```ts
// mastra/src/mastra/mcp/client.ts (sketch)
import { MCPClient } from '@mastra/core/mcp'

export async function createSandboxMcpClient() {
  const client = new MCPClient({
    servers: {
      sandbox: { url: process.env.SANDBOX_MCP_URL ?? 'http://localhost:4311/mcp' },
    },
  })
  await client.getTools() // proves discovery works
  return client
}
```

### Wiring

In `mastra/src/mastra/index.ts`:

1. Create the MCP client at startup.
2. Pass the discovered tools into the Implementor agent factory only.
3. Log the discovered tool names — this becomes the visible proof that the two services are talking.

### Implementor-Only Attachment

- Planner: no sandbox tools (only retrieval, which comes from the knowledge layer).
- Art Director: no sandbox tools (only retrieval).
- Implementor: full sandbox tool surface (`read_file`, `write_file`, `edit_file`, `list_files`, `grep`, `exec_command`, `exec_background`, `check_background`, `kill_background`, `run_typecheck`, `list_skills`, `load_skill`).

The agent factory should reject attempts to attach sandbox tools to non-Implementor agents — fail fast on misconfiguration.

### Lifecycle Behavior

- **Sandbox down at startup.** Mastra still boots. Implementor turns fail with a clear `sandbox-unreachable` error rather than crashing the server.
- **Sandbox restarted mid-session.** The MCP client reconnects automatically with exponential backoff (start 250 ms, cap 5 s, max 6 attempts). After max attempts, surface the error and let the next Implementor turn retry from scratch.
- **Per-tool-call timeout.** Default 30 s, configurable via `SANDBOX_MCP_CALL_TIMEOUT_MS`. Shorter than `SANDBOX_COMMAND_TIMEOUT_MS` so we don't leave a hung sandbox blocking the agent.

### Configuration

```env
# mastra/.env
SANDBOX_MCP_URL=http://localhost:4311/mcp
SANDBOX_MCP_CALL_TIMEOUT_MS=30000
```

### Files To Create / Modify

```
mastra/src/mastra/mcp/client.ts        # new
mastra/src/mastra/mcp/index.ts          # new (re-exports)
mastra/src/mastra/agents/implementor.ts # modify — accept tools, attach
mastra/src/mastra/index.ts              # modify — boot MCP client, wire factory
```

### Checkpoint

```bash
# terminal 1
bun run dev:sandbox

# terminal 2
bun run dev:mastra
```

Expected on Mastra startup logs:

```
[mcp] connected to sandbox at http://localhost:4311/mcp
[mcp] discovered tools: read_file, write_file, edit_file, list_files, grep,
      exec_command, exec_background, check_background, kill_background,
      run_typecheck, list_skills, load_skill
```

Then call the Implementor:

```powershell
curl -X POST http://localhost:4111/chat/implementor-agent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"List the files in the workspace, then run node --version.\"}]}"
```

Expected: the agent invokes `list_files` and `exec_command` from the sandbox service.

Failure case: stop the sandbox process, repeat the request — the response should clearly say the sandbox is unreachable, not crash the server.

## Part B — Skills Content

### What To Build

Skill docs are short, opinionated markdown files the Implementor loads on demand via `list_skills` and `load_skill`. They live under `sandbox/skills/` and are served by the sandbox service.

V1 ships five skills, chosen to cover the most common video patterns the product description promises (intros, transitions, kinetic text, logo reveals, charts).

### Skill Doc Structure

Every skill doc follows the same shape so the Implementor knows what to expect:

```md
# <skill name>

## Purpose
One short paragraph: what this skill is for, and what kind of scene it fits.

## When to use
Bullet list of cues from a scene design that should trigger loading this skill.

## Building blocks
The Remotion APIs and patterns used. Include short, copy-shape-not-text examples.

## Common pitfalls
Specific failure modes and how to avoid them.

## Acceptance check
What "done" looks like for a scene built with this skill.
```

### V1 Skill Set

| File | Covers |
|---|---|
| `remotion-basics.md` | `AbsoluteFill`, `useCurrentFrame`, `useVideoConfig`, `spring`, `interpolate`, fps conventions, time→frames math. The foundation every other skill assumes. |
| `transitions.md` | Scene-to-scene transitions: fade, slide, wipe, scale, masked reveals. When to use which, how to avoid jarring cuts, how to align exit and entrance timing. |
| `kinetic-typography.md` | Animated text: per-letter / per-word entrances, masking, kerning during motion, sizing for readability at small frame counts. |
| `logo-reveal.md` | Logo entrances and holds: pacing, breathing room, common reveal shapes (draw-on, mask-off, stamp), avoiding cheap-looking overshoot. |
| `chart-animation.md` | Numeric counter animation, bar/line chart entrances with staggered timing, value labels that update with the animation. |

### Authoring Rules

- Each doc is **short** — aim for one screen of reading. Implementor loads the whole thing into context.
- Examples are **shape, not paste-ready code**. Show the pattern; the Implementor adapts to the specific scene.
- No project-specific names. Skills are reusable across any Remotion project.
- No reference to Docker, MCP, or sandbox internals. Skills describe Remotion patterns only.

### Files To Create

```
sandbox/skills/remotion-basics.md
sandbox/skills/transitions.md
sandbox/skills/kinetic-typography.md
sandbox/skills/logo-reveal.md
sandbox/skills/chart-animation.md
```

### Skills + Sandbox Service

The sandbox service's `list_skills` tool enumerates `sandbox/skills/*.md` and returns `{ id, title, summary }[]`. `load_skill({ id })` returns the full markdown body. Both are already part of the sandbox service tool surface — no changes to the sandbox needed for this task, only the markdown content.

### Checkpoint

From the Implementor agent endpoint:

```powershell
curl -X POST http://localhost:4111/chat/implementor-agent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"List available skills, then load the kinetic typography skill.\"}]}"
```

Expected:

- `list_skills` returns 5 entries with summaries pulled from each doc's `Purpose` section.
- `load_skill({ id: 'kinetic-typography' })` returns the full body.

## Constraints

- Skill docs must not reference Docker, container runtime, or the MCP transport. They describe Remotion patterns only.
- Sandbox tools must be attached to the Implementor only. Other agents must reject the configuration at startup.
- The MCP client must not crash the Mastra server when the sandbox is down — fail soft and surface clearly.
- No skill should depend on filesystem layout outside `sandbox/.workspace/` — skills describe code patterns, not project paths.

## Reference

- [`T6-sandbox-service.md`](T6-sandbox-service.md) — the service these tools come from
- [`T4-implementor-agent.md`](T4-implementor-agent.md) — the consumer
- [`docs/local-sandbox-service-design.md`](../docs/local-sandbox-service-design.md) — tool surface contract
