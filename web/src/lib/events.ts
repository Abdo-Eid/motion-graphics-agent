import { useCallback, useEffect, useState } from 'react'

export type AgentId = 'planner' | 'art-director' | 'implementor'
export type IngestStatus = 'pending' | 'done' | 'errored'

export type ActivityEvent =
  | { type: 'agent.start'; agent: AgentId; ts: number }
  | { type: 'agent.message'; agent: AgentId; text: string; ts: number }
  | { type: 'agent.tool'; agent: AgentId; tool: string; input: unknown; output?: unknown; ts: number }
  | { type: 'agent.end'; agent: AgentId; ts: number }
  | { type: 'agent.error'; agent: AgentId; error: string; ts: number }
  | { type: 'workspace.file'; path: string; change: 'add' | 'change' | 'unlink'; ts: number }
  | { type: 'upload.status'; assetId: string; status: IngestStatus; path?: string; originalName?: string; mime?: string; ts: number }
  | { type: 'service.health'; service: 'mastra'; ok: boolean; ts: number }

export type ActivityConnection = 'connecting' | 'open' | 'closed'

const DEFAULT_MASTRA_URL = 'http://localhost:4111'
const DEFAULT_EVENTS_PATH = '/events'
const MAX_EVENTS = 300

export function getMastraUrl() {
  return import.meta.env.VITE_MASTRA_URL ?? DEFAULT_MASTRA_URL
}

function getEventsUrl(projectId: string) {
  const baseUrl = getMastraUrl().replace(/\/$/, '')
  const eventsPath = import.meta.env.VITE_EVENTS_PATH ?? DEFAULT_EVENTS_PATH
  return `${baseUrl}${eventsPath}/${encodeURIComponent(projectId)}`
}

function isActivityEvent(value: unknown): value is ActivityEvent {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as { type?: unknown; ts?: unknown }
  return typeof candidate.type === 'string' && typeof candidate.ts === 'number'
}

export function useActivityStream(projectId: string): {
  events: ActivityEvent[]
  connection: ActivityConnection
  reconnect: () => void
} {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [connection, setConnection] = useState<ActivityConnection>('connecting')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const source = new EventSource(getEventsUrl(projectId))

    source.onopen = () => setConnection('open')
    source.onerror = () => setConnection('closed')
    source.onmessage = (message) => {
      try {
        const parsed: unknown = JSON.parse(message.data)

        if (isActivityEvent(parsed)) {
          setEvents((current) => [...current, parsed].slice(-MAX_EVENTS))
        }
      } catch {
        setConnection('closed')
      }
    }

    return () => source.close()
  }, [projectId, retryKey])

  const reconnect = useCallback(() => {
    setConnection('connecting')
    setRetryKey((current) => current + 1)
  }, [])

  return { events, connection, reconnect }
}
