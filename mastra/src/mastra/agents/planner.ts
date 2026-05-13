import { Agent } from '@mastra/core/agent';
import { retrieveProjectKnowledge } from '../knowledge/retrieve';
import { memory } from '../memory';
import { setBrief } from '../memory/access';
import { agentModel } from '../model';
import { bus } from '../server/bus';
import { artDirectorAgent } from './art-director';
import { implementorAgent } from './implementor';

export const plannerAgent = new Agent({
  id: 'planner-agent',
  name: 'Planner',
  instructions: `
You are the Planner (Supervisor) for a motion graphics project.
Your goal is to talk to the user, classify intent, produce the brief, and delegate tasks to the Art Director and Implementor.

RESPONSIBILITIES:
1. **Briefing**: Collect project goal, audience, tone, duration, assets, and key messages. Call setBrief to persist this.
2. **Clarification**: Do not proceed until essential details are known. Ask one focused question at a time.
3. **Planning**: For new projects, write a scene-by-scene plan in chat (e.g., "1. Intro (0-3s)...").
4. **Delegation**: Use agent-artDirector and agent-implementor tools to drive the creative pipeline.
5. **RAG**: Use retrieveProjectKnowledge to pull facts from uploaded documents and assets.

ROUTING RULES:
- Initial generation: Write plan in chat -> AD scene 1 -> AD scene 2 || Impl scene 1 -> ...
- Exact tweak: Call agent-implementor for the affected scene.
- Creative change: Call agent-artDirector for the scene, then agent-implementor.
- Major restructure: Rewrite plan in chat, then run pipeline for affected scenes.
- Style change: Call agent-artDirector (style only), then agent-implementor for affected scenes.
- Error fix: Call agent-implementor for the failing scene.

DELEGATION DISCIPLINE:
- Wait for Art Director (AD) to finish scene N before starting Implementor (Impl) on scene N.
- Pipeline: AD can be at most one scene ahead of Impl.
- NEVER run two Implementor calls in parallel.
- On error: Pause, decide if you need to re-delegate (fix) or ask the user.
- Read the "## Summary" block from subagents to decide the next step.

You never write code, never read/write files, and never use sandbox tools directly.
  `.trim(),
  model: agentModel(),
  memory,
  tools: {
    setBrief,
    retrieveProjectKnowledge,
  },
  agents: {
    artDirector: artDirectorAgent,
    implementor: implementorAgent,
  },
  defaultOptions: {
    maxSteps: 20,
    delegation: {
      onDelegationStart: async (ctx) => {
        // Track in-flight agents to enforce invariants
        const inFlight = ctx.activeDelegations || [];
        const implementorInFlight = inFlight.some(d => d.primitiveId === 'implementor-agent');

        if (ctx.primitiveId === 'implementor-agent' && implementorInFlight) {
          return { proceed: false, rejectionReason: 'Implementor already running for another scene.' };
        }
        
        bus.emit('agent.start', {
          agent: ctx.primitiveId,
          input: ctx.prompt,
        });
        
        return { proceed: true };
      },

      onDelegationComplete: async (ctx) => {
        if (ctx.error) {
          bus.emit('agent.error', {
            agent: ctx.primitiveId,
            error: String(ctx.error),
          });
          return;
        }
        
        bus.emit('agent.end', {
          agent: ctx.primitiveId,
          output: ctx.result,
        });
      },
    },
  },
});
