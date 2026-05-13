# The Working Memory Dilemma

> Status: **Open question.** Current code uses Option B (soft instruction guard).
> Last reviewed against `@mastra/core@1.25.0`, `@mastra/memory@1.15.1`.

## Source-verified facts (do not re-research)

These are pinned here so we don't grep `node_modules` for them again.

- **Calling agent's id is framework-supplied at tool-call time.** Mastra
  passes a `context.agent` object to each `tool.execute(input, context)`
  call, with the calling agent's id under `context.agent.agentId`.
  Source: `@mastra/core` v1.25
  `chunk-GYS4EMOL.js:17981` (`agent: { agentId: agent.id, ... }`).
  Type: `@mastra/core/.../tools/types.d.ts:21-30`
  (`AgentToolExecutionContext.agentId: string`).
  The model cannot forge it — it is set by the framework, not by the
  tool input. Use this for caller identity, not a self-asserted `role`
  argument.
- **Mastra's auto `updateWorkingMemory` tool is registered iff
  `workingMemory.enabled && !readOnly`.** Source:
  `@mastra/memory` v1.15 `index.js:17924-17929`. The `readOnly` flag
  lives at `memory.options.readOnly` (top level, not inside
  `workingMemory`); it also disables chat-message persistence as a
  side effect — `@mastra/core/.../memory/types.d.ts:673`.

This document records the architectural problem we hit while testing T1A in
Mastra Studio, the symptom that made it visible, and the full set of
options for resolving it. It is meant to be read once and revisited when
T2 (Planner) and T3 (Art Director) start wiring real role-separated
agents.

## Background

T1A defines four owned fields on `WorkspaceState`:

| Field                     | Owner                   | Sanctioned writer tool |
| ------------------------- | ----------------------- | ---------------------- |
| `brief`                   | Planner                 | `setBrief`             |
| `styleContext`            | Art Director            | `setStyleContext`      |
| `sceneRegistry[n].design` | Art Director            | `setSceneDesign`       |
| `assets`                  | Upload handler (system) | `addAsset`             |

Each setter validates the caller's `role` argument at the top of `execute`,
reads the current working memory, applies a partial update, and writes.
See `mastra/src/mastra/memory/access.ts`. The Implementor never receives
any of these tools.

This is the only spec-sanctioned path into working memory.

## A second, related problem: the `role` argument was self-asserted

> **Resolved (Option 1 applied).** The setters now read caller identity
> from `context.agent.agentId` and check it against a per-tool allowlist
> in `mastra/src/mastra/memory/access.ts`. The `role` field has been
> removed from `SetBriefInput` / `SetStyleContextInput` /
> `SetSceneDesignInput`. `addAsset` keeps `role: "system"` because it
> is system-only and not invoked from an agent context.
>
> Belt-and-suspenders is **not yet complete**: Option 2 (per-agent tool
> exposure) is still future work. See "Future work" below.

The original problem, kept here for reference:

The setters used to take `role` as a tool **input**:

```ts
const SetBriefInput = z.object({
  role: Role,                // ← supplied by the model
  brief: BriefSchema,
});
```

The check inside `execute` is just a string comparison against that
input:

```ts
if (role !== "planner") {
  throw new Error("setBrief requires planner role");
}
```

Nothing verifies that the *agent making the call* is actually the
Planner. Any agent that has `setBrief` attached and chooses to pass
`role: "planner"` will pass the guard — including a misconfigured Art
Director, a future Implementor with a bad tool list, or a sub-delegated
agent the Planner has spawned. The role guard is **claim-based, not
identity-based**.

Today this is masked by the fact that we only attach `setBrief` to the
single T1 test agent. But the moment T2/T3 wire three real agents, two
things stop being safe:

1. A bug in the agent's `tools: { ... }` map (e.g. the Art Director
   accidentally getting `setBrief` because of a wrong import) becomes a
   silent invariant break — the role check won't catch it.
2. An LLM can be prompt-injected through user input or retrieved
   knowledge into impersonating another role. `role: "planner"` is
   three tokens.

