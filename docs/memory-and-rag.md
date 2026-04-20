# Memory & RAG — Functional Spec

Brief overview of how memory and RAG are utilized in the editing-agent project. Not code — just what the system does from a functional perspective.

---

## Short-Term Memory (Per Session)

The planner maintains a live scratchpad of:
- Current scene plan
- Uploaded assets and their paths
- Current file structure in the sandbox
- Compiler errors and retry history

This updates as the conversation progresses. All agents working within the same session share this context through the planner's output.

---

## Long-Term Memory (Across Sessions)

### User Profile

The planner remembers each user's style preferences:
- Favorite colors, fonts, motion feel, pacing
- Past decisions that worked well

Effect: returning users can skip the basic questions. "Use my usual style" just works.

### Semantic Recall

The planner can surface relevant past conversations by meaning, not keywords:
- "That video where I used slide transitions" → planner pulls that session's context
- "Like the one I made for the Q1 launch" → finds and references that session

This is RAG over conversation history — vector similarity search across all past threads for that user.

---

## RAG Over Past Work

Past `.tsx` compositions, product notes, and style configs get indexed into a vector store. When the editor starts a new video:
- It retrieves similar compositions it wrote before
- Avoids reinventing the wheel
- Maintains consistency across projects
- Gets better over time without the user doing anything

---

## How It Feels to the User

| Session | Behavior |
|---|---|
| First time | Cold start — planner asks clarifying questions about style, goals, assets |
| Second time onward | Planner already knows preferences, skips basic questions |
| "Make it like last time" | Planner pulls from profile + semantic recall, generates a matching plan |
| "Use my usual style" | Working memory (resource-scoped) has the style baked in |
| Over time | Editor retrieves similar past compositions, output quality improves |

---

## Agent Ownership

- **Planner** — owns all memory (short-term scratchpad + user profile + semantic recall)
- **Editor** — stateless. Receives instructions from planner output, not memory
- **Motion** — stateless. Same as editor

Memory is a planner concern. Editor and Motion are stateless workers that execute tasks.

---

## Implementation Notes

- Storage: LibSQL (local SQLite file, already installed)
- Vector store: same LibSQL instance (supports both storage + vectors)
- Embedding model: TBD — needs an embedding endpoint (fastembed for local POC, or OpenAI)
- RAG over past `.tsx` files: Phase 5+ concern, not needed for Phase 3
- This doc is a working draft — enhance as implementation progresses
