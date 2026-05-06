# Phase 3 - T1A Delivery Notes

This document records the full T1A implementation path: what was built, what bugs appeared during verification, what was changed in response, what the final code does, and what evidence supports delivery.

## Scope

T1A owns the shared conversation-memory and Workspace State layer for Phase 3:

- thread-scoped working memory for structured project state
- observational memory for long-running conversation compression
- role-guarded write tools for Workspace State mutation
- shared storage backed by LibSQL

The final core implementation lives under:

- `mastra/src/mastra/memory/schema.ts`
- `mastra/src/mastra/memory/index.ts`
- `mastra/src/mastra/memory/access.ts`
- `mastra/src/mastra/model.ts`

Temporary verification scaffolding also exists in:

- `mastra/src/mastra/index.ts`
- `mastra/scripts/check-memory.ts`
- `mastra/scripts/test-memory-tools.ts`

## Final Code Shape

### 1. Workspace State Schema

File:

- `mastra/src/mastra/memory/schema.ts`

Implemented schemas:

- `BriefSchema`
- `StyleContextSchema`
- `SceneRecordSchema`
- `AssetSchema`
- `WorkspaceStateSchema`

This matches the T1A spec shape:

- `projectId`
- `brief`
- `styleContext`
- `sceneRegistry`
- `assets`

Important notes:

- `AssetSchema` stays aligned with the T1A/T1B contract.
- `sceneRegistry` and `assets` default to empty arrays.
- `brief` and `styleContext` are optional.

### 2. Shared Memory and Storage

File:

- `mastra/src/mastra/memory/index.ts`

Implemented:

- `storage = new LibSQLStore(...)`
- `memory = new Memory(...)`

Memory configuration:

- `workingMemory.enabled = true`
- `workingMemory.scope = "thread"`
- `workingMemory.schema = WorkspaceStateSchema`
- `observationalMemory.model = agentModel()`
- `observationalMemory.scope = "thread"`

Identity rule:

- `threadId === projectId === resourceId`

### 3. Azure Model Wiring

File:

- `mastra/src/mastra/model.ts`

Implemented:

- shared `requireEnv(...)`
- Azure `/openai/v1` `baseURL`
- `fetch` wrapper that injects `api-version`
- shared `agentModel()`

This centralizes model wiring so T2/T3/T4 can reuse it.

### 4. Role-Guarded Write Tools

File:

- `mastra/src/mastra/memory/access.ts`

Implemented tools:

- `setBrief`
- `setStyleContext`
- `setSceneDesign`
- `addAsset`

Role ownership enforced in code:

- `setBrief` -> `planner`
- `setStyleContext` -> `artDirector`
- `setSceneDesign` -> `artDirector`
- `addAsset` -> `system`

Shared helper behavior:

- `ensureThread(projectId)` creates the thread if missing
- `readWorkspaceState(projectId)` reads and validates current WM
- every setter writes against `threadId = resourceId = projectId`

Final write pattern:

- all setters use explicit read-modify-write before `memory.updateWorkingMemory(...)`

Why:

- this was the most reliable behavior in runtime verification for this installed Mastra version and our direct update path

### 5. Temporary Studio Agent

File:

- `mastra/src/mastra/index.ts`

Implemented:

- shared `Mastra` instance
- temporary `memoryTestAgent`

Current purpose:

- Studio verification only

Important limitation:

- this agent is broader than the final architecture and should be treated as scaffolding, not production role wiring

### 6. Verification Scripts

Files:

- `mastra/scripts/check-memory.ts`
- `mastra/scripts/test-memory-tools.ts`

Purpose:

- `check-memory.ts` reads WM directly for a thread/resource pair
- `test-memory-tools.ts` performs deterministic backend verification of all four tools

## Chronology Of What Happened

### Step 1. Initial T1A implementation

The memory layer was scaffolded from the Phase 3 task spec:

- schema definitions
- shared `Memory`
- shared `LibSQLStore`
- role-guarded setter tools
- temporary Studio test agent

At this point the repo had the right major pieces, but verification was still light.

### Step 2. `model.ts` was added

