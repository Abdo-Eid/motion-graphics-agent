import { EventEmitter } from 'node:events';

export type BusEvent =
  | { type: 'agent.start'; agent: string; sceneNumber?: number; input?: unknown }
  | { type: 'agent.end'; agent: string; sceneNumber?: number; output?: unknown }
  | { type: 'agent.error'; agent: string; error: string }
  | { type: 'field-ownership-violation'; field: string; role: string; expectedRole: string };

class ProjectBus extends EventEmitter {
  override emit(type: BusEvent['type'], data: Omit<Extract<BusEvent, { type: typeof type }>, 'type'>): boolean {
    return super.emit(type, { type, ...data });
  }
}

export const bus = new ProjectBus();
