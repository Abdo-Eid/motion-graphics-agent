import type { Dispatch, SetStateAction } from 'react'
import type { Theme } from '../theme/themes'
import { CodeViewer } from './code-viewer'
import { FileTreePanel } from './file-tree-panel'

export type BottomPanelTab = 'files' | 'code'

type BottomPanelProps = {
  t: Theme
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  activeFile: string | null
  setActiveFile: Dispatch<SetStateAction<string | null>>
  activeTab: BottomPanelTab
  setActiveTab: Dispatch<SetStateAction<BottomPanelTab>>
  workspaceRevision: number
}

const TABS: BottomPanelTab[] = ['files', 'code']

export function BottomPanel({
  t,
  open,
  setOpen,
  activeFile,
  setActiveFile,
  activeTab,
  setActiveTab,
  workspaceRevision,
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
            <>
              <FileTreePanel
                t={t}
                activeFile={activeFile}
                onSelectFile={(path) => {
                  setActiveFile(path)
                  setActiveTab('code')
                }}
                revision={workspaceRevision}
              />
              <CodeViewer t={t} path={activeFile} revision={workspaceRevision} />
            </>
          ) : (
            <CodeViewer t={t} path={activeFile} revision={workspaceRevision} />
          )}
        </div>
      )}
    </div>
  )
}
