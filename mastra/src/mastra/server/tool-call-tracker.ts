import type { ChunkType } from '@mastra/core/stream';
import type { OutputProcessor, ProcessOutputStreamArgs } from '@mastra/core/processors';

import { bus } from './bus';

export function createToolCallTracker(agentName: string): OutputProcessor {
  return {
    id: `tool-call-tracker-${agentName}`,

    async processOutputStream({ part, requestContext }: ProcessOutputStreamArgs): Promise<ChunkType | null | undefined> {
      const projectId = requestContext?.get('projectId') as string | undefined ?? 'default';

      if (part.type === 'tool-call') {
        bus.emitEvent('agent.tool', {
          agent: agentName,
          projectId,
          tool: part.payload.toolName,
          input: part.payload.args,
          output: part.payload.output,
        });
      }

      if (part.type === 'tool-result') {
        bus.emitEvent('agent.tool', {
          agent: agentName,
          projectId,
          tool: part.payload.toolName,
          input: part.payload.args,
          output: part.payload.result,
        });
      }

      return part;
    },
  };
}
