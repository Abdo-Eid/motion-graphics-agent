import './mock-product-tour.css'

type MockProductTourProps = {
  progress: number
}

type Phase = {
  start: number
  end: number
  file: string | null
}

type CodeKind = 'kw' | 'tag' | 'text' | 'sym' | 'expr'

type CodeLine = {
  text: string
  kind: CodeKind
  highlight?: boolean
}

const PHASES: Phase[] = [
  { start: 0, end: 0.15, file: 'UpgradeButton.tsx' },
  { start: 0.15, end: 0.32, file: 'UpgradeButton.tsx' },
  { start: 0.32, end: 0.5, file: 'UpgradeButton.tsx' },
  { start: 0.5, end: 0.65, file: 'UpgradeButton.tsx' },
  { start: 0.65, end: 0.85, file: 'PricingPage.tsx' },
  { start: 0.85, end: 1, file: null },
]

const CODE_BLOCKS: CodeLine[][] = [
  [{ text: '<Button>Upgrade</Button>', kind: 'tag' }],
  [
    { text: '<Button variant="primary">', kind: 'tag' },
    { text: '  Upgrade', kind: 'text' },
    { text: '</Button>', kind: 'tag' },
  ],
  [
    { text: 'function UpgradeButton() {', kind: 'kw', highlight: true },
    { text: '  return (', kind: 'kw' },
    { text: '    <Button variant="primary">', kind: 'tag' },
    { text: '      Upgrade', kind: 'text' },
    { text: '    </Button>', kind: 'tag' },
    { text: '  );', kind: 'sym' },
    { text: '}', kind: 'sym' },
  ],
  [
    { text: 'function UpgradeButton({ plan }) {', kind: 'kw', highlight: true },
    { text: '  return (', kind: 'kw' },
    { text: '    <Button variant="primary">', kind: 'tag' },
    { text: '      Upgrade to {plan}', kind: 'expr' },
    { text: '    </Button>', kind: 'tag' },
    { text: '  );', kind: 'sym' },
    { text: '}', kind: 'sym' },
  ],
  [
    { text: '<PricingCard plan="Pro" price="$29">', kind: 'tag' },
    { text: '  <UpgradeButton plan="Pro" />', kind: 'tag' },
    { text: '</PricingCard>', kind: 'tag' },
  ],
]

const OVERLAYS = [
  'Start with the smallest possible UI.',
  'Add intent with a variant.',
  "Now it's reusable.",
  null,
  'Small UI → reusable component → real product screen.',
]

function CodeDemoPreview({ phaseIndex, local }: { phaseIndex: number; local: number }) {
  const opacity = Math.min(1, local * 4)
  const scale = 0.88 + opacity * 0.12

  if (phaseIndex === 0) {
    return (
      <div style={{ opacity, transform: `scale(${scale})` }}>
        <button className="mock-tour-button mock-tour-button--plain">Upgrade</button>
      </div>
    )
  }

  if (phaseIndex === 1) {
    return (
      <div style={{ opacity, transform: `scale(${scale})` }}>
        <button className="mock-tour-button mock-tour-button--primary">Upgrade</button>
      </div>
    )
  }

  if (phaseIndex === 2) {
    const labelOpacity = Math.min(1, Math.max(0, (local - 0.5) * 5))

    return (
      <div className="mock-tour-component-preview" style={{ opacity }}>
        <div
          className="mock-tour-component-label"
          style={{
            opacity: labelOpacity,
            transform: `translateY(${(1 - labelOpacity) * 8}px)`,
          }}
        >
          UpgradeButton
        </div>
        <button className="mock-tour-button mock-tour-button--primary">Upgrade</button>
      </div>
    )
  }

  if (phaseIndex === 3) {
    return (
      <div className="mock-tour-component-preview mock-tour-component-preview--compact" style={{ opacity }}>
        <button className="mock-tour-button mock-tour-button--primary mock-tour-button--wide">
          Upgrade to Pro
        </button>
        <div
          className="mock-tour-injected-label"
          style={{ opacity: Math.min(1, (local - 0.3) * 4) }}
        >
          plan=&quot;Pro&quot; injected ↑
        </div>
      </div>
    )
  }

  if (phaseIndex === 4) {
    const featuresOpacity = Math.min(1, Math.max(0, (local - 0.2) * 3))
    const buttonOpacity = Math.min(1, Math.max(0, (local - 0.5) * 5))

    return (
      <div className="mock-tour-pricing-card" style={{ opacity, transform: `scale(${scale})` }}>
        <div className="mock-tour-pricing-plan">Pro</div>
        <div className="mock-tour-pricing-price">
          $29<span>/mo</span>
        </div>
        <div className="mock-tour-pricing-divider" />
        <div className="mock-tour-feature-list" style={{ opacity: featuresOpacity }}>
          {['Unlimited projects', 'Priority support', 'Custom domain'].map((feature) => (
            <div key={feature} className="mock-tour-feature">
              <span>✓</span>
              {feature}
            </div>
          ))}
        </div>
        <button
          className="mock-tour-button mock-tour-button--primary mock-tour-button--full"
          style={{ opacity: buttonOpacity }}
        >
          Upgrade to Pro
        </button>
      </div>
    )
  }

  return null
}

