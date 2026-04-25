import type { Dispatch, MouseEvent, SetStateAction } from 'react'
import type { Theme } from '../theme/themes'
import { MockProductTour } from './mock-product-tour'

type PlayerPanelProps = {
  t: Theme
  playing: boolean
  setPlaying: Dispatch<SetStateAction<boolean>>
  progress: number
  setProgress: Dispatch<SetStateAction<number>>
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
}: PlayerPanelProps) {
  const currentTime = (progress * 20).toFixed(1)
  const transportButtons: TransportButton[] = [
    { label: '⟨⟨', onClick: () => setProgress(0), accent: false },
    { label: playing ? '⏸' : '▶', onClick: () => setPlaying((current) => !current), accent: true },
    { label: '⟩⟩', onClick: () => setProgress(1), accent: false },
  ]

  const handleSeek = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setProgress((event.clientX - rect.left) / rect.width)
  }

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
            background: '#f7f5f2',
            borderRadius: 8,
            border: `1px solid ${t.borderAccent}`,
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
          }}
        >
          <div style={{ position: 'absolute', inset: 0 }}>
            <MockProductTour progress={progress} />
          </div>
        </div>
        {!playing && (
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
          <span
            style={{
              fontFamily: t.monoFont,
              fontSize: 10,
              color: t.textMuted,
              width: 32,
            }}
          >
            {currentTime}s
          </span>
          <div
            style={{
              flex: 1,
              height: 3,
              background: t.border,
              borderRadius: 99,
              cursor: 'pointer',
              position: 'relative',
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
          <span
            style={{
              fontFamily: t.monoFont,
              fontSize: 10,
              color: t.textMuted,
              width: 28,
              textAlign: 'right',
            }}
          >
            20.0s
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {transportButtons.map((button) => (
            <button
              key={button.label}
              onClick={button.onClick}
              style={{
                background: button.accent ? t.accent : 'transparent',
                border: `1px solid ${t.border}`,
                color: button.accent ? '#000' : t.textMuted,
                padding: '4px 10px',
                borderRadius: t.radiusSm,
                cursor: 'pointer',
                fontFamily: t.monoFont,
                fontSize: 11,
              }}
            >
              {button.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <span
            style={{
              fontFamily: t.monoFont,
              fontSize: 10,
              color: t.textMuted,
            }}
          >
            {Math.floor(progress * 600)}/600 frames
          </span>
          <button
            style={{
              background: 'transparent',
              border: `1px solid ${t.borderAccent}`,
              color: t.tagText,
              padding: '4px 12px',
              borderRadius: t.radiusSm,
              cursor: 'pointer',
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
