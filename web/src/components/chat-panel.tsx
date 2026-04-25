import { CHAT_MESSAGES } from '../data/mock-data'
import { AGENT_COLORS, type Theme } from '../theme/themes'
import { ChatMessage, ThinkingDots } from './chat-message'

type ChatPanelProps = {
  t: Theme
}

export function ChatPanel({ t }: ChatPanelProps) {
  return (
    <div
      style={{
        width: 560,
        flexShrink: 0,
        background: t.chatBg,
        borderRight: `1px solid ${t.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${t.border}`,
          fontSize: 11,
          fontWeight: 600,
          color: t.textMuted,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          fontFamily: t.monoFont,
        }}
      >
        Instructions
      </div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '10px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {CHAT_MESSAGES.map((msg, index) => (
          <ChatMessage key={index} msg={msg} t={t} delay={index * 80} />
        ))}
        <div style={{ padding: '4px 14px', animation: 'slideUp 0.3s ease' }}>
          <div
            style={{
              fontSize: 11,
              color: AGENT_COLORS.Implementor,
              fontFamily: t.monoFont,
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: AGENT_COLORS.Implementor,
                animation: 'pulse 1.2s ease-in-out infinite',
                display: 'inline-block',
              }}
            />
            Implementor
          </div>
          <div style={{ fontSize: 12, color: t.text, lineHeight: 1.45, opacity: 0.9 }}>
            Writing spring entrance for tag reveal
            <ThinkingDots />
          </div>
        </div>
      </div>
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${t.border}` }}>
        <div
          style={{
            background: t.inputBg,
            border: `1px solid ${t.inputBorder}`,
            borderRadius: t.radius,
            display: 'flex',
            alignItems: 'center',
            padding: '7px 10px',
            gap: 8,
          }}
        >
          <input
            placeholder="Give instructions..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 12,
              color: t.text,
              fontFamily: t.font,
            }}
          />
          <button
            style={{
              background: t.accent,
              border: 'none',
              width: 24,
              height: 24,
              borderRadius: t.radiusSm,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000',
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            ↑
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {['Upload asset', 'Adjust timing'].map((label) => (
            <button
              key={label}
              style={{
                fontSize: 10.5,
                padding: '3px 8px',
                background: t.tagBg,
                border: `1px solid ${t.border}`,
                borderRadius: 99,
                color: t.textMuted,
                cursor: 'pointer',
                fontFamily: t.font,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
