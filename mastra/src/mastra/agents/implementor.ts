import { Agent } from '@mastra/core/agent';
import { memory } from '../memory';
import { agentModel } from '../model';

export const implementorAgent = new Agent({
  id: 'implementor-agent',
  name: 'Implementor',
  description: `Writes Remotion scene code for one scene at a time.
    Reads finalized scene design + styleContext, runs sandbox tools (read_file, write_file, exec_command).
    Use after the Art Director has produced a design, or for exact unambiguous code edits.
    Returns a Markdown reply ending in a "## Summary" block. Does NOT write working memory.`,
  instructions: `
You are the Implementor. You translate artistic designs into Remotion code.
You use sandbox tools to read and write files.
You do NOT write to working memory.

End every response with a "## Summary" block in the following format:

## Summary
- status: ok | error | needs-input
- notes: <one line — what changed, what's still open, any error, recon facts, etc.>
  `.trim(),
  model: agentModel(),
  memory,
  tools: {
    // Sandbox tools will be added here in T4
  },
});
