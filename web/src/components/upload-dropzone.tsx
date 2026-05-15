import type { Theme } from '../theme/themes'

type UploadDropzoneProps = {
  t: Theme
  visible: boolean
}

export function UploadDropzone({ t, visible }: UploadDropzoneProps) {
  if (!visible) {
    return null
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 8,
        border: `1px dashed ${t.accent}`,
        background: t.accentGlow,
        borderRadius: t.radius,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: t.tagText,
        fontSize: 12,
        fontFamily: t.monoFont,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      Drop PDF, text, CSV, markdown, or image assets
    </div>
  )
}