export function MockProductTour({ progress }: MockProductTourProps) {
  let phaseIndex = PHASES.findIndex((phase) => progress < phase.end)

  if (phaseIndex === -1) {
    phaseIndex = 5
  }

  const phase = PHASES[phaseIndex]
  const local = (progress - phase.start) / (phase.end - phase.start)

  if (phaseIndex === 5) {
    const opacity = Math.min(1, local * 3)

    return (
      <div className="mock-tour-final">
        <div
          className="mock-tour-final-copy"
          style={{
            opacity,
            transform: `translateY(${(1 - opacity) * 16}px)`,
          }}
        >
          <div>
            &quot;Build components
            <br />
            one layer at a time.&quot;
          </div>
        </div>
      </div>
    )
  }

  const code = CODE_BLOCKS[phaseIndex]
  const overlay = OVERLAYS[phaseIndex]

  return (
    <div className="mock-tour">
      <div className="mock-tour-code-pane">
        <div className="mock-tour-window-bar">
          <div className="mock-tour-window-dots">
            {['#ff5f57', '#ffbd2e', '#28c840'].map((color) => (
              <div key={color} style={{ background: color }} />
            ))}
          </div>
          <span>{phase.file}</span>
        </div>
        <div className="mock-tour-code-block">
          {code.map((line, index) => {
            const opacity = Math.max(0, Math.min(1, local * 6 - index * 0.45))
            const highlighted = Boolean(line.highlight && local > 0.55)

            return (
              <div
                key={`${phaseIndex}-${index}`}
                className={`mock-tour-code-line ${highlighted ? 'is-highlighted' : ''}`}
                style={{
                  opacity,
                  transform: `translateX(${(1 - opacity) * 10}px)`,
                }}
              >
                <span className="mock-tour-line-number">{index + 1}</span>
                <span className={`mock-tour-token mock-tour-token--${line.kind}`}>
                  {line.text}
                </span>
              </div>
            )
          })}
          <div className="mock-tour-cursor-line">
            <span />
            <span />
          </div>
        </div>
      </div>

      <div className="mock-tour-preview-pane">
        <div className="mock-tour-preview-label">Preview</div>
        <div className="mock-tour-preview-stage">
          <CodeDemoPreview phaseIndex={phaseIndex} local={local} />
        </div>
        {overlay && local > 0.45 && (
          <div
            className="mock-tour-overlay"
            style={{ opacity: Math.min(1, (local - 0.45) * 5) }}
          >
            {overlay}
          </div>
        )}
      </div>
    </div>
  )
}
