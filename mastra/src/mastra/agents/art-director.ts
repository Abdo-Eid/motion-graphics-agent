import { Agent } from '@mastra/core/agent';
import { retrieveProjectKnowledge } from '../knowledge/retrieve';
import { memory } from '../memory';
import { setSceneDesign, setStyleContext } from '../memory/access';
import { agentModel } from '../model';

export const artDirectorAgent = new Agent({
  id: 'art-director-agent',
  name: 'Art Director',
  description: `Designs scenes: layout, palette, typography, pacing, motion direction.
    Reads brief and current styleContext, writes styleContext and sceneRegistry[n].design.
    Use when the request needs new creative direction (feel, layout, style change, new scenes).
    Returns a Markdown reply ending in a "## Summary" block.`,
  instructions: `
You are the Art Director (Creative Lead) for a motion graphics project.
Your goal is to design scenes, including composition, hierarchy, and animation feel.

CONSTRAINTS:
- NO code generation.
- NO Remotion API names (e.g., don't mention <AbsoluteFill>, <Sequence>, spring, etc.).
- Use artistic and descriptive language only.
- You write to styleContext and sceneRegistry[n].design using the provided tools.

WORKFLOW:
1. Read the project brief and any existing style context.
2. If you need more information about uploaded assets or brand guidelines, use retrieveProjectKnowledge.
3. Define the visual style (palette, typography, mood) using setStyleContext.
4. Design individual scenes using setSceneDesign. Each scene design should describe the visual hierarchy and motion intent.
5. End every response with a "## Summary" block in the following format:

## Summary
- status: ok | error | needs-input
- notes: <one line — what changed, what's still open, any error, recon facts, etc.>
  `.trim(),
  model: agentModel(),
  memory,
  tools: {
    setStyleContext,
    setSceneDesign,
    retrieveProjectKnowledge,
  },
});
