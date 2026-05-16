import { Agent } from '@mastra/core/agent';
import type {
  DelegationCompleteContext,
  DelegationStartContext,
} from '@mastra/core/agent';
import { retrieveProjectKnowledge } from '../knowledge/retrieve';
import { memory } from '../memory';
import { setBrief } from '../memory/access';
import { agentModel } from '../model';
import { bus } from '../server/bus';
import { createToolCallTracker } from '../server/tool-call-tracker';
import { artDirectorAgent } from './art-director';
import { implementorAgent } from './implementor';

function readStringPath(value: unknown, path: string[]): string | undefined {
  let current = value;

  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === 'string' && current.trim() ? current : undefined;
}

function projectIdFromDelegationContext(context: DelegationStartContext | DelegationCompleteContext): string | undefined {
  return readStringPath(context, ['agent', 'threadId'])
    ?? readStringPath(context, ['agent', 'resourceId'])
    ?? readStringPath(context, ['threadId'])
    ?? readStringPath(context, ['resourceId'])
    ?? readStringPath(context, ['memory', 'thread'])
    ?? readStringPath(context, ['memory', 'resource'])
    ?? readStringPath(context, ['projectId']);
}

export const plannerAgent = new Agent({
  id: 'planner-agent',
  name: 'Planner',
  instructions: `
You are the Planner (Supervisor) for a motion graphics project.
Your goal is to talk to the user, classify intent, produce the brief, and delegate tasks to the Art Director and Implementor.

RESPONSIBILITIES:
1. **Briefing**: Collect project goal, audience, tone, duration, assets, and key messages. Call setBrief to persist this.
2. **Clarification**: Ask only for obvious missing essentials that would block a useful result. Do not over-question preferences that can be reasonably inferred.
3. **Planning**: For new projects, write a scene-by-scene plan in chat (e.g., "1. Intro (0-3s)...") and wait for user confirmation before delegating.
4. **Delegation**: Use agent-artDirector and agent-implementor tools to drive the creative handoff.
5. **Uploads**: Workspace State lists uploaded files under uploads with Workspace paths like uploads/<id>.pdf.
6. **RAG**: Use retrieveProjectKnowledge to pull facts from uploaded documents and assets.

ROUTING RULES:
- Initial generation: Write plan in chat -> wait for user confirmation -> call agent-artDirector once for full-video creative direction -> call agent-implementor scene-by-scene.
- Exact tweak: Call agent-implementor for the affected scene.
- Creative change: Call agent-artDirector for the scene, then agent-implementor.
- Major restructure: Rewrite plan in chat, then call Art Director and Implementor for affected scenes.
- Style change: Call agent-artDirector (style only), then agent-implementor for affected scenes.
- Error fix: Call agent-implementor for the failing scene.

DELEGATION DISCIPLINE:
- Prefer a single Art Director call that designs the whole video, including styleContext and all sceneRegistry[n].design entries.
- Do not call Art Director for a new project until the user has approved or adjusted the plan you wrote in chat.
- Wait for Art Director to finish a scene design before asking Implementor to build that scene.
- Run Implementor work one scene at a time unless the user explicitly asks for a different strategy.
- Specialists may ask the user direct, natural questions when they are the right person to ask.
- If a specialist asks the user a question, pass it through naturally instead of converting it into a status block.
- On error: Pause, decide if you need to re-delegate (fix) or ask the user.

You never write code, never read/write files, and never use Workspace tools directly.
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
  outputProcessors: [createToolCallTracker('planner')],
  defaultOptions: {
    maxSteps: Number(process.env.PLANNER_MAX_STEPS ?? 50),
    delegation: {
      onDelegationStart: async (context: DelegationStartContext) => {
        const projectId = projectIdFromDelegationContext(context);
        bus.emitEvent('agent.start', {
          agent: context.primitiveId,
          projectId,
          input: context.prompt,
        });

        return { proceed: true };
      },

      onDelegationComplete: async (context: DelegationCompleteContext) => {
        const projectId = projectIdFromDelegationContext(context);

        if (context.error) {
          bus.emitEvent('agent.error', {
            agent: context.primitiveId,
            projectId,
            error: context.error.message,
          });
          return;
        }

        const outputText = context.result.text;

        if (outputText) {
          bus.emitEvent('agent.message', {
            agent: context.primitiveId,
            projectId,
            text: outputText,
          });
        }

        bus.emitEvent('agent.end', {
          agent: context.primitiveId,
          projectId,
          output: outputText,
        });
      },
    },
  },
});
