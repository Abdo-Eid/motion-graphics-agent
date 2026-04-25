import { AGENT_COLORS, type Theme } from '../theme/themes'
import type { ChatMessageData } from '../data/mock-data'

type ChatMessageProps = {
  msg: ChatMessageData
  t: Theme
  delay: number
}

export function ThinkingDots() {
  return (
    <span
      style={{
        display: 'inline-flex',
        gap: 3,
        alignItems: 'center',
        marginLeft: 4,
      }}
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: 'currentColor',
            display: 'inline-block',
            animation: `dotPulse 1.2s ease-in-out ${index * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  )
}

export function ChatMessage({ msg, t, delay }: ChatMessageProps) {
  const isUser = msg.role === 'user'
  const agentColor = isUser ? t.accent : AGENT_COLORS[msg.agent]

  return (
    <div
      style={{
        padding: '4px 14px',
        animation: `slideUp 0.25s ease ${delay}ms both`,
        minWidth: 0,
        overflowWrap: 'anywhere',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: isUser ? t.textMuted : agentColor,
          fontFamily: t.monoFont,
          marginBottom: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {!isUser && (
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: agentColor,
              display: 'inline-block',
            }}
          />
        )}
        {isUser ? 'you' : msg.agent}
      </div>
      {msg.content && (
        <div
          style={{
            fontSize: 12,
            color: isUser ? t.textMuted : t.text,
            lineHeight: 1.45,
            fontStyle: isUser ? 'italic' : 'normal',
          }}
        >
          {msg.content}
        </div>
      )}
      {!isUser && msg.tool && (
        <div
          style={{
            marginTop: 4,
            background: t.tagBg,
            border: `1px solid ${t.border}`,
            borderRadius: t.radiusSm,
            padding: '4px 8px',
            fontFamily: t.monoFont,
            fontSize: 10,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              color: msg.tool.status === 'done' ? t.tagText : t.accent,
              minWidth: 0,
            }}
          >
            {msg.tool.status === 'done' ? (
              <span style={{ color: 'oklch(0.72 0.22 155)', flexShrink: 0 }}>
                ✓
              </span>
            ) : (
              <span
                style={{
                  animation: 'spin 1s linear infinite',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              >
                ◌
              </span>
            )}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                minWidth: 0,
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              <span style={{ opacity: 0.7 }}>{msg.tool.name}</span>
              {msg.tool.args && (
                <span style={{ color: t.textMuted, opacity: 0.7 }}>
                  {msg.tool.args}
                </span>
              )}
            </div>
          </div>
          {msg.tool.result && (
            <div
              style={{
                color: 'oklch(0.72 0.22 155)',
                marginTop: 3,
                opacity: 0.85,
              }}
            >
              {msg.tool.result}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
