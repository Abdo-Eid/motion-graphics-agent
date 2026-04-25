import type { Dispatch, SetStateAction } from 'react'
import { CODE_PREVIEW, FILE_TREE } from '../data/mock-data'
import type { FileTreeEntry } from '../data/mock-data'
import type { Theme } from '../theme/themes'

export type BottomPanelTab = 'files' | 'code'

type BottomPanelProps = {
  t: Theme
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  activeFile: string
  setActiveFile: Dispatch<SetStateAction<string>>
  activeTab: BottomPanelTab
  setActiveTab: Dispatch<SetStateAction<BottomPanelTab>>
}

const CODE_HIGHLIGHT_LINES = new Set([5, 6, 7, 8, 9, 13, 14])
const TABS: BottomPanelTab[] = ['files', 'code']

function getCodeLineColor(line: string, t: Theme) {
  if (line.includes('spring(') || line.includes('interpolate(')) {
    return t.tagText
  }

  if (line.includes('const ')) {
    return t.accentAlt
  }

  if (line.includes('//')) {
    return t.textMuted
  }

  return t.text
}

function fileLabel(entry: FileTreeEntry) {
  return entry.type === 'dir' ? `▸ ${entry.name}` : entry.name
}

export function BottomPanel({
  t,
  open,
  setOpen,
  activeFile,
  setActiveFile,
  activeTab,
  setActiveTab,
}: BottomPanelProps) {
  return (
    <div
      style={{
        height: open ? 200 : 32,
        flexShrink: 0,
        borderTop: `1px solid ${t.border}`,
        background: t.surface,
        transition: 'height 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: open ? `1px solid ${t.border}` : 'none',
          height: 32,
          flexShrink: 0,
          paddingLeft: 12,
          gap: 2,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab)
              if (!open) {
                setOpen(true)
              }
            }}
            style={{
              padding: '0 12px',
              height: '100%',
              background: 'transparent',
              border: 'none',
              borderBottom:
                activeTab === tab && open
                  ? `2px solid ${t.accent}`
                  : '2px solid transparent',
              color: activeTab === tab && open ? t.text : t.textMuted,
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: t.monoFont,
              letterSpacing: '.04em',
            }}
          >
            {tab}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setOpen((current) => !current)}
          style={{
            padding: '0 12px',
            height: '100%',
            background: 'transparent',
            border: 'none',
            color: t.textMuted,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {open ? '▼' : '▲'}
        </button>
      </div>

      {open && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {activeTab === 'files' ? (
            <div
              style={{
                width: 200,
                borderRight: `1px solid ${t.border}`,
                overflowY: 'auto',
                padding: '6px 0',
              }}
            >
              {FILE_TREE.map((entry, index) => (
                <div
                  key={`${entry.name}-${index}`}
                  onClick={() => entry.type === 'file' && setActiveFile(entry.name)}
                  style={{
                    padding: `3px 10px 3px ${10 + entry.depth * 14}px`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: entry.type === 'file' ? 'pointer' : 'default',
                    background:
                      entry.name === activeFile
                        ? t.tagBg
                        : entry.editing
                          ? t.accentGlow
                          : 'transparent',
                    borderLeft: entry.editing
                      ? `2px solid ${t.accent}`
                      : '2px solid transparent',
                  }}
                >
                  <span
                    style={{
                      fontFamily: t.monoFont,
                      fontSize: 10,
                      color:
                        entry.type === 'dir'
                          ? t.textDim
                          : entry.editing
                            ? t.tagText
                            : entry.name === activeFile
                              ? t.text
                              : t.textMuted,
                    }}
                  >
                    {fileLabel(entry)}
                  </span>
                  {entry.editing && (
                    <span
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: t.accent,
                        marginLeft: 'auto',
                        animation: 'pulse 1.2s ease-in-out infinite',
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'auto',
                padding: '8px 0',
              }}
            >
              <div
                style={{
                  fontFamily: t.monoFont,
                  fontSize: 11,
                  lineHeight: 1.7,
                  whiteSpace: 'pre',
                }}
              >
                {CODE_PREVIEW.split('\n').map((line, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      padding: '0 16px',
                      background: CODE_HIGHLIGHT_LINES.has(index)
                        ? t.tagBg
                        : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        color: t.textDim,
                        width: 28,
                        flexShrink: 0,
                        fontSize: 10,
                        paddingTop: 1,
                        userSelect: 'none',
                      }}
                    >
                      {index + 1}
                    </span>
                    <span style={{ color: getCodeLineColor(line, t) }}>{line}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
