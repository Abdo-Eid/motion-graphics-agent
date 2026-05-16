import { useState } from 'react'
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

function formatTime(ts: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(ts)
}

function ToolCallRow({ t, event }: { t: Theme; event: ActivityEvent & { type: 'agent.tool' } }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ padding: '3px 14px 3px 27px' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          padding: '3px 6px',
          borderRadius: 4,
          background: expanded ? t.tagBg : 'transparent',
        }}
      >
        <span style={{ fontSize: 9, color: t.textDim, fontFamily: t.monoFont, flexShrink: 0 }}>
          {expanded ? '▼' : '▶'}
        </span>
        <span style={{ fontSize: 10, color: AGENT_COLORS[event.agent === 'art-director' ? 'Art Director' : event.agent === 'implementor' ? 'Implementor' : 'Planner'] || t.textMuted, fontFamily: t.monoFont }}>
          {event.tool}
        </span>
        <span style={{ fontSize: 9, color: t.textDim, fontFamily: t.monoFont, flexShrink: 0, marginLeft: 'auto' }}>
          {formatTime(event.ts)}
        </span>
      </div>
      {expanded && (
        <div style={{ padding: '6px 6px 6px 22px', fontSize: 10, fontFamily: t.monoFont, color: t.textMuted, lineHeight: 1.5 }}>
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: t.textDim }}>input:</span>
            <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 10 }}>
              {typeof event.input === 'string' ? event.input : JSON.stringify(event.input, null, 2)}
            </pre>
          </div>
          {event.output !== undefined && (
            <div>
              <span style={{ color: t.textDim }}>output:</span>
              <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 10 }}>
                {typeof event.output === 'string' ? event.output : JSON.stringify(event.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
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

              {laneEvents.slice(-20).map((event, i) => {
                if (event.type === 'agent.tool') {
                  return <ToolCallRow key={`${event.type}-${event.ts}-${i}`} t={t} event={event} />
                }

                if (event.type === 'agent.message') {
                  return (
                    <div
                      key={`${event.type}-${event.ts}-${i}`}
                      style={{
                        padding: '4px 14px 4px 27px',
                      }}
                    >
                      <div style={{ fontSize: 11, color: t.text, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                        {event.text}
                      </div>
                    </div>
                  )
                }

                if (event.type === 'agent.start') {
                  return (
                    <div
                      key={`${event.type}-${event.ts}-${i}`}
                      style={{
                        padding: '4px 14px 4px 27px',
                        fontSize: 10,
                        color: lane.color,
                        fontFamily: t.monoFont,
                        fontStyle: 'italic',
                      }}
                    >
                      started
                    </div>
                  )
                }

                if (event.type === 'agent.end') {
                  return (
                    <div
                      key={`${event.type}-${event.ts}-${i}`}
                      style={{
                        padding: '4px 14px 4px 27px',
                        fontSize: 10,
                        color: 'oklch(0.72 0.18 155)',
                        fontFamily: t.monoFont,
                        fontStyle: 'italic',
                      }}
                    >
                      finished
                    </div>
                  )
                }

                if (event.type === 'agent.error') {
                  return (
                    <div
                      key={`${event.type}-${event.ts}-${i}`}
                      style={{
                        padding: '4px 14px 4px 27px',
                        borderLeft: '2px solid oklch(0.62 0.22 25)',
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'oklch(0.62 0.22 25)', lineHeight: 1.4 }}>
                        {event.error}
                      </div>
                    </div>
                  )
                }

                if (event.type === 'workspace.file') {
                  return (
                    <div
                      key={`${event.type}-${event.ts}-${i}`}
                      style={{
                        padding: '3px 14px 3px 27px',
                        fontSize: 10,
                        color: t.textDim,
                        fontFamily: t.monoFont,
                      }}
                    >
                      {event.change}: {event.path}
                    </div>
                  )
                }

                return (
                  <div
                    key={`${event.type}-${event.ts}-${i}`}
                    style={{
                      padding: '4px 14px 4px 27px',
                      borderLeft: '2px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ color: t.text, fontSize: 11, lineHeight: 1.4 }}>
                        {event.type}
                      </span>
                      <span style={{ color: t.textDim, fontSize: 9, fontFamily: t.monoFont, flexShrink: 0 }}>
                        {formatTime(event.ts)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
