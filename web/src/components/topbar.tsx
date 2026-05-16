import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { Theme } from '../theme/themes'

type TopbarProps = {
  t: Theme
  dark: boolean
  setDark: Dispatch<SetStateAction<boolean>>
  statusSlot?: ReactNode
  projectId: string
  onNewProject: () => void
}

export function Topbar({ t, dark, setDark, statusSlot, projectId, onNewProject }: TopbarProps) {
  return (
    <div
      style={{
        height: 44,
        background: t.headerBg,
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 16,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: t.radius,
            background: t.borderAccent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: t.textMuted,
            flexShrink: 0,
          }}
        >
          ▶
        </div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: t.text,
            fontFamily: t.monoFont,
            letterSpacing: '.02em',
          }}
        >
          motion graphics agent
        </span>
      </div>
      <div style={{ width: 1, height: 20, background: t.border }} />
      <span style={{ fontSize: 12, color: t.textMuted, fontFamily: t.monoFont }}>
        {projectId}
      </span>

      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <button
          onClick={onNewProject}
          style={{
            padding: '3px 10px',
            borderRadius: 99,
            border: `1px solid ${t.border}`,
            fontSize: 11,
            color: t.accent,
            fontFamily: t.monoFont,
            cursor: 'pointer',
            background: 'transparent',
          }}
        >
          + New Project
        </button>
        {statusSlot}
        <button
          onClick={() => setDark((current) => !current)}
          title="Toggle theme"
          style={{
            width: 28,
            height: 28,
            borderRadius: t.radiusSm,
            border: `1px solid ${t.border}`,
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            color: t.textMuted,
            transition: 'all 0.15s',
          }}
        >
          {dark ? '☀︎' : '☾'}
        </button>
      </div>
    </div>
  )
}
