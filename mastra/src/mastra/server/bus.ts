import { EventEmitter } from 'node:events';

export type BusEvent =
  | { type: 'agent.start'; agent: string; input?: unknown }
  | { type: 'agent.end'; agent: string; output?: unknown }
  | { type: 'agent.error'; agent: string; error: string }
  | { type: 'field-ownership-violation'; field: string; role: string; expectedRole: string };

export type BusEventType = BusEvent['type'];

export type BusPayload<T extends BusEventType> = Omit<Extract<BusEvent, { type: T }>, 'type'>;

export type BusListener<T extends BusEventType> = (event: Extract<BusEvent, { type: T }>) => void;

class ProjectBus extends EventEmitter {
  // Typed emit. The generic `T` is captured from the call site so
  // `Extract<BusEvent, { type: T }>` narrows to a single event variant
  // and `data` is the exact payload for that variant.
  emitEvent<T extends BusEventType>(type: T, data: BusPayload<T>): boolean {
    return super.emit(type, { type, ...data } as Extract<BusEvent, { type: T }>);
  }

  // Typed `on`. Listener receives the full discriminated event object
  // (including `type`), so consumers can switch on it if desired.
  onEvent<T extends BusEventType>(type: T, listener: BusListener<T>): this {
    return super.on(type, listener as (event: unknown) => void);
  }
}

export const bus = new ProjectBus();
