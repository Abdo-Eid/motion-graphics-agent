import { AGENT_LOG, SCENE_REGISTRY } from '../data/mock-data'
import { AGENT_COLORS, type Theme } from '../theme/themes'

type AgentLogProps = {
  t: Theme
}

export function AgentLog({ t }: AgentLogProps) {
  const total = SCENE_REGISTRY.length
  const done = SCENE_REGISTRY.filter((scene) => scene.status === 'done').length
  const completedLogCount = AGENT_LOG.filter((entry) => entry.status === 'done').length

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
          {completedLogCount}/{AGENT_LOG.length}
        </span>
      </div>
      <div style={{ height: 2, background: t.border }}>
        <div
          style={{
            height: '100%',
            width: `${(completedLogCount / AGENT_LOG.length) * 100}%`,
            background: t.accent,
            transition: 'width 0.5s ease',
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {AGENT_LOG.map((entry, index) => {
          const isRunning = entry.status === 'running'
          const color = AGENT_COLORS[entry.agent]

          return (
            <div
              key={index}
              style={{
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                background: isRunning ? t.tagBg : 'transparent',
                borderLeft: isRunning ? `2px solid ${color}` : '2px solid transparent',
              }}
            >
              <div
                style={{
                  width: 16,
                  display: 'flex',
                  justifyContent: 'center',
                  paddingTop: 2,
                  flexShrink: 0,
                }}
              >
                {isRunning ? (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: color,
                      display: 'inline-block',
                      animation: 'pulse 1.2s ease-in-out infinite',
                      marginTop: 1,
                    }}
                  />
                ) : (
                  <span
                    style={{
                      fontFamily: t.monoFont,
                      fontSize: 9,
                      color: 'oklch(0.72 0.18 155)',
                    }}
                  >
                    ✓
                  </span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 2,
                  }}
                >
                  <span style={{ fontSize: 10, color, fontFamily: t.monoFont }}>
                    {entry.agent}
                  </span>
                  <span style={{ fontSize: 9, color: t.textDim, fontFamily: t.monoFont }}>
                    {entry.time}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: isRunning ? t.text : t.textMuted,
                    lineHeight: 1.4,
                  }}
                >
                  {entry.action}
                </div>
              </div>
            </div>
          )
        })}
        {['run_typecheck · scene 3', 'Render check (frame 0-30)', 'Build scene 4 · Share + CTA'].map(
          (label) => (
            <div
              key={label}
              style={{
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                opacity: 0.75,
              }}
            >
              <div style={{ width: 16, display: 'flex', justifyContent: 'center', paddingTop: 1 }}>
                <span style={{ fontFamily: t.monoFont, fontSize: 9, color: t.textMuted }}>
                  ○
                </span>
              </div>
              <div style={{ fontSize: 11, color: t.textMuted }}>{label}</div>
            </div>
          ),
        )}
      </div>

      <div style={{ borderTop: `1px solid ${t.border}`, padding: '10px 14px 6px' }}>
        <div
          style={{
            fontSize: 10,
            color: t.textMuted,
            fontFamily: t.monoFont,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Scene Registry · {done}/{total}
        </div>
        {SCENE_REGISTRY.map((scene) => {
          const color =
            scene.status === 'done'
              ? 'oklch(0.72 0.18 155)'
              : scene.status === 'building'
                ? AGENT_COLORS.Implementor
                : t.textDim
          const dot =
            scene.status === 'done' ? '✓' : scene.status === 'building' ? '●' : '○'

          return (
            <div
              key={scene.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 5,
                padding: '3px 0 3px 6px',
                borderLeft: `2px solid ${
                  scene.status === 'building'
                    ? AGENT_COLORS.Implementor
                    : scene.status === 'done'
                      ? 'oklch(0.72 0.18 155)'
                      : t.border
                }`,
              }}
            >
              <span
                style={{
                  fontFamily: t.monoFont,
                  fontSize: 10,
                  color,
                  width: 10,
                  flexShrink: 0,
                  animation:
                    scene.status === 'building'
                      ? 'pulse 1.2s ease-in-out infinite'
                      : undefined,
                }}
              >
                {dot}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: scene.status === 'pending' ? t.textDim : t.text,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {scene.name}
                </div>
                <div style={{ fontSize: 9.5, color: t.textDim, fontFamily: t.monoFont }}>
                  {scene.time}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ borderTop: `1px solid ${t.border}`, padding: '10px 14px' }}>
        <div
          style={{
            fontSize: 10,
            color: t.textMuted,
            fontFamily: t.monoFont,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Memory
        </div>
        {[
          ['brief', '20s walkthrough · product teams · board / task / timeline / team'],
          ['style', 'off-white bg · neutral · restrained motion'],
          ['routing', 'planner → art-director → implementor'],
        ].map(([key, value]) => (
          <div key={key} style={{ display: 'flex', gap: 6, marginBottom: 5, alignItems: 'flex-start' }}>
            <span
              style={{
                fontFamily: t.monoFont,
                fontSize: 10,
                color: t.textDim,
                flexShrink: 0,
              }}
            >
              {key}:
            </span>
            <span style={{ fontSize: 10.5, color: t.textMuted, lineHeight: 1.4 }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
