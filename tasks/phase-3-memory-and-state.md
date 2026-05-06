# Phase 3 — T1A — Memory & Workspace State

> **Status: Complete.** Backend layer implemented and verified. Long-form delivery record: [`phase-3-memory-and-state-delivery-notes.md`](phase-3-memory-and-state-delivery-notes.md).

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
mastra/src/mastra/
  model.ts              # shared Azure `agentModel()` factory (T2/T3/T4 + T1B import this)
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

`projectId` doubles as `threadId` (and `resourceId`) when invoking agents. Mastra working memory schema mode is documented as merge-semantics, but in our installed version direct partial writes via `memory.updateWorkingMemory(...)` did **not** preserve untouched object fields reliably — see [Delivery Summary](#delivery-summary). All setters in `access.ts` therefore do explicit read-modify-write.

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
- Configuration lives in `memory/index.ts`. Defaults shipped as: observation triggers above ~30k message tokens; reflection above ~40k observation tokens; OM uses the shared `agentModel()`.

There is **no** `summarizer.ts` and **no** `readContext()` helper. Agents read context the normal Mastra way (`memory: { thread, resource }` on `agent.generate(...)`).

## Wiring

- `memory/index.ts` exports `memory` and `storage`. `memory/access.ts` exports the four role-guarded tools. T2/T3/T4 import these. Track B imports `addAsset` from `access.ts`.
- Each agent (T2/T3/T4) gets the shared `Memory` instance with `workingMemory.readOnly: true` and **only** the setter tools that match its role attached.
- Root `Mastra({ ... })` keeps the named registry `memory: { workspace: memory }` so `mastra.getMemory("workspace")` and Studio's Memory tab work. Tools live on agents — there is no global `tools: { ... }` block on `Mastra`.

## Configuration

```env
# mastra/.env (Track A's vars)
LIBSQL_URL=file:/absolute/path/to/data/motion-graphics-agent.db
```

The same `LIBSQL_URL` is reused by Track B for its vector index. **Use an absolute `file:` path.** Relative paths did not resolve consistently under `mastra dev`'s bundler (observed: `Unable to open connection to local database`).

## Checkpoints

Verified via Mastra Studio and deterministic backend scripts (Studio's Working Memory panel was unreliable on its own — it sometimes showed the schema template instead of the live WM). Run from `mastra/`:

```powershell
bun run smoke.ts                      # Azure chat + embedding wire proof
bun run scripts/test-memory-tools.ts  # all four setters + role rejection (PASS)
bun --filter mastra dev               # opens Studio for manual spot checks
```

1. **Memory roundtrip — PASS.** `test-memory-tools.ts` calls `setBrief` (planner), `setStyleContext` (artDirector), `setSceneDesign` (artDirector), `addAsset` (system) against `threadId='proj-1'`, then reads WM back and asserts the full `WorkspaceState` shape (`projectId`, `brief`, `styleContext`, `sceneRegistry`, `assets`).
2. **Role rejection — PASS.** Same script calls each setter with a wrong role; each throws synchronously and WM is asserted unchanged.
3. **Persistence — PASS.** Stop dev server, restart, reopen `proj-1` → prior messages and the working-memory `brief` are still there. The DB file exists on disk at the configured `LIBSQL_URL`.
4. **Conversation compression — configured, runtime-confirmation pending.** Observational Memory is enabled in `memory/index.ts` with the shared model and thread scope; visibly proving the threshold trigger requires Studio-driven traffic past ~30k message tokens.

Acceptance = (1)–(3) pass _and_ the constraints below hold (Implementor has zero setter tools, every agent that lands in T2/T3/T4 declares `workingMemory.readOnly: true`).

## Constraints

- No agent calls Mastra's built-in `updateWorkingMemory` tool. Every agent has `workingMemory.readOnly: true`. Writes go through the role-guarded tools in `access.ts`.
- Subagent delegations (T2) must pass the parent `threadId` and `resourceId` to `agent.generate(...)`; otherwise the subagent gets a fresh thread with empty working memory and cannot see the brief. Documented in `access.ts` JSDoc.
- The Implementor must not be passed any setter tool from this module.
- `addAsset` is **system-only** and is never attached to any agent's `tools`. T1B imports it directly into the upload handlers.

## Model wiring (Azure OpenAI)

This project's LLM endpoint is Azure OpenAI. Use the purpose-built `@ai-sdk/azure` provider and centralize the factory so every agent in T2/T3/T4 imports the same model:

```ts
// mastra/src/mastra/model.ts (shape)
import { createAzure } from "@ai-sdk/azure";
import { requireEnv } from "./utils/env.ts";

const azure = createAzure({
    resourceName: requireEnv("AZURE_RESOURCE_NAME"),
    apiKey: requireEnv("AZURE_API_KEY"),
    apiVersion: requireEnv("AZURE_API_VERSION"),
});

export const agentModel = () => azure(requireEnv("AZURE_CHAT_DEPLOYMENT"));
export const embeddingModel = () => azure.embedding(requireEnv("AZURE_EMBEDDING_DEPLOYMENT"));
```

Then in each agent: `new Agent({ ..., model: agentModel() })`. T1B imports `embeddingModel()`. Verified by `mastra/smoke.ts`. See `.env.example` for the env vars.

**Provider choice.** Earlier drafts used `@ai-sdk/openai` plus a custom `fetch` wrapper to inject `api-version` on Azure's `/openai/v1` surface. That works, but it is fragile: a query string in `baseURL` breaks path concatenation, and module load order must guarantee env is loaded before provider construction. `@ai-sdk/azure` removes those edge cases and is what `mastra/smoke.ts` now proves.

**Gotchas worth knowing**:

- `AZURE_API_VERSION` must be `preview` (or `latest`), not a date like `2025-01-01-preview`. Date versions are only valid against the legacy `/openai/deployments/<dep>/...` URL shape; the `/openai/v1` surface rejects them with `400 API version not supported`.
- Don't use Mastra's model-router string form (`model: "openai/<dep>"`) — recent versions route through `/responses`, which Azure's input validator rejects (`Invalid value: ''`).
- Don't reintroduce the custom-`fetch` `baseURL` pattern unless there is a concrete multi-provider reason and the smoke test is updated to cover it.

## Delivery Summary

Final files (all production):

- `mastra/src/mastra/memory/schema.ts`
- `mastra/src/mastra/memory/index.ts`
- `mastra/src/mastra/memory/access.ts`
- `mastra/src/mastra/model.ts`
- `mastra/src/mastra/utils/env.ts` (shared `requireEnv` helper)

Verification scaffolding (delete when T2 lands and ships the real Planner / Art Director / Implementor wiring):

- `mastra/src/mastra/index.ts` — `memoryTestAgent` + root `Mastra` registration.
- `mastra/scripts/test-memory-tools.ts` — backend-deterministic acceptance proof for the four setters and role rejection. Not registered in `package.json` scripts; kept as a regression guard against the merge-semantics and `projectId`-drop bugs.

Bugs hit during verification and how they were resolved:

1. **LibSQL relative path under `mastra dev`** → use absolute `file:` path in `mastra/.env`.
2. **Studio Working Memory panel unreliable** (template view leaked over live state) → moved acceptance proof to `scripts/test-memory-tools.ts`; Studio is now spot-check only.
3. **Direct partial WM writes did not merge** in this version's direct-API path — a later `setStyleContext` could clobber an earlier `brief`. Fix: explicit read-modify-write in every setter before `memory.updateWorkingMemory(...)`.
4. **`projectId` dropped on partial writes** (schema-required, not preserved by partial-write attempt). Fix covered by (3): build the full next state before writing.

Architectural caveat carried forward: `memoryTestAgent` exposes more setter tools than any one production agent should. Real role-separated tool exposure (`setBrief` → Planner only, `setStyleContext` + `setSceneDesign` → Art Director only, no setters on Implementor) is enforced when T2/T3/T4 wire the actual agents. T1A backend role guards in `access.ts` already reject wrong-role calls regardless of which agent invokes them.

## Reference

- [`phase-3-memory-and-state-delivery-notes.md`](phase-3-memory-and-state-delivery-notes.md) — long-form delivery record (chronology, root-cause analysis, evidence)
- [`phase-3-memory-knowledge-uploads.md`](phase-3-memory-knowledge-uploads.md) — overall T1 overview
- [`phase-3-knowledge-and-uploads.md`](phase-3-knowledge-and-uploads.md) — Track B (consumes `addAsset` and `Asset` schema from here)
- [`phase-3-planner-agent.md`](phase-3-planner-agent.md) — supervisor wiring + `delegation` hooks that invoke subagents using these helpers
- Mastra Memory overview: <https://mastra.ai/docs/memory/overview>
- Working memory (schema mode, scopes, readOnly): <https://mastra.ai/docs/memory/working-memory>
- Observational Memory: <https://mastra.ai/docs/memory/observational-memory>
- LibSQL: <https://docs.turso.tech/sdk/ts/quickstart>
