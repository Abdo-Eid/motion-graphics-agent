# Agent Simplification Decisions

This note captures the current direction agreed during discussion. It is a working decision log, not final architecture.

## 1. Art Director Should Design the Whole Video

The Art Director should usually be called once to create the full creative direction for the video, not separately for every scene.

The reason: AD owns creative consistency — style, pacing, visual language, and scene-to-scene continuity. Calling AD separately per scene risks visual drift unless every call perfectly reconstructs the prior context.

Preferred flow:

```text
Planner -> write visible scene plan in chat
Planner -> wait for user confirmation or adjustments
Planner -> Art Director once:
  create full visual direction and scene-by-scene designs

Art Director writes:
  styleContext
  sceneRegistry[1].design
  sceneRegistry[2].design
  sceneRegistry[3].design
  ...

Planner -> Implementor scene 1
Planner -> Implementor scene 2
Planner -> Implementor scene 3
```

This means the Planner waits for the user to confirm the plan before creative delegation, then waits for the AD delegation to finish before moving to implementation. That is slower than pipelining, but much simpler and more coherent.

Clarifying questions before the plan should be limited to obvious missing essentials. If enough context exists to make a useful plan, the Planner should make reasonable assumptions and let the user correct the plan instead of asking too many questions upfront.

If we later need progress updates per scene, `setSceneDesign(sceneNumber, ...)` can emit a `scene.design.done` event. That should be for observability/frontend progress first, not for complex Planner wake-up logic.

## 2. Avoid Complex Pipeline Enforcement

Hooks should not enforce scene-ordering policy.

The old idea of enforcing "AD can only be one scene ahead of Implementor" pushed scene numbers into delegation hooks and led to regex-parsing the Planner's natural-language prompt. That was the wrong layer.

Simpler rule:

```text
Hooks observe.
Planner decides.
Lower layers enforce real safety.
Nobody parses prose.
```

The Planner should manage the work at a high level. The hooks should only emit useful lifecycle events like agent started, finished, or errored.

## 3. User-Facing Conversation Can Be Handed to Specialists

Specialists should be allowed to talk naturally to the user when they are the right person to ask.

The Planner does not need to translate every specialist question into an artificial delegation loop.

Example: if AD needs tone direction, AD can ask directly:

```text
Before I design the scenes, I need one creative choice: should this feel premium and calm, or energetic and bold?
```

The user answers normally, and the Planner/AD continues.

## 4. Remove Mandatory `## Summary` Blocks

We do not want specialist responses to end with a machine-readable block like:

```md
## Summary
- status: needs-input
- notes: Need tone direction before designing scenes.
```

That response style feels robotic and creates unnecessary coordination structure.

Preferred behavior:

```text
If you need input, ask the user directly and clearly.
If you completed the task, say what you completed.
If blocked, explain the blocker naturally.
```

Prompts updated in this direction:

- `mastra/src/mastra/agents/art-director.ts` no longer requires a `## Summary` block.
- `mastra/src/mastra/agents/planner.ts` no longer tells Planner to read subagent `## Summary` blocks.
- `mastra/src/mastra/agents/implementor.ts` no longer requires a strict `## Summary` block.

## Current Direction

The simplified architecture should feel like this:

```text
User talks to the system.

Planner:
  - manages high-level direction
  - gathers the brief
  - asks only for obvious missing essentials
  - writes a visible plan and waits for confirmation before AD
  - decides when AD should speak
  - decides when Implementor should work
  - keeps the project moving

Art Director:
  - designs the whole video when possible
  - owns creative consistency
  - can ask the user creative questions directly

Implementor:
  - implements one scene at a time
  - can ask the user technical questions directly

Hooks:
  - emit start/end/error events
  - do not enforce scene policy
  - do not parse prompt text
```

Core principle:

```text
Planner manages direction. Specialists can speak when they are the right person to ask. No mandatory machine-readable response block.
```
