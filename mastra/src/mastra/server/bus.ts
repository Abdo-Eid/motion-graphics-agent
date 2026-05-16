import { EventEmitter } from 'node:events';

export type BusEvent =
  | { type: 'agent.start'; agent: string; projectId?: string; input?: unknown }
  | { type: 'agent.end'; agent: string; projectId?: string; output?: unknown }
  | { type: 'agent.error'; agent: string; projectId?: string; error: string }
  | { type: 'agent.message'; agent: string; projectId?: string; text: string }
  | { type: 'agent.tool'; agent: string; projectId?: string; tool: string; input: unknown; output?: unknown }
  | { type: 'workspace.file'; path: string; change: 'add' | 'change' | 'unlink' }
  | { type: 'upload.status'; projectId: string; assetId: string; status: 'pending' | 'done' | 'errored'; path?: string; originalName?: string; mime?: string }
  | { type: 'service.health'; service: 'mastra'; ok: boolean }
  | { type: 'field-ownership-violation'; field: string; role: string; expectedRole: string };

export type BusEventType = BusEvent['type'];

export type BusPayload<T extends BusEventType> = Omit<Extract<BusEvent, { type: T }>, 'type'>;

export type BusListener<T extends BusEventType> = (event: Extract<BusEvent, { type: T }>) => void;

class ProjectBus extends EventEmitter {
  emitEvent<T extends BusEventType>(type: T, data: BusPayload<T>): boolean {
    return super.emit(type, { type, ...data } as Extract<BusEvent, { type: T }>);
  }

  onEvent<T extends BusEventType>(type: T, listener: BusListener<T>): this {
    return super.on(type, listener as (event: unknown) => void);
  }

  offEvent<T extends BusEventType>(type: T, listener: BusListener<T>): this {
    return super.off(type, listener as (event: unknown) => void);
  }


}

export const bus = new ProjectBus();
// Each SSE connection registers one listener per event type (8 types).
// Allow enough headroom for many concurrent connections before Node warns.
bus.setMaxListeners(200);
