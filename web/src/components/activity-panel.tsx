import type { ActivityConnection, ActivityEvent, AgentId } from '../lib/events'
import { AGENT_COLORS, type Theme } from '../theme/themes'

type ActivityPanelProps = {
  t: Theme
  events: ActivityEvent[]
  connection: ActivityConnection
}

type LaneId = AgentId | 'system'

const LANES: { id: LaneId; label: string; color: string }[] = [
  { id: 'planner', label: 'Planner', color: AGENT_COLORS.Planner },
  { id: 'art-director', label: 'Art Director', color: AGENT_COLORS['Art Director'] },
  { id: 'implementor', label: 'Implementor', color: AGENT_COLORS.Implementor },
  { id: 'system', label: 'System', color: 'oklch(0.72 0.18 155)' },
]

function eventLane(event: ActivityEvent): LaneId {
  return 'agent' in event ? event.agent : 'system'
}

function eventText(event: ActivityEvent) {
  switch (event.type) {
    case 'agent.start':
      return 'started'
    case 'agent.message':
      return event.text
    case 'agent.tool':
      return `tool: ${event.tool}`
    case 'agent.end':
      return 'finished'
    case 'agent.error':
      return event.error
    case 'workspace.file':
      return `${event.change}: ${event.path}`
    case 'upload.status':
      return `upload ${event.assetId}: ${event.status}`
    case 'service.health':
      return `${event.service}: ${event.ok ? 'online' : 'offline'}`
  }
}

function formatTime(ts: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(ts)
}

export function ActivityPanel({ t, events, connection }: ActivityPanelProps) {
  const activeAgents = new Set(
    events.filter((event) => event.type === 'agent.start').map((event) => event.agent),
  )

  for (const event of events) {
    if (event.type === 'agent.end' || event.type === 'agent.error') {
      activeAgents.delete(event.agent)
    }
  }

  return (
    <div
      style={{
        width: 320,
        flexShrink: 0,
        background: t.logBg,
        borderLeft: `1px solid ${t.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: t.textMuted,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            fontFamily: t.monoFont,
          }}
        >
          Activity
        </span>
        <span style={{ fontFamily: t.monoFont, fontSize: 10, color: t.textMuted }}>
          {connection}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {events.length === 0 && (
          <div style={{ padding: '10px 14px', color: t.textMuted, fontSize: 11, lineHeight: 1.5 }}>
            Waiting for live events from Mastra. This will populate when `/events/:projectId`
            is available.
          </div>
        )}

        {LANES.map((lane) => {
          const laneEvents = events.filter((event) => eventLane(event) === lane.id)
          const active = lane.id !== 'system' && activeAgents.has(lane.id)
          const hasError = laneEvents.some(
            (event) => event.type === 'agent.error' || (event.type === 'service.health' && !event.ok),
          )

          return (
            <div key={lane.id} style={{ padding: '6px 0 10px' }}>
              <div
                style={{
                  padding: '0 14px 5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  color: hasError ? 'oklch(0.62 0.22 25)' : active ? lane.color : t.textMuted,
                  fontFamily: t.monoFont,
                  fontSize: 10,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: hasError ? 'oklch(0.62 0.22 25)' : active ? lane.color : t.borderAccent,
                    animation: active ? 'pulse 1.2s ease-in-out infinite' : undefined,
                  }}
                />
                {lane.label}
              </div>

              {laneEvents.slice(-8).map((event) => (
                <div
                  key={`${event.type}-${event.ts}-${eventText(event)}`}
                  style={{
                    padding: '4px 14px 4px 27px',
                    borderLeft:
                      event.type === 'agent.error' ? '2px solid oklch(0.62 0.22 25)' : '2px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: t.text, fontSize: 11, lineHeight: 1.4 }}>{eventText(event)}</span>
                    <span style={{ color: t.textDim, fontSize: 9, fontFamily: t.monoFont, flexShrink: 0 }}>
                      {formatTime(event.ts)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
