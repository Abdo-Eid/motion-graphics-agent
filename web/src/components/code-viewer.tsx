import { useEffect, useState } from 'react'
import { getWorkspaceFile } from '../lib/workspace-api'
import type { Theme } from '../theme/themes'

type CodeViewerProps = {
  t: Theme
  path: string | null
  revision: number
}

type LoadedCode = {
  path: string | null
  revision: number
  content: string
  error: string | null
}

function lineColor(line: string, t: Theme) {
  if (line.trim().startsWith('//')) {
    return t.textMuted
  }

  if (/\b(const|let|function|export|import|return)\b/.test(line)) {
    return t.tagText
  }

  if (line.includes('=>') || line.includes('className=')) {
    return t.accentAlt
  }

  return t.text
}

export function CodeViewer({ t, path, revision }: CodeViewerProps) {
  const [loaded, setLoaded] = useState<LoadedCode>({
    path: null,
    revision: 0,
    content: '',
    error: null,
  })

  useEffect(() => {
    if (!path) {
      return
    }

    let cancelled = false

    getWorkspaceFile(path)
      .then((file) => {
        if (!cancelled) {
          setLoaded({ path, revision, content: file.content, error: null })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoaded({
            path,
            revision,
            content: '',
            error: err instanceof Error ? err.message : 'Unable to load file',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [path, revision])

  if (!path) {
    return <EmptyState t={t} label="Select a workspace file to inspect generated code." />
  }

  const loading = loaded.path !== path || loaded.revision !== revision

  if (loading) {
    return <EmptyState t={t} label={`Loading ${path}...`} />
  }

  if (loaded.error) {
    return <EmptyState t={t} label={`Cannot read ${path}: ${loaded.error}`} />
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
      <div style={{ padding: '0 16px 8px', color: t.textMuted, fontSize: 10, fontFamily: t.monoFont }}>
        {path}
      </div>
      <div style={{ fontFamily: t.monoFont, fontSize: 11, lineHeight: 1.7, whiteSpace: 'pre' }}>
        {loaded.content.split('\n').map((line, index) => (
          <div key={index} style={{ display: 'flex', padding: '0 16px' }}>
            <span style={{ color: t.textDim, width: 34, flexShrink: 0, userSelect: 'none' }}>
              {index + 1}
            </span>
            <span style={{ color: lineColor(line, t) }}>{line || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ t, label }: { t: Theme; label: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: t.textMuted, fontSize: 11 }}>{label}</span>
    </div>
  )
}
