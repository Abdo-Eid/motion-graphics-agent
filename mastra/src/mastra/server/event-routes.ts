import type { ApiRoute } from '@mastra/core/server';

import { bus, type BusEvent, type BusEventType } from './bus';

type ActivityAgentId = 'planner' | 'art-director' | 'implementor';

type ActivityEvent =
  | { type: 'agent.start'; agent: ActivityAgentId; ts: number }
  | { type: 'agent.message'; agent: ActivityAgentId; text: string; ts: number }
  | { type: 'agent.tool'; agent: ActivityAgentId; tool: string; input: unknown; output?: unknown; ts: number }
  | { type: 'agent.end'; agent: ActivityAgentId; ts: number }
  | { type: 'agent.error'; agent: ActivityAgentId; error: string; ts: number }
  | { type: 'workspace.file'; path: string; change: 'add' | 'change' | 'unlink'; ts: number }
  | { type: 'upload.status'; assetId: string; status: 'pending' | 'done' | 'errored'; path?: string; originalName?: string; mime?: string; ts: number }
  | { type: 'service.health'; service: 'mastra'; ok: boolean; ts: number };

const streamedEventTypes: BusEventType[] = [
  'agent.start',
  'agent.end',
  'agent.error',
  'agent.message',
  'agent.tool',
  'workspace.file',
  'upload.status',
  'service.health',
];

function normalizeAgentId(agent: string): ActivityAgentId | null {
  switch (agent) {
    case 'planner':
    case 'planner-agent':
      return 'planner';
    case 'art-director':
    case 'art-director-agent':
      return 'art-director';
    case 'implementor':
    case 'implementor-agent':
      return 'implementor';
    default:
      return null;
  }
}

function toActivityEvent(event: BusEvent): ActivityEvent | null {
  const ts = Date.now();

  switch (event.type) {
    case 'agent.start': {
      const agent = normalizeAgentId(event.agent);
      return agent ? { type: 'agent.start', agent, ts } : null;
    }
    case 'agent.end': {
      const agent = normalizeAgentId(event.agent);
      return agent ? { type: 'agent.end', agent, ts } : null;
    }
    case 'agent.error': {
      const agent = normalizeAgentId(event.agent);
      return agent ? { type: 'agent.error', agent, error: event.error, ts } : null;
    }
    case 'agent.message': {
      const agent = normalizeAgentId(event.agent);
      return agent ? { type: 'agent.message', agent, text: event.text, ts } : null;
    }
    case 'agent.tool': {
      const agent = normalizeAgentId(event.agent);
      return agent ? { type: 'agent.tool', agent, tool: event.tool, input: event.input, output: event.output, ts } : null;
    }
    case 'workspace.file':
      return { type: 'workspace.file', path: event.path, change: event.change, ts };
    case 'upload.status':
      return {
        type: 'upload.status',
        assetId: event.assetId,
        status: event.status,
        path: event.path,
        originalName: event.originalName,
        mime: event.mime,
        ts,
      };
    case 'service.health':
      return { type: 'service.health', service: event.service, ok: event.ok, ts };
    case 'field-ownership-violation':
      return null;
  }
}

function matchesProject(event: BusEvent, projectId: string): boolean {
  return !('projectId' in event) || event.projectId === undefined || event.projectId === projectId;
}

function encodeSse(event: ActivityEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export const eventRoutes: ApiRoute[] = [
  {
    path: '/events/:projectId',
    method: 'GET',
    handler: c => {
      const projectId = c.req.param('projectId') ?? '';
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: ActivityEvent) => controller.enqueue(encoder.encode(encodeSse(event)));
          const listeners = streamedEventTypes.map(type => {
            const listener = (event: BusEvent) => {
              if (!matchesProject(event, projectId)) {
                return;
              }

              const activityEvent = toActivityEvent(event);
              if (activityEvent) {
                send(activityEvent);
              }
            };

            bus.onAnyEvent(type, listener);
            return { type, listener };
          });

          send({ type: 'service.health', service: 'mastra', ok: true, ts: Date.now() });

          c.req.raw.signal.addEventListener('abort', () => {
            for (const { type, listener } of listeners) {
              bus.offAnyEvent(type, listener);
            }
            controller.close();
          }, { once: true });
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    },
  },
];