The Azure wiring was initially local to the Mastra entrypoint for the temporary test agent.

Then `mastra/src/mastra/model.ts` was created so:

- the T1A implementation matched the task’s intended shared model wiring
- T2/T3/T4 can import the same `agentModel()`

### Step 3. Smoke test issues were fixed

`mastra/smoke.ts` had two important compatibility issues with the installed toolchain:

- Bun’s `typeof fetch` required `preconnect`
- `Agent` required `id`

These were fixed so:

- `tsc --noEmit -p mastra/tsconfig.json` passed
- `smoke.ts` remained usable as the Azure wire proof

### Step 4. LibSQL path issues appeared under `mastra dev`

When running Studio:

- relative `LIBSQL_URL` values did not resolve consistently under the dev bundle

Observed symptom:

- `Unable to open connection to local database ...`

Working workaround:

- use an absolute `file:` path in `mastra/.env`

This was a runtime environment issue, not a memory-schema issue.

### Step 5. Studio Working Memory UI proved unreliable

During Studio testing:

- tool/chat responses sometimes claimed data was saved
- the Working Memory panel sometimes showed only the template view
- the panel could appear stale or misleading

This made Studio alone an unreliable proof source.

That is why deterministic backend verification scripts were added later.

### Step 6. Shared-memory vs read-only test-agent behavior caused confusion

Two temporary-agent approaches were tried:

1. Use the shared `memory` instance directly
2. Use a separate read-only `Memory` instance for Studio testing

What happened:

- shared memory made writes visible more reliably
- but chat behavior could also influence or confuse WM state during testing
- read-only memory reduced overwrite risk
- but it made Studio verification behavior less consistent in practice

Conclusion:

- the temporary test agent is inherently awkward in this repo stage
- the real reliable verification path had to move to scripts

### Step 7. Direct partial writes were attempted

At one point:

- `setBrief` and `setStyleContext` were simplified to direct partial WM writes

The reasoning was:

- the Mastra schema-mode docs describe merge semantics

Example attempted pattern:

- `JSON.stringify({ brief })`
- `JSON.stringify({ styleContext })`

### Step 8. Runtime behavior disproved that assumption for our direct update path

Deterministic testing showed:

- a later direct update could replace previously stored object fields instead of preserving them

Concrete symptom:

- after a successful `setBrief`, a later `setStyleContext` write could leave only `styleContext`
- previously saved `brief` disappeared

That meant:

- relying on implicit merge semantics through our direct `memory.updateWorkingMemory(...)` usage was not safe enough

### Step 9. `projectId` persistence issue was found and fixed

During script verification, another bug appeared:

- partial writes omitted `projectId`
- but `WorkspaceStateSchema` requires `projectId`

This was one more sign that explicit state construction was safer than relying on partial persistence assumptions.

### Step 10. Final setter logic returned to explicit read-modify-write

The final implementation restored and kept explicit read-modify-write for:

- `setBrief`
- `setStyleContext`
- `setSceneDesign`
- `addAsset`

This is now intentional, not accidental.

Reason:

- it gave the most stable and correct runtime behavior for the installed version and direct WM API path

### Step 11. Deterministic verification scripts were added

To avoid relying on Studio behavior, two scripts were added:

- `check-memory.ts`
- `test-memory-tools.ts`

The stricter test script now verifies:

- each valid-role call stores data correctly
- each invalid-role call throws
- each invalid-role call leaves working memory unchanged
- the final stored `WorkspaceState` matches expected values

## Root Cause Summary Of The Bugs

### Bug source 1. Studio UI ambiguity

Not a backend bug.

Observed:

- Working Memory panel sometimes showed template or stale state

Impact:

- created false signals during manual testing

### Bug source 2. Temporary-agent verification complexity

Not a schema bug.

Observed:

- switching between shared-memory and read-only-memory test-agent setups changed verification behavior

Impact:

- made it harder to separate real storage behavior from Studio behavior

### Bug source 3. Incorrect assumption about direct partial WM writes

This was a real implementation issue.

Observed:

