import { forwardRef } from 'react'

/**
 * The default card.
 *
 * Replaces GlassCard as the product surface. GlassCard still exists and is
 * still correct — for chrome (topbar, palette, modals, mobile nav), where blur
 * communicates that content is scrolling underneath. Everywhere else the blur
 * was costing legibility for no information gain, so Surface is opaque.
 *
 * `tone` picks the elevation tier rather than exposing raw colours, which is
 * what keeps a screen's foreground/background relationship consistent across
 * pages built by different hands.
 */
const TONE = {
  sunken: 'well',
  quiet: 'surface-1',
  default: 'card',
  raised: 'card card-raised',
}

export const Surface = forwardRef(function Surface(
  {
    children,
    className = '',
    tone = 'default',
    interactive = false,
    as: Tag = 'div',
    onClick,
    ...rest
  },
  ref,
) {
  const clickable = typeof onClick === 'function'

  return (
    <Tag
      ref={ref}
      onClick={onClick}
      role={clickable && Tag === 'div' ? 'button' : undefined}
      tabIndex={clickable && Tag === 'div' ? 0 : undefined}
      // Keyboard parity: a clickable div must also be activatable.
      onKeyDown={
        clickable && Tag === 'div'
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick(event)
              }
            }
          : undefined
      }
      className={`${TONE[tone] || TONE.default} ${
        interactive || clickable ? 'card-interactive' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
})

/**
 * Panel = Surface + a typographic header.
 *
 * The v2 `Panel` led with an accent-coloured icon beside every title, so six
 * panels produced six accent marks and the accent stopped meaning anything.
 * Here the header is type and a rule; `action` carries the only interactive
 * affordance, and colour is saved for data.
 */
export function Panel({
  title,
  action,
  children,
  className = '',
  bodyClassName = '',
  tone = 'default',
}) {
  return (
    // `h-full` so a panel fills its grid cell. Without it a short card (an
    // empty movers list) floats at the top of a row sized by a tall sibling
    // (six holdings), and the bento reads as broken rather than asymmetric.
    <Surface as="section" tone={tone} className={`flex h-full flex-col ${className}`}>
      {title ? (
        <header className="flex min-h-[26px] items-center gap-3 px-4 pb-3 pt-3.5 sm:px-5">
          <h2 className="t-eyebrow shrink-0 !text-text-secondary">{title}</h2>
          <span className="hairline h-px flex-1" aria-hidden="true" />
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={`flex-1 px-4 pb-4 sm:px-5 sm:pb-5 ${bodyClassName}`}>{children}</div>
    </Surface>
  )
}
