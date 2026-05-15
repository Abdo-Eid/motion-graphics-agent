import { useEffect, useMemo, useState } from 'react'
import { ActivityPanel } from './components/activity-panel'
import { BottomPanel, type BottomPanelTab } from './components/bottom-panel'
import { ChatPanel } from './components/chat-panel'
import { ConnectionStatus } from './components/connection-status'
import { PlayerPanel } from './components/player-panel'
import { Topbar } from './components/topbar'
import { useActivityStream } from './lib/events'
import { THEMES } from './theme/themes'

const PROJECT_ID = 'product-walkthrough'

export default function App() {
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0.42)
  const [bottomOpen, setBottomOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<BottomPanelTab>('files')
  const [dark, setDark] = useState(
    () => localStorage.getItem('theme') === 'dark',
  )
  const activity = useActivityStream(PROJECT_ID)
  const workspaceRevision = useMemo(
    () =>
      activity.events.reduce(
        (latest, event) => (event.type === 'workspace.file' ? Math.max(latest, event.ts) : latest),
        0,
      ),
    [activity.events],
  )

  const t = dark ? THEMES.dark : THEMES.light

  useEffect(() => {
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    let raf = 0

    if (playing) {
      const step = () => {
        setProgress((currentProgress) => {
          if (currentProgress >= 1) {
            setPlaying(false)
            return 0
          }

          return currentProgress + 0.0022
        })

        raf = requestAnimationFrame(step)
      }

      raf = requestAnimationFrame(step)
    }

    return () => cancelAnimationFrame(raf)
  }, [playing])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: t.bg,
        color: t.text,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: t.font,
      }}
    >
      <style>{`
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${t.scrollThumb}; border-radius: 99px; }
        * { font-family: ${t.font}; }
        input::placeholder { color: ${t.textMuted}; }
      `}</style>

      <Topbar
        t={t}
        dark={dark}
        setDark={setDark}
        statusSlot={
          <ConnectionStatus
            t={t}
            connection={activity.connection}
            events={activity.events}
            onRetry={activity.reconnect}
          />
        }
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ChatPanel t={t} projectId={PROJECT_ID} events={activity.events} />
        <PlayerPanel
          t={t}
          playing={playing}
          setPlaying={setPlaying}
          progress={progress}
          setProgress={setProgress}
          events={activity.events}
          revision={workspaceRevision}
        />
        <ActivityPanel t={t} events={activity.events} connection={activity.connection} />
      </div>

      <BottomPanel
        t={t}
        open={bottomOpen}
        setOpen={setBottomOpen}
        activeFile={activeFile}
        setActiveFile={setActiveFile}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        workspaceRevision={workspaceRevision}
      />
    </div>
  )
}
