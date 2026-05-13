/**
 * `retrieveProjectKnowledge` — the only read path into the Knowledge Store.
 *
 * Architecture rule (AGENTS.md / T1-memory-knowledge-uploads.md):
 *   This tool is attached ONLY to the Planner and the Art Director.
 *   The Implementor must NEVER receive it — Implementor reads Workspace State
 *   and skill docs only. Wiring it onto the Implementor breaks the agent
 *   role boundaries the system depends on.
 *
 * The temporary T1 test agent in `src/mastra/index.ts` carries this tool for
 * Studio Playground verification and is deleted when T2/T3 land.
 */

import { createTool } from '@mastra/core/tools';
import { embed } from 'ai';
import { z } from 'zod';

import { embeddingModel } from '../model';
import { queryProjectKnowledge } from './store';

// Default top-k of 4 keeps prompts small and on-topic. The MAX_K cap of 12
// is a safety belt — without it, a misbehaving agent could request thousands
// of chunks and blow the model's context window. Tunable if a real workload
// needs more, but resist raising the default; agents should re-query with a
// refined `query` rather than a bigger `k`.
const DEFAULT_K = 4;
const MAX_K = 12;

export const retrieveProjectKnowledge = createTool({
  id: 'retrieveProjectKnowledge',
  description: 'Retrieve relevant uploaded project knowledge chunks for the current project.',
  inputSchema: z.object({
    query: z.string().min(1),
    k: z.number().int().positive().max(MAX_K).default(DEFAULT_K),
  }),
  execute: async (inputData, context) => {
    // T1A's parent-threadId rule: Mastra invokes agents with `threadId =
    // resourceId = projectId`, and that propagates to tool calls via
    // `context.agent`. We read it here instead of accepting `projectId` as a
    // tool input — agents can't be trusted to pass the right id, but
    // Mastra's invocation context is authoritative. `resourceId` is the
    // fallback in case only one was set.
    const projectId = context.agent?.threadId ?? context.agent?.resourceId;

    if (!projectId) {
      throw new Error('retrieveProjectKnowledge requires a project threadId or resourceId');
    }

    // Single embedding call for the query — same Azure deployment used at
    // ingest time, which is what makes the cosine similarity comparable.
    // Mixing embedding models between ingest and query produces nonsense
    // scores; both paths must route through `embeddingModel()`.
    const { embedding } = await embed({
      model: embeddingModel(),
      value: inputData.query,
    });

    return queryProjectKnowledge({
      projectId,
      queryVector: embedding,
      k: inputData.k ?? DEFAULT_K,
    });
  },
});
