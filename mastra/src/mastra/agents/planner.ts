import { Agent } from '@mastra/core/agent';
import { retrieveProjectKnowledge } from '../knowledge/retrieve';
import { memory } from '../memory';
import { setBrief } from '../memory/access';
import { agentModel } from '../model';
import { bus } from '../server/bus';
import { artDirectorAgent } from './art-director';
import { implementorAgent } from './implementor';

type DelegationContext = {
  primitiveId: string;
  prompt?: string;
  result?: unknown;
  error?: unknown;
  threadId?: string;
  resourceId?: string;
  runId?: string;
};

type DelegationState = {
  artDirectorScene: number | null;
  implementorScene: number | null;
};

const delegationStates = new Map<string, DelegationState>();

function delegationScopeId(context: DelegationContext): string {
  return context.runId ?? context.threadId ?? context.resourceId ?? 'global';
}

function sceneNumberFromPrompt(prompt: string | undefined): number | null {
  if (!prompt) {
    return null;
  }

  const patterns = [
    /\bscene(?:\s+number)?\s*[:#-]?\s*(\d+)\b/i,
    /\bfor\s+scene\s+(\d+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const sceneNumber = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;

    if (Number.isFinite(sceneNumber)) {
      return sceneNumber;
    }
  }

  return null;
}

function getDelegationState(scopeId: string): DelegationState {
  const existing = delegationStates.get(scopeId);

  if (existing) {
    return existing;
  }

  const created: DelegationState = {
    artDirectorScene: null,
    implementorScene: null,
  };

  delegationStates.set(scopeId, created);
  return created;
}

function clearDelegationState(scopeId: string, primitiveId: string) {
  const state = delegationStates.get(scopeId);

  if (!state) {
    return;
  }

  if (primitiveId === 'art-director-agent') {
    state.artDirectorScene = null;
  }

  if (primitiveId === 'implementor-agent') {
    state.implementorScene = null;
  }

  if (state.artDirectorScene === null && state.implementorScene === null) {
    delegationStates.delete(scopeId);
  }
}

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
        const context = ctx as DelegationContext;
        const scopeId = delegationScopeId(context);
        const state = getDelegationState(scopeId);
        const sceneNumber = sceneNumberFromPrompt(context.prompt);

        if (context.primitiveId === 'art-director-agent') {
          if (state.artDirectorScene !== null) {
            return { proceed: false, rejectionReason: 'Art Director already running for another scene.' };
          }

          if (
            sceneNumber !== null &&
            state.implementorScene !== null &&
            sceneNumber > state.implementorScene + 1
          ) {
            return {
              proceed: false,
              rejectionReason: 'Art Director cannot move more than one scene ahead of the Implementor.',
            };
          }

          if (
            sceneNumber !== null &&
            state.implementorScene !== null &&
            sceneNumber === state.implementorScene
          ) {
            return {
              proceed: false,
              rejectionReason: 'Art Director and Implementor cannot run on the same scene simultaneously.',
            };
          }

          state.artDirectorScene = sceneNumber;
        }

        if (context.primitiveId === 'implementor-agent') {
          if (state.implementorScene !== null) {
            return { proceed: false, rejectionReason: 'Implementor already running for another scene.' };
          }

          if (
            sceneNumber !== null &&
            state.artDirectorScene !== null &&
            sceneNumber === state.artDirectorScene
          ) {
            return {
              proceed: false,
              rejectionReason: 'Implementor must wait until the Art Director finishes that scene.',
            };
          }

          state.implementorScene = sceneNumber;
        }

        bus.emit('agent.start', {
          agent: context.primitiveId,
          sceneNumber: sceneNumber ?? undefined,
          input: context.prompt,
        });

        return { proceed: true };
      },

      onDelegationComplete: async (ctx) => {
        const context = ctx as DelegationContext;
        const scopeId = delegationScopeId(context);
        const sceneNumber = sceneNumberFromPrompt(context.prompt);

        clearDelegationState(scopeId, context.primitiveId);

        if (context.error) {
          bus.emit('agent.error', {
            agent: context.primitiveId,
            sceneNumber: sceneNumber ?? undefined,
            error: String(context.error),
          });
          return;
        }

        bus.emit('agent.end', {
          agent: context.primitiveId,
          sceneNumber: sceneNumber ?? undefined,
          output: context.result,
        });
      },
    },
  },
});
