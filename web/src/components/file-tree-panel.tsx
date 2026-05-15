import { useEffect, useState } from 'react'
import { listWorkspaceFiles, type WorkspaceFileEntry } from '../lib/workspace-api'
import type { Theme } from '../theme/themes'

type FileTreePanelProps = {
  t: Theme
  activeFile: string | null
  onSelectFile: (path: string) => void
  revision: number
}

type LoadedDirectory = {
  entries: WorkspaceFileEntry[]
  open: boolean
  error: string | null
  loading: boolean
}

function childPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name
}

export function FileTreePanel({ t, activeFile, onSelectFile, revision }: FileTreePanelProps) {
  const [directories, setDirectories] = useState<Record<string, LoadedDirectory>>({
    '': { entries: [], open: true, error: null, loading: true },
  })

  useEffect(() => {
    let cancelled = false

    listWorkspaceFiles('')
      .then((entries) => {
        if (!cancelled) {
          setDirectories((current) => ({
            ...current,
            '': { entries, open: true, error: null, loading: false },
          }))
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDirectories((current) => ({
            ...current,
            '': {
              entries: [],
              open: true,
              error: err instanceof Error ? err.message : 'Unable to load workspace',
              loading: false,
            },
          }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [revision])

  const loadDirectory = (path: string) => {
    setDirectories((current) => ({
      ...current,
      [path]: {
        entries: current[path]?.entries ?? [],
        open: true,
        error: null,
        loading: true,
      },
    }))

    listWorkspaceFiles(path)
      .then((entries) => {
        setDirectories((current) => ({
          ...current,
          [path]: { entries, open: true, error: null, loading: false },
        }))
      })
      .catch((err: unknown) => {
        setDirectories((current) => ({
          ...current,
          [path]: {
            entries: [],
            open: true,
            error: err instanceof Error ? err.message : 'Unable to load directory',
            loading: false,
          },
        }))
      })
  }

  const toggleDirectory = (path: string) => {
    const directory = directories[path]

    if (!directory || directory.entries.length === 0) {
      loadDirectory(path)
      return
    }

    setDirectories((current) => ({
      ...current,
      [path]: { ...directory, open: !directory.open },
    }))
  }

  const root = directories['']

  return (
    <div style={{ width: 220, borderRight: `1px solid ${t.border}`, overflowY: 'auto', padding: '6px 0' }}>
      {!root || root.loading ? <TreeStatus t={t} label="Loading workspace..." /> : null}
      {root?.error ? <TreeStatus t={t} label={`Workspace unavailable: ${root.error}`} /> : null}
      {root && !root.loading && !root.error && root.entries.length === 0 ? (
        <TreeStatus t={t} label="No generated files yet." />
      ) : null}
      {root?.entries.map((entry) => renderEntry(entry, '', 0))}
    </div>
  )

  function renderEntry(entry: WorkspaceFileEntry, parent: string, depth: number) {
    const path = childPath(parent, entry.name)
    const directory = directories[path]
    const isOpen = directory?.open ?? false
    const isActive = activeFile === path
    const isDir = entry.kind === 'dir'

    return (
      <div key={path}>
        <button
          onClick={() => (isDir ? toggleDirectory(path) : onSelectFile(path))}
          style={{
            width: '100%',
            border: 'none',
            background: isActive ? t.tagBg : 'transparent',
            padding: `3px 10px 3px ${10 + depth * 14}px`,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            color: isActive ? t.text : isDir ? t.textDim : t.textMuted,
            fontFamily: t.monoFont,
            fontSize: 10,
            textAlign: 'left',
          }}
        >
          <span style={{ width: 10, flexShrink: 0 }}>{isDir ? (isOpen ? '▾' : '▸') : ''}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
        </button>
        {isDir && isOpen && directory?.loading ? <TreeStatus t={t} label="Loading..." inset={depth + 1} /> : null}
        {isDir && isOpen && directory?.error ? (
          <TreeStatus t={t} label={directory.error} inset={depth + 1} />
        ) : null}
        {isDir && isOpen ? directory?.entries.map((child) => renderEntry(child, path, depth + 1)) : null}
      </div>
    )
  }
}

function TreeStatus({ t, label, inset = 0 }: { t: Theme; label: string; inset?: number }) {
  return (
    <div style={{ padding: `6px 10px 6px ${10 + inset * 14}px`, color: t.textMuted, fontSize: 10.5 }}>
      {label}
    </div>
  )
}
