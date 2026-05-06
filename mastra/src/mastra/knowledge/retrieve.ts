import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { embedText } from './embeddings';
import { queryProjectKnowledge } from './store';

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
    const projectId = context.agent?.threadId ?? context.agent?.resourceId;

    if (!projectId) {
      throw new Error('retrieveProjectKnowledge requires a project threadId or resourceId');
    }

    const queryVector = await embedText(inputData.query);

    return queryProjectKnowledge({
      projectId,
      queryVector,
      k: inputData.k ?? DEFAULT_K,
    });
  },
});
