import type { ActivityConnection, ActivityEvent } from '../lib/events'
import type { Theme } from '../theme/themes'

type ConnectionStatusProps = {
  t: Theme
  connection: ActivityConnection
  events: ActivityEvent[]
  onRetry: () => void
}

function latestMastraHealth(events: ActivityEvent[]) {
  return events.findLast(
    (event): event is Extract<ActivityEvent, { type: 'service.health' }> =>
      event.type === 'service.health' && event.service === 'mastra',
  )
}

export function ConnectionStatus({ t, connection, events, onRetry }: ConnectionStatusProps) {
  const mastra = latestMastraHealth(events)
  const mastraOk = connection === 'open' && (mastra?.ok ?? true)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <StatusBadge
        t={t}
        label="Mastra :4111"
        ok={mastraOk}
        detail={mastra ? (mastra.ok ? connection : 'offline') : connection}
        onClick={onRetry}
      />
    </div>
  )
}

function StatusBadge({
  t,
  label,
  ok,
  detail,
  onClick,
}: {
  t: Theme
  label: string
  ok: boolean
  detail: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={onClick ? `${detail}. Click to reconnect.` : detail}
      style={{
        border: `1px solid ${ok ? 'oklch(0.62 0.18 155)' : t.border}`,
        background: ok ? 'oklch(0.62 0.18 155 / 0.1)' : 'transparent',
        color: ok ? 'oklch(0.62 0.18 155)' : t.textMuted,
        borderRadius: 99,
        padding: '3px 8px',
        fontSize: 10,
        fontFamily: t.monoFont,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {label}
    </button>
  )
}
