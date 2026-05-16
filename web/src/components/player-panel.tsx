import { useEffect, useMemo, useState } from 'react'
import type { ActivityEvent } from '../lib/events'
import { getMastraUrl } from '../lib/events'
import { getWorkspaceFile } from '../lib/workspace-api'
import type { Theme } from '../theme/themes'

type PlayerPanelProps = {
  t: Theme
  projectId: string
  events: ActivityEvent[]
  revision: number
}

function previewUrl(projectId: string, revision: number) {
  const url = new URL(`/preview/${encodeURIComponent(projectId)}`, getMastraUrl())
  url.searchParams.set('rev', String(revision))
  return url.toString()
}

export function PlayerPanel({ t, projectId, events, revision }: PlayerPanelProps) {
  const [entryPath, setEntryPath] = useState<string | null>(null)
  const [entryError, setEntryError] = useState<string | null>(null)
  const src = useMemo(() => previewUrl(projectId, revision), [projectId, revision])

  useEffect(() => {
    let cancelled = false

    Promise.allSettled([getWorkspaceFile('src/index.ts'), getWorkspaceFile('src/Root.tsx'), getWorkspaceFile('src/Composition.tsx')]).then(
      (results) => {
        if (cancelled) {
          return
        }

        if (results.every((result) => result.status === 'fulfilled')) {
          setEntryPath('src/index.ts')
          setEntryError(null)
          return
        }

        setEntryPath(null)
        setEntryError('Waiting for src/index.ts, src/Root.tsx, and src/Composition.tsx')
      },
    )

    return () => {
      cancelled = true
    }
  }, [revision])

  const latestCompositionChange = events.findLast(
    (event): event is Extract<ActivityEvent, { type: 'workspace.file' }> =>
      event.type === 'workspace.file' && event.path.startsWith('src/'),
  )

  return (
    <div
      style={{
        flex: 1,
        background: t.playerBg,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          padding: 12,
        }}
      >
        <div
          style={{
            width: '98%',
            maxWidth: 960,
            aspectRatio: '16/9',
            background: '#111114',
            borderRadius: 8,
            border: `1px solid ${t.borderAccent}`,
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
          }}
        >
          {entryPath ? (
            <iframe
              key={src}
              src={src}
              title="Generated Remotion preview"
              style={{
                border: 'none',
                width: '100%',
                height: '100%',
                display: 'block',
                background: '#111114',
              }}
            />
          ) : (
            <PreviewPlaceholder
              t={t}
              error={entryError}
              latestChange={latestCompositionChange?.path ?? null}
            />
          )}
        </div>
      </div>

      <div
        style={{
          padding: '10px 20px 12px',
          borderTop: `1px solid ${t.border}`,
          background: t.playerBg,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: t.monoFont, fontSize: 10, color: t.textMuted }}>
          {entryPath ? `remote player: ${entryPath}` : 'remote player waiting'}
        </span>
        <div style={{ flex: 1 }} />
        {latestCompositionChange ? (
          <span style={{ fontFamily: t.monoFont, fontSize: 10, color: t.textMuted }}>
            latest change: {latestCompositionChange.path}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function PreviewPlaceholder({
  t,
  error,
  latestChange,
}: {
  t: Theme
  error: string | null
  latestChange: string | null
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(circle at 25% 20%, rgba(130,160,255,0.22), transparent 28%), linear-gradient(135deg, #111114, #23232b)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
      }}
    >
      <div style={{ width: '70%', maxWidth: 460, textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontFamily: t.monoFont, color: 'rgba(255,255,255,0.62)', marginBottom: 12 }}>
          Remotion preview
        </div>
        <div style={{ fontSize: 22, lineHeight: 1.15, marginBottom: 10 }}>
          Waiting for generated composition
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', lineHeight: 1.5 }}>
          {error}
        </div>
        {latestChange ? (
          <div
            style={{
              display: 'inline-flex',
              marginTop: 14,
              padding: '5px 9px',
              borderRadius: 99,
              border: '1px solid rgba(255,255,255,0.18)',
              color: 'rgba(255,255,255,0.7)',
              fontSize: 10,
              fontFamily: t.monoFont,
            }}
          >
            latest change: {latestChange}
          </div>
        ) : null}
      </div>
    </div>
  )
}
