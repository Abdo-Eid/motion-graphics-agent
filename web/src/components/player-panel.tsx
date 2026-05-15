import { useEffect, useState, type Dispatch, type MouseEvent, type SetStateAction } from 'react'
import type { ActivityEvent } from '../lib/events'
import { getWorkspaceFile } from '../lib/workspace-api'
import type { Theme } from '../theme/themes'

type PlayerPanelProps = {
  t: Theme
  playing: boolean
  setPlaying: Dispatch<SetStateAction<boolean>>
  progress: number
  setProgress: Dispatch<SetStateAction<number>>
  events: ActivityEvent[]
  revision: number
}

type TransportButton = {
  label: string
  onClick: () => void
  accent: boolean
}

export function PlayerPanel({
  t,
  playing,
  setPlaying,
  progress,
  setProgress,
  events,
  revision,
}: PlayerPanelProps) {
  const [entryPath, setEntryPath] = useState<string | null>(null)
  const [entryError, setEntryError] = useState<string | null>(null)
  const currentTime = (progress * 20).toFixed(1)
  const transportButtons: TransportButton[] = [
    { label: '<<', onClick: () => setProgress(0), accent: false },
    { label: playing ? 'Pause' : 'Play', onClick: () => setPlaying((current) => !current), accent: true },
    { label: '>>', onClick: () => setProgress(1), accent: false },
  ]

  useEffect(() => {
    let cancelled = false

    Promise.allSettled([getWorkspaceFile('src/index.tsx'), getWorkspaceFile('src/index.ts')]).then(
      (results) => {
        if (cancelled) {
          return
        }

        const tsx = results[0]
        const ts = results[1]

        if (tsx.status === 'fulfilled') {
          setEntryPath('src/index.tsx')
          setEntryError(null)
          return
        }

        if (ts.status === 'fulfilled') {
          setEntryPath('src/index.ts')
          setEntryError(null)
          return
        }

        setEntryPath(null)
        setEntryError('No Remotion entry found at src/index.tsx or src/index.ts')
      },
    )

    return () => {
      cancelled = true
    }
  }, [revision])

  useEffect(() => {
    if (!entryPath && playing) {
      setPlaying(false)
    }
  }, [entryPath, playing, setPlaying])

  const handleSeek = (event: MouseEvent<HTMLDivElement>) => {
    if (!entryPath) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    setProgress((event.clientX - rect.left) / rect.width)
  }

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
          <PreviewPlaceholder
            t={t}
            entryPath={entryPath}
            error={entryError}
            latestChange={latestCompositionChange?.path ?? null}
          />
        </div>
        {entryPath && !playing && (
          <button
            onClick={() => setPlaying(true)}
            style={{
              position: 'absolute',
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'rgba(20,20,24,0.82)',
              border: '1px solid rgba(255,255,255,0.35)',
              color: 'white',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
              transition: 'all 0.15s',
            }}
          >
            ▶
          </button>
        )}
      </div>

      <div
        style={{
          padding: '10px 20px 12px',
          borderTop: `1px solid ${t.border}`,
          background: t.playerBg,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: t.monoFont, fontSize: 10, color: t.textMuted, width: 32 }}>
            {currentTime}s
          </span>
          <div
            style={{
              flex: 1,
              height: 3,
              background: t.border,
              borderRadius: 99,
              cursor: entryPath ? 'pointer' : 'not-allowed',
              position: 'relative',
              opacity: entryPath ? 1 : 0.45,
            }}
            onClick={handleSeek}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${progress * 100}%`,
                background: t.accent,
                borderRadius: 99,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: `calc(${progress * 100}% - 5px)`,
                transform: 'translateY(-50%)',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: 'white',
                boxShadow: '0 0 4px rgba(0,0,0,0.5)',
              }}
            />
          </div>
          <span style={{ fontFamily: t.monoFont, fontSize: 10, color: t.textMuted, width: 28, textAlign: 'right' }}>
            20.0s
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {transportButtons.map((button) => (
            <button
              key={button.label}
              onClick={button.onClick}
              disabled={!entryPath}
              style={{
                background: button.accent ? t.accent : 'transparent',
                border: `1px solid ${t.border}`,
                color: button.accent ? '#000' : t.textMuted,
                padding: '4px 10px',
                borderRadius: t.radiusSm,
                cursor: entryPath ? 'pointer' : 'not-allowed',
                opacity: entryPath ? 1 : 0.45,
                fontFamily: t.monoFont,
                fontSize: 11,
              }}
            >
              {button.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: t.monoFont, fontSize: 10, color: t.textMuted }}>
            {Math.floor(progress * 600)}/600 frames
          </span>
          <button
            disabled={!entryPath}
            style={{
              background: 'transparent',
              border: `1px solid ${t.borderAccent}`,
              color: t.tagText,
              padding: '4px 12px',
              borderRadius: t.radiusSm,
              cursor: entryPath ? 'pointer' : 'not-allowed',
              opacity: entryPath ? 1 : 0.45,
              fontSize: 11,
              fontFamily: t.font,
              fontWeight: 500,
            }}
          >
            Export MP4
          </button>
        </div>
      </div>
    </div>
  )
}

function PreviewPlaceholder({
  t,
  entryPath,
  error,
  latestChange,
}: {
  t: Theme
  entryPath: string | null
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
          {entryPath ? 'Generated composition detected' : 'Waiting for generated composition'}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', lineHeight: 1.5 }}>
          {entryPath
            ? `${entryPath} is present. The real Player can be enabled once the generated entry export shape is fixed.`
            : error}
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