- direct partial writes through `memory.updateWorkingMemory(...)` did not preserve existing object fields reliably enough for our use

Impact:

- data could appear to be overwritten rather than merged

Final fix:

- explicit read-modify-write for all setters

### Bug source 4. Missing `projectId` in partial state

This was a real implementation issue.

Observed:

- schema-required `projectId` was not always preserved in the partial-write attempt

Final fix:

- build the next full state explicitly before writing

## Final Verification Evidence

### TypeScript

Verified with:

```powershell
node .\node_modules\typescript\bin\tsc --noEmit -p .\mastra\tsconfig.json
```

Result:

- passed

### Azure wire check

Verified with:

```powershell
cd mastra
bun run smoke.ts
```

Purpose:

- prove Azure OpenAI chat + embedding wiring is live

### End-to-end memory tool verification

Verified with:

```powershell
cd mastra
bun run scripts/test-memory-tools.ts
```

What this proves:

- valid `setBrief` writes persist
- valid `setStyleContext` writes persist
- valid `setSceneDesign` writes persist
- valid `addAsset` writes persist
- invalid-role calls are rejected
- invalid-role calls do not mutate WM

Final verified WM shape from the script includes:

- `projectId`
- `brief`
- `styleContext`
- `sceneRegistry`
- `assets`

### Direct read check

Available with:

```powershell
cd mastra
bun run scripts/check-memory.ts <threadId> <resourceId>
```

Purpose:

- verify stored working memory directly without depending on Studio’s panel

## Compression / Observational Memory Status

Configured in code:

- yes

Location:

- `mastra/src/mastra/memory/index.ts`

Current config:

- observational memory enabled
- shared Azure model
- thread scope

Default thresholds:

- observation begins when message history exceeds `30,000` tokens
- reflection begins when observations exceed `40,000` tokens

Current status:

- configuration is correct from code
- manual runtime compression behavior still needs Studio-driven traffic to be visibly proven

So the accurate delivery statement is:

- observational memory is correctly configured in code
- structured working memory is fully backend-verified
- visible compression behavior still requires manual Studio confirmation if the task reviewer specifically wants to see it happen

## Constraint Status

### Satisfied in backend code

- role guards exist for all four tools
- wrong-role calls do not store data
- thread/resource/project identity alignment is enforced in tool calls
- shared memory and shared storage exist
- Workspace State schema is implemented

### Temporary / not final architecture

- `memoryTestAgent` is verification scaffolding
- it exposes more tools than a final role-separated production agent should
- final Planner / Art Director / Implementor tool exposure belongs to T2 / T3 / T4
- `memoryTestAgent` currently uses the shared `memory` instance directly for Studio verification
- because of that, it is not the final spec-tight read-only agent wiring
- the real read-only enforcement should be applied when T2 / T3 / T4 wire the actual Planner / Art Director / Implementor generation paths
- this was intentionally left as documentation rather than a last-minute T1A wiring change, because the backend tools are already verified and changing the temporary Studio agent risked reintroducing the verification instability we observed

## Recommended Delivery Proof

Primary proof:

```powershell
cd mastra
bun run smoke.ts
bun run scripts/test-memory-tools.ts
```

Optional direct inspection:

```powershell
cd mastra
bun run scripts/check-memory.ts <threadId> <resourceId>
```

Optional Studio spot checks:

- start `bun run dev`
- open `memoryTestAgent`
- use a fresh thread
- run tool calls
- visually confirm wrong-role failures
- restart Studio and confirm saved thread reads back

## Final Summary

The final T1A backend deliverable is in a good handoff state.

Most important final conclusions:

- the schema and shared memory/storage layers are implemented
- all four Workspace State setter tools are implemented
- wrong-role calls are rejected and verified not to mutate memory
- deterministic backend verification now exists and passes
- the main debugging problems came from Studio verification behavior and an incorrect early assumption about direct partial WM writes
- explicit read-modify-write is the correct final implementation for this repo state
- the remaining architecture caveat is limited to the temporary `memoryTestAgent`; the real read-only agent memory contract should be enforced in the later real-agent tasks
