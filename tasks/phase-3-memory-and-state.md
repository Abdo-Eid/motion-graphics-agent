# Phase 3 — T1A — Memory & Workspace State

Track A of T1. Pairs with [`phase-3-knowledge-and-uploads.md`](phase-3-knowledge-and-uploads.md) (Track B). Both tracks share the spec overview in [`phase-3-memory-knowledge-uploads.md`](phase-3-memory-knowledge-uploads.md).

## Your Role

Own the conversation memory and Workspace State layers — the data spine every agent reads and writes through.

- **Workspace State** — structured, mutable project state (`brief`, `styleContext`, `sceneRegistry`, `assets`). Stored as Mastra **working memory** with our zod schema; mutated only through role-guarded tools.
- **Conversation Context** — chat thread per session, with **Observational Memory** (built into `@mastra/memory`) handling compression so old messages collapse into a dense observation log instead of bloating the context window.

The Planner / Art Director / Implementor agent tasks all assume this layer exists. They do not work without it.

## Scope Decisions

| Decision | Choice |
|---|---|
| Storage | `@mastra/libsql` `LibSQLStore` (already installed); single DB file shared with Track B's vector index |
| Conversation memory | Mastra `Memory` with **Observational Memory** enabled — replaces a hand-rolled summarizer |
| Workspace State | Mastra working memory with `schema: WorkspaceState` (zod), `scope: 'thread'` |
| Thread model | One chat = one project. `threadId === projectId === resourceId`. Subagent delegations must reuse the parent `threadId` (T2 wires this). |

## Where To Work

```text
mastra/src/mastra/memory/
  schema.ts             # zod types for Brief, StyleContext, SceneRecord, Asset, WorkspaceState
  index.ts              # configured Memory instance (working memory + observational memory) + storage handle
  access.ts             # role-guarded tools (setBrief, setStyleContext, setSceneDesign, addAsset)
                        # agents are readOnly: true on WM; Implementor gets zero write tools
```

No `store.ts` and no `summarizer.ts` — Mastra Memory replaces both.

## Workspace State Schema

Concrete types (zod 4). Used directly as the working-memory `schema` so Mastra validates updates and the agents see typed JSON.

```ts
// memory/schema.ts (sketch)
export const Brief = z.object({
    goal: z.string(),
    audience: z.string(),
    tone: z.string(),
    duration: z.number(),
    assets: z.array(z.string()), // asset ids
    keyMessages: z.array(z.string()),
    userPreferences: z.record(z.string(), z.string()).optional(),
});

export const StyleContext = z.object({
    palette: z.array(z.string()),
    fonts: z.array(z.string()),
    mood: z.string(),
    animationFeel: z.string(),
    transitions: z.string(),
});

export const SceneRecord = z.object({
    number: z.number(),
    name: z.string(),
    design: z.unknown().optional(), // Art Director writes
});

// Locked T1A/T1B contract. Do not extend without agreement from both tracks.
// MVP scope: only images become Assets. Docs (pdf, csv, txt, md) are handled
// by the upload pipeline but do NOT produce Asset rows — they go to the
// Knowledge Store (pdf/txt/md) or the uploads/ folder (csv).
export const Asset = z.object({
    id: z.string(), // nanoid(21); stable; referenced by Brief.assets[]
    path: z.string(), // relative to SANDBOX_WORKSPACE_DIR, e.g. "assets/<id>.png"
    originalName: z.string(), // user's filename at upload time (display only)
    mime: z.string(), // detected mime, always "image/*" in MVP
    bytes: z.number().int().nonnegative(),
    description: z.string().default(""), // populated later by multimodal description step
    createdAt: z.string().datetime(), // ISO-8601, set by addAsset
});

export const WorkspaceState = z.object({
    projectId: z.string(),
    brief: Brief.optional(),
    styleContext: StyleContext.optional(),
    sceneRegistry: z.array(SceneRecord).default([]),
    assets: z.array(Asset).default([]),
});
```

`projectId` doubles as `threadId` (and `resourceId`) when invoking agents. Mastra working memory uses **merge semantics** for schema mode — partial updates preserve untouched fields, set a field to `null` to delete it, arrays are replaced wholesale.