What we actually want is **caller identity from the framework**, not a
self-asserted argument. Two source-verified ways to obtain it:

- `context.agent` already gives us `threadId` / `resourceId` (we use
  this for `projectId`). Whether it also surfaces a stable agent
  identifier we can map back to a role needs verification per Mastra
  version. If yes, drop `role` from the input schema and look up the
  caller's role from a hard-coded map in `access.ts`.
- Per-agent tool exposure. Don't attach `setBrief` to anyone but the
  Planner. Drop `role` entirely. The wiring in
  `mastra/src/mastra/index.ts` (and later T2/T3) becomes the source of
  truth: if an agent has the tool, it is allowed to use it; if it
  doesn't, it can't. The role check inside `execute` becomes redundant
  and gets deleted.

The second is what `tasks/T1A-memory-and-state.md` already
prescribes ("Exposing **only** the role-correct setter tools to each
agent"); the current `role` argument is a leftover from when the test
agent held all three setters at once. It will go away when T2/T3 land
and each agent is given exactly one writer tool.

## Future work — per-agent tool exposure (Option 2)

The identity check above (Option 1) is one half of the answer. The
spec's intended primary ACL is **wiring**: each agent gets only the
tools that match its role.

| Agent             | Tools attached                     |
| ----------------- | ---------------------------------- |
| Planner           | `setBrief`                         |
| Art Director      | `setStyleContext`, `setSceneDesign`|
| Implementor       | _(no working-memory writers)_      |

This is what `tasks/T1A-memory-and-state.md` already prescribes.
Today the T1 test agent holds all three setters because it stands in
for every role. When T2/T3/T4 land, each real agent gets exactly its
allowed tools and the allowlist in `access.ts` becomes the dead-man
switch that catches wiring drift, not the primary gate.

Concrete checklist for that cutover:

- Plumb each role-specific agent into `mastra/src/mastra/index.ts` with
  only its sanctioned setters in `tools: { ... }`.
- Remove `"t1-test-agent"` from `SET_BRIEF_ALLOWED` /
  `SET_STYLE_CONTEXT_ALLOWED` / `SET_SCENE_DESIGN_ALLOWED` in
  `access.ts` once the test agent is deleted.
- Add the real agent ids (`"planner"`, `"art-director"`) to the
  allowlists if they aren't already.

## What Mastra ships by default

When a `Memory` instance is created with `options.workingMemory.enabled: true`,
`@mastra/memory` (v1.15) injects an extra tool named `updateWorkingMemory`
into every agent that uses that memory:

```ts
// node_modules/.bun/@mastra+memory@1.15.1/.../dist/index.js:17924
listTools(config) {
  const mergedConfig = this.getMergedThreadConfig(config);
  const tools = {};
  if (mergedConfig.workingMemory?.enabled && !mergedConfig.readOnly) {
    tools.updateWorkingMemory = ...;
  }
  ...
}
```

That auto-tool:

- Accepts the **entire** working memory blob as input.
- Deep-merges it into existing memory.
- **Has no `role` field, no role check, no field ACL.**
- Is presented to the model on every turn alongside our own tools.

This bypasses every guarantee the access layer was built to provide.

## Symptom we observed

While running the four-turn test in
`mastra/src/mastra/index.ts`'s T1 test agent, Studio's tool-call panel
showed something like this on every state-changing turn:

```text
1. setBrief({ role: "planner", brief: { ... } })   ← correct path
2. updateWorkingMemory({                            ← auto-tool, unguarded
     memory: {
       projectId: "current",                        ← LLM hallucinated
       brief: { ... copy of (1) ... },
       styleContext: { palette: [], ... },          ← partially fabricated
       ...
     }
   })
```

Concretely:

1. The LLM called `setBrief` correctly. Working memory now had the right
   `projectId` (the auto-generated thread UUID) and a valid brief.
2. The LLM then called `updateWorkingMemory` on its own initiative.
   Because the deep-merge replaces top-level scalars wholesale, the
   correct `projectId: "<uuid>"` got overwritten with the literal string
   `"current"` that the LLM made up.
3. Same call also wrote empty/placeholder `styleContext` fields the
   Art Director never produced.

T1A's invariant "writes are role-validated" was technically violated on
every turn, even though the user-visible result of `setBrief` was
correct.

We mitigated the most painful half by **removing `projectId` from
`WorkspaceStateSchema`** — the Mastra row's `threadId` IS the project id
by convention, and not putting it in the JSON blob means the LLM has
nothing to clobber. But the auto-tool is still there, still un-role-guarded,
and still writeable.

## The dilemma in one sentence

**Either we keep the Mastra-managed working memory feature
(prompt injection + Studio Memory tab + schema validation) and accept
that an LLM can write whatever it wants directly, OR we suppress that
feature and lose its niceties.**

There is no "third Mastra setting" that gives us schema-injection without
also exposing the writer tool — we read the source.

## Options

Each option is a complete strategy. They can be combined per-agent in the
real T2/T3/T4 wiring (e.g. Implementor uses A, Planner uses B), but for
the T1 test agent we have to pick one starting point.

### Option A — Hard suppression via `readOnly: true`

**What:** set `readOnly: true` at the top level of the agent's memory
config (sibling to `workingMemory`, not nested inside it).

```ts
const memory = new Memory({
  storage,
  options: {
    readOnly: true,                     // suppresses updateWorkingMemory
    workingMemory: {
      enabled: true,
      schema: WorkspaceStateSchema,
      scope: "thread",
    },
  },
});
```

**Effect:** `listTools` returns `{}` for the working-memory family. The
LLM never sees `updateWorkingMemory`. Schema is still injected into the
system prompt; reads still work; Studio's Memory tab still renders.

**Cost (real):** the same `readOnly` flag also disables **chat message
persistence**. Quoting the type docstring at
`@mastra/core/.../memory/types.d.ts:673`:

> When true, prevents memory from saving new messages. Useful for
> internal agents (like routing agents) that should read memory but not
> modify it.

So Studio's chat history will not persist across page reloads for that
agent. For internal/orchestration agents (the Planner's hidden subagent
calls, the Art Director, the Implementor) this is **fine** — those
turns aren't user-visible chats. For the user-facing top-level agent
(MVP-era "test agent", and eventually the Planner's primary surface),
it's a regression we'd have to compensate for elsewhere.

**Recommended for:** subagents that don't need their own visible
conversation log (Art Director, Implementor, Planner-as-supervisor
delegations).

### Option B — Soft instruction guard (current state)

**What:** leave the auto-tool registered, but tell the agent in
instructions never to use it, and only ever go through `setBrief` /
`setStyleContext` / `setSceneDesign`.

Current implementation in `mastra/src/mastra/index.ts`:

```text
"NEVER call updateWorkingMemory directly. It bypasses role checks and
will write incorrect data. Every working-memory mutation must go through
setBrief / setStyleContext / setSceneDesign — those are the only
sanctioned writers."
```

**Effect:** schema injection still works; chat history persists; Studio
Memory tab still works.

**Cost:** **soft guarantee only.** A single instruction-following slip
and the LLM writes whatever it wants. The role-check throw in our
setters never gets a chance to run because the bypass tool doesn't go
through them.

**Recommended for:** the test phase only. Acceptable as a stopgap, not
acceptable as a Phase-3-final invariant.

### Option C — Remove the tool via input processor

**What:** keep `enabled: true` (so we keep schema injection and the
Studio tab), but register an `inputProcessors` entry on the agent that
strips `updateWorkingMemory` from the tool list before each turn.

`@mastra/core/agent` accepts `inputProcessors` (see
`agent/types.d.ts:303`). A processor runs before the model call and can
mutate the available tool set. We'd write a small one that filters by
tool id.

**Effect:** hard guarantee (LLM literally never sees the tool), schema
injection retained, chat persistence retained, no `readOnly` side
effects. This is the "best of both" path.

**Cost:** custom code we have to maintain across Mastra upgrades. The
processor API surface is moderately large; if Mastra renames or
restructures the working-memory tool, our filter goes stale silently
(it just stops filtering and we're back to Option B without noticing).

**Recommended for:** the long-term answer if A's `readOnly` side effect
turns out to be a real blocker for the Planner.

### Option D — Drop schema mode, use template mode

**What:** swap `workingMemory.schema` for `workingMemory.template`
(markdown). The agent then writes a markdown blob instead of a typed
JSON object.

**Effect:** the `updateWorkingMemory` tool still exists, so this does
**not** solve the bypass problem. Mentioned only to dismiss it: switching
to template mode has been considered as a way to escape schema-related
issues, but it is irrelevant to this dilemma.

**Recommended for:** nothing in this context.

### Option E — Don't use Mastra working memory at all

**What:** ignore `@mastra/memory` working memory entirely. Store
`WorkspaceState` in our own LibSQL table keyed by `projectId`. Wire
reads explicitly (e.g. a `getWorkspaceState` tool plus a hand-rolled
prompt-injection processor) and writes through `setBrief` etc.

**Effect:** total control over the access surface — no auto-tools, no
hidden writers, no schema-injection coupling. We fully own the storage
shape.

**Cost:** large. We re-implement the parts of `@mastra/memory` we
actually use:

- Working memory persistence (a table, an upsert).
- System-prompt injection of current state (custom input processor).
- Studio integration (Mastra's Memory tab won't show our table).
- Migration for any existing data when we cut over.

We also leave behind Mastra's free improvements (vector recall on WM,
schema-aware merge semantics, OM hookup).

**Recommended for:** never, unless Mastra's working memory becomes
actively hostile to our model. Today it's only mildly inconvenient.

## Recommendation

Phase out of Option B as soon as a real agent role lands.

Concrete plan:

1. **Now (T1 test agent):** stay on Option B. The instruction guard plus
   schema cleanup (no `projectId` field) is enough to validate
   end-to-end ingestion + retrieval + working-memory writes in Studio.
2. **T2/T3 (Planner / Art Director):** when those agents are added to
   `mastra/src/mastra/index.ts`, give each agent its own `Memory`
   binding configured with **Option A (`readOnly: true`)** for any
   subagent surface that doesn't need its own chat history. The Planner
   *primary* surface keeps message persistence and stays on Option B
   short term — re-evaluate against C once the Planner is stable.
3. **Hard cutover (before declaring T1 done):** if Option A's
   message-persistence side effect blocks the Planner, build the
   **Option C** input processor and switch every agent over. Document
   the processor in `mastra/src/mastra/memory/` next to `access.ts`.
4. **At the same cutover, fix the self-asserted `role`.** Drop the
   `role` field from `SetBriefInput` / `SetStyleContextInput` /
   `SetSceneDesignInput`, attach each tool to exactly one agent, and
   delete the `role !== "planner"` style checks. The wiring in
   `index.ts` becomes the only ACL.

Option E stays off the table unless we hit a third unrelated bug in
Mastra's working memory. We do not write our own state store on
speculation.

## What lives where if you forget

| Concern | Touchpoint |
|---|---|
| Role-guarded setters | `mastra/src/mastra/memory/access.ts` |
| WorkspaceState schema (no `projectId` field) | `mastra/src/mastra/memory/schema.ts` |
| Memory instance config | `mastra/src/mastra/memory/index.ts` |
| Soft instruction guard text | `mastra/src/mastra/index.ts` (`t1TestAgent.instructions`) |
| Source where Mastra registers the auto-tool | `node_modules/.bun/@mastra+memory@1.15.1/.../dist/index.js:17924` |
| `readOnly` flag location | `@mastra/core` `memory/types.d.ts:682` (`BaseMemoryConfig.readOnly`) |
| Spec doc | `tasks/T1A-memory-and-state.md` |

## Open questions for the next reviewer

- Does the Planner's user-facing chat actually need Mastra-persisted
  messages, or are we OK relying on the chat client (Studio / our web
  UI) to keep its own log? If the latter, Option A becomes safe
  everywhere.
- If we go with Option C, where should the input processor live, and
  who tests it across Mastra upgrades?
- Is there a future Mastra version that exposes a per-tool suppression
  flag inside `workingMemory` itself? Worth checking on each upgrade.
