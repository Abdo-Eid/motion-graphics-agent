import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { ActivityEvent, IngestStatus } from '../lib/events'
import { getMastraUrl } from '../lib/events'
import { ACCEPTED_UPLOAD_TYPES, isAcceptedUpload } from '../lib/upload-types'
import { uploadProjectFile } from '../lib/workspace-api'
import { AGENT_COLORS, type Theme } from '../theme/themes'
import { UploadDropzone } from './upload-dropzone'

type ChatPanelProps = {
  t: Theme
  projectId: string
  events: ActivityEvent[]
}

type ChatEntry =
  | { id: string; role: 'user' | 'assistant' | 'system'; content: string }
  | { id: string; role: 'upload'; fileName: string; assetId: string | null; status: IngestStatus; error?: string }

type UploadedFile = {
  assetId: string
  originalName: string
  path: string
  mime?: string
}

const INITIAL_MESSAGES: ChatEntry[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content: 'Describe the video you want. Upload PDFs, notes, CSVs, or images when they should inform the build.',
  },
]

function uploadStatusFor(assetId: string | null, events: ActivityEvent[], fallback: IngestStatus) {
  if (!assetId) {
    return fallback
  }

  const event = events.findLast(
    (candidate): candidate is Extract<ActivityEvent, { type: 'upload.status' }> =>
      candidate.type === 'upload.status' && candidate.assetId === assetId,
  )
  return event?.status ?? fallback
}

function messageWithUploadContext(text: string, uploads: UploadedFile[]) {
  if (uploads.length === 0) {
    return text
  }

  const uploadLines = uploads.map((upload) => {
    const mime = upload.mime ? ` (${upload.mime})` : ''
    return `- User uploaded "${upload.originalName}" at "${upload.path}"${mime}.`
  })

  return `${uploadLines.join('\n')}\n\nUser request:\n${text}`
}

export function ChatPanel({ t, projectId, events }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatEntry[]>(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, events])

  const submitMessage = async () => {
    const text = input.trim()

    if (!text) {
      return
    }

    const content = messageWithUploadContext(text, uploadedFiles)

    setInput('')
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: text }])

    try {
      const response = await fetch(new URL('/api/agents/planner-agent/stream', getMastraUrl()), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content }],
          projectId,
          threadId: projectId,
          resourceId: projectId,
          memory: { thread: projectId, resource: projectId },
        }),
      })

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: 'Instruction sent. Agent responses will appear in the activity stream.',
        },
      ])
    } catch (err: unknown) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: `Planner endpoint unavailable: ${err instanceof Error ? err.message : 'request failed'}`,
        },
      ])
    }
  }

  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const rowId = crypto.randomUUID()

      if (!isAcceptedUpload(file)) {
        setMessages((current) => [
          ...current,
          {
            id: rowId,
            role: 'system',
            content: `${file.name} was rejected. Accepted: PDF, MD, TXT, CSV, and image files.`,
          },
        ])
        continue
      }

      setMessages((current) => [
        ...current,
        { id: rowId, role: 'upload', fileName: file.name, assetId: null, status: 'pending' },
      ])

      try {
        const result = await uploadProjectFile(projectId, file)
        if (result.path) {
          setUploadedFiles((current) => [
            ...current,
            {
              assetId: result.assetId,
              originalName: result.originalName ?? file.name,
              path: result.path,
              mime: result.mime ?? file.type,
            },
          ])
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === rowId && message.role === 'upload'
              ? { ...message, assetId: result.assetId, status: result.ingestStatus === 'done' ? 'done' : 'pending' }
              : message,
          ),
        )
      } catch (err: unknown) {
        setMessages((current) =>
          current.map((message) =>
            message.id === rowId && message.role === 'upload'
              ? {
                  ...message,
                  status: 'errored',
                  error: err instanceof Error ? err.message : 'upload failed',
                }
              : message,
          ),
        )
      }
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    void uploadFiles(event.dataTransfer.files)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        width: 560,
        flexShrink: 0,
        background: t.chatBg,
        borderRight: `1px solid ${t.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <UploadDropzone t={t} visible={dragging} />
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
        ref={scrollRef}
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
        {messages.map((message) =>
          message.role === 'upload' ? (
            <UploadRow
              key={message.id}
              t={t}
              fileName={message.fileName}
              status={uploadStatusFor(message.assetId, events, message.status)}
              error={message.error}
            />
          ) : (
            <ChatRow key={message.id} t={t} role={message.role} content={message.content} />
          ),
        )}
      </div>
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${t.border}` }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_UPLOAD_TYPES}
          onChange={(event) => {
            if (event.currentTarget.files) {
              void uploadFiles(event.currentTarget.files)
              event.currentTarget.value = ''
            }
          }}
          style={{ display: 'none' }}
        />
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
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void submitMessage()
              }
            }}
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
            onClick={() => void submitMessage()}
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
          <button
            onClick={() => fileInputRef.current?.click()}
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
            + Upload
          </button>
          <span style={{ fontSize: 10.5, color: t.textMuted, padding: '4px 0' }}>
            PDF, MD, TXT, CSV, images
          </span>
        </div>
      </div>
    </div>
  )
}

function ChatRow({ t, role, content }: { t: Theme; role: 'user' | 'assistant' | 'system'; content: string }) {
  const isUser = role === 'user'
  const color = role === 'system' ? t.textMuted : isUser ? t.accent : AGENT_COLORS.Planner

  return (
    <div style={{ padding: '4px 14px', minWidth: 0, overflowWrap: 'anywhere' }}>
      <div style={{ fontSize: 11, color, fontFamily: t.monoFont, marginBottom: 4 }}>
        {isUser ? 'you' : role}
      </div>
      <div
        style={{
          fontSize: 12,
          color: isUser || role === 'system' ? t.textMuted : t.text,
          lineHeight: 1.45,
          fontStyle: isUser ? 'italic' : 'normal',
        }}
      >
        {content}
      </div>
    </div>
  )
}

function UploadRow({
  t,
  fileName,
  status,
  error,
}: {
  t: Theme
  fileName: string
  status: IngestStatus
  error?: string
}) {
  const done = status === 'done'
  const failed = status === 'errored'

  return (
    <div style={{ padding: '4px 14px' }}>
      <div
        style={{
          border: `1px solid ${failed ? 'oklch(0.62 0.22 25)' : t.border}`,
          borderRadius: t.radius,
          background: t.tagBg,
          padding: '7px 9px',
          fontSize: 11,
          color: t.text,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: done ? 'oklch(0.62 0.18 155)' : failed ? 'oklch(0.62 0.22 25)' : t.accent }}>
            {done ? '✓' : failed ? '!' : '◌'}
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
          <span style={{ color: t.textMuted, fontFamily: t.monoFont }}>{status}</span>
        </div>
        {done ? <div style={{ marginTop: 5, color: t.textMuted }}>Added for retrieval or asset use.</div> : null}
        {error ? <div style={{ marginTop: 5, color: 'oklch(0.62 0.22 25)' }}>{error}</div> : null}
      </div>
    </div>
  )
}