> **Locked with Track B.** The `Asset` shape above is the agreed contract. Only images produce `Asset` rows in the MVP. References (image attachments the Planner classifies as inspiration, not project assets) attach to the conversation message and skip `addAsset`. Docs (pdf/csv/txt/md) never produce `Asset` rows. Either track can widen scope only by changing both task files together.

## Field Ownership

Mastra working memory has one access mode per call (read-write or `readOnly: true`); it has no per-field ACL. We get ownership by:

1. Configuring every agent with `memory: { ..., options: { workingMemory: { readOnly: true }}}` so no agent can call the built-in `updateWorkingMemory` tool.
2. Exposing **only** the role-correct setter tools to each agent. Each setter validates the role at the call site, reads current WM, applies the partial update, and calls `memory.updateWorkingMemory()`.

| Field                     | Owner                   | Tool exposed to that agent                                             |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `brief`                   | Planner                 | `setBrief`                                                             |
| `styleContext`            | Art Director            | `setStyleContext`                                                      |
| `sceneRegistry[n].design` | Art Director            | `setSceneDesign`                                                       |
| `assets`                  | Upload handler (system) | `addAsset` (not exposed to agents — called from `uploads/` in Track B) |

A wrong-role call throws synchronously. The Planner's `delegation` hooks in T2 catch the throw and emit a `field-ownership-violation` event on the bus.

The **Implementor has no memory-write tools at all.** It is pure-consumer of working memory: reads `styleContext` + `sceneRegistry[n].design`, runs sandbox tools, reports outcome via the `## Summary` block in its reply. Build status, file paths, and errors flow back through the Summary (read by Planner) and through the filesystem itself (consumed by the Phase 4 workspace read-through routes) — not through working memory.

## Conversation Context

- Chat thread per `threadId` (= `projectId`).
- **Observational Memory** runs in the background. Once raw message tokens cross the configured threshold, the Observer compresses them into a dense observation log; the Reflector condenses observations once they grow too large.
- Working memory is always present in context regardless of compression — that's what guarantees the brief and scene statuses survive truncation losslessly.
- Configuration lives in `memory/index.ts`. Default settings are fine; override the OM model via env if needed (no provider locked in here — pick at deploy time).

There is **no** `summarizer.ts` and **no** `readContext()` helper. Agents read context the normal Mastra way (`memory: { thread, resource }` on `agent.generate(...)`).

## Files To Create

```
mastra/src/mastra/memory/
  schema.ts             Zod types: Brief, StyleContext, SceneRecord, Asset, WorkspaceState
  index.ts              Configured Memory instance + LibSQLStore handle; exports `memory`, `storage`
  access.ts             Role-guarded createTool wrappers (setBrief, setStyleContext, setSceneDesign, addAsset)
```

## Wiring

- Export `memory`, `storage`, and the role-guarded tools from `memory/access.ts`. T2/T3/T4 import these. Track B imports `addAsset` from here.
- Each agent (T2/T3/T4) gets the shared `Memory` instance with `workingMemory.readOnly: true` and **only** the setter tools that match its role attached.
- The actual `Mastra({ ... })` wiring in `mastra/src/mastra/index.ts` is shared with Track B and lands in the merge step — agree who does it.

## Configuration

```env
# mastra/.env (Track A's vars)
LIBSQL_URL=file:./data/motion-graphics-agent.db
```

The same `LIBSQL_URL` is reused by Track B for its vector index.

## Checkpoints

You verify everything through **Mastra Studio** (the dev UI bundled with `@mastra/core`). No frontend work, no `curl`. Run the dev server, open the Studio URL it prints, use the Playground.

```bash
bun --filter mastra dev
```

To exercise the memory layer in Studio you need _something_ registered with it. Wire a throwaway test agent in `mastra/src/mastra/index.ts` that uses the shared `memory` instance and has `setBrief` attached — Studio shows it in the agent list and lets you call its tools from the Playground. Delete the test agent after T2 lands the real Planner.

