import { useEffect, useState } from 'react'
import { AgentLog } from './components/agent-log'
import { BottomPanel, type BottomPanelTab } from './components/bottom-panel'
import { ChatPanel } from './components/chat-panel'
import { PlayerPanel } from './components/player-panel'
import { Topbar } from './components/topbar'
import { THEMES } from './theme/themes'

export default function App() {
  const [activeFile, setActiveFile] = useState('Timeline.tsx')
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0.42)
  const [bottomOpen, setBottomOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<BottomPanelTab>('files')
  const [dark, setDark] = useState(
    () => localStorage.getItem('theme') === 'dark',
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

      <Topbar t={t} dark={dark} setDark={setDark} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ChatPanel t={t} />
        <PlayerPanel
          t={t}
          playing={playing}
          setPlaying={setPlaying}
          progress={progress}
          setProgress={setProgress}
        />
        <AgentLog t={t} />
      </div>

      <BottomPanel
        t={t}
        open={bottomOpen}
        setOpen={setBottomOpen}
        activeFile={activeFile}
        setActiveFile={setActiveFile}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </div>
  )
}