1. **Memory roundtrip.**
    - In Studio Playground, open a thread with `threadId='proj-1'` and `resourceId='proj-1'`.
    - Call `setBrief` (with the Planner role) from the Playground tool panel with a sample brief payload.
    - Open the thread's **Working Memory** tab in Studio → the JSON renders the `WorkspaceState` shape with your `brief` populated.
    - Also confirm programmatically: `await memory.getWorkingMemory({ threadId: 'proj-1', resourceId: 'proj-1' })` returns the same object. A small `bun run` script in `mastra/scripts/check-memory.ts` is fine; do not add it to the package.
    - Call `setBrief` with the Implementor role (pass the role explicitly in the tool input) → the call throws synchronously and Studio shows the error.
2. **Persistence.** Stop the dev server, restart, reopen `proj-1` in Studio → prior messages and the working-memory `brief` are still there. Confirms `LibSQLStore` is writing to `./mastra/data/motion-graphics-agent.db` (the file should exist on disk).
3. **Conversation compression.** Send enough turns in the Playground to cross the Observational Memory `messageTokens` threshold; Studio's Memory tab shows the observation log filling in, and the `brief` still reads back unchanged from working memory.

Acceptance = all three pass _and_ the constraints below hold (Implementor has zero setter tools, every agent declares `workingMemory.readOnly: true`).

## Constraints

- No agent calls Mastra's built-in `updateWorkingMemory` tool. Every agent has `workingMemory.readOnly: true`. Writes go through the role-guarded tools in `access.ts`.
- Subagent delegations (T2) must pass the parent `threadId` and `resourceId` to `agent.generate(...)`; otherwise the subagent gets a fresh thread with empty working memory and cannot see the brief. Document this in `access.ts` JSDoc.
- The Implementor must not be passed any setter tool from this module.

## Model wiring (Azure OpenAI)

This project's LLM endpoint is Azure OpenAI's `/openai/v1` surface (OpenAI-compatible). Use the standard `@ai-sdk/openai` provider with `baseURL` pointed at the resource and a small `fetch` wrapper that injects `?api-version=preview` on every request. Centralize this so every agent in T2/T3/T4 imports the same factory:

```ts
// mastra/src/mastra/model.ts
import { createOpenAI } from "@ai-sdk/openai";

const baseURL = `https://${process.env.AZURE_RESOURCE_NAME}.openai.azure.com/openai/v1`;

const azureFetch: typeof fetch = (input, init) => {
    const url = new URL(input.toString());
    url.searchParams.set("api-version", process.env.AZURE_API_VERSION!);
    return fetch(url, init);
};

const openai = createOpenAI({
    apiKey: process.env.AZURE_API_KEY!,
    baseURL,
    fetch: azureFetch,
});

export const agentModel = () => openai.chat(process.env.AZURE_CHAT_DEPLOYMENT!);
```

Then in each agent: `new Agent({ ..., model: agentModel() })`. Verified working by `mastra/smoke.ts`. See `.env.example` for the env vars.

**Gotchas worth knowing**:

- `AZURE_API_VERSION` must be `preview` (or `latest`), not a date like `2025-01-01-preview`. Date versions are only valid against the legacy `/openai/deployments/<dep>/...` URL shape; the `/openai/v1` surface rejects them with `400 API version not supported`.
- Don't use `@ai-sdk/azure` — its v3 line forces the `/openai/v1` URL but doesn't expose the api-version override cleanly. Plain `@ai-sdk/openai` + custom fetch is simpler and correct.
- Don't use Mastra's model-router string form (`model: "openai/<dep>"`) — recent versions route through `/responses`, which Azure's input validator rejects.

## Reference

- [`phase-3-memory-knowledge-uploads.md`](phase-3-memory-knowledge-uploads.md) — overall T1 overview
- [`phase-3-knowledge-and-uploads.md`](phase-3-knowledge-and-uploads.md) — Track B (consumes `addAsset` and `Asset` schema from here)
- [`phase-3-planner-agent.md`](phase-3-planner-agent.md) — supervisor wiring + `delegation` hooks that invoke subagents using these helpers
- Mastra Memory overview: <https://mastra.ai/docs/memory/overview>
- Working memory (schema mode, scopes, readOnly): <https://mastra.ai/docs/memory/working-memory>
- Observational Memory: <https://mastra.ai/docs/memory/observational-memory>
- LibSQL: <https://docs.turso.tech/sdk/ts/quickstart>
