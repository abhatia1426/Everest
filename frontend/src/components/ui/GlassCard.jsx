import { forwardRef } from 'react'

/**
 * Frosted glass surface. Every colour comes from a CSS variable, so the same
 * markup renders correctly in both themes with no conditional logic.
 *
 * The inner highlight is a ::before-equivalent rendered as a real element —
 * a pseudo-element cannot be expressed inline, and keeping it here means
 * GlassCard works without depending on a matching class in index.css.
 */
export const GlassCard = forwardRef(function GlassCard(
  {
    children,
    className = '',
    onClick,
    style,
    as: Tag = 'div',
    // Lets a full-height container (the sidebar) make its content fill the card.
    contentClassName = '',
    // Floats the card onto the top elevation tier.
    raised = false,
    ...rest
  },
  ref,
) {
  const interactive = typeof onClick === 'function'

  // The card needs a positioning context for its highlight overlay, but we must
  // not force `relative`: Tailwind emits `.relative` AFTER `.fixed`/`.absolute`/
  // `.sticky`, so at equal specificity it wins on source order and would
  // silently override a position passed in via className.
  const positioned = /(^|\s)(fixed|absolute|sticky|static)(\s|$)/.test(className)

  return (
    <Tag
      ref={ref}
      onClick={onClick}
      // Keyboard parity: a clickable div must also be focusable and activatable.
      role={interactive && Tag === 'div' ? 'button' : undefined}
      tabIndex={interactive && Tag === 'div' ? 0 : undefined}
      onKeyDown={
        interactive && Tag === 'div'
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick(event)
              }
            }
          : undefined
      }
      // Styling lives in the `.card` recipe (index.css) so the elevation
      // system is defined in exactly one place.
      className={`card ${positioned ? '' : 'relative'} ${
        interactive ? 'cursor-pointer' : ''
      } ${raised ? 'card-raised' : ''} ${className}`}
      style={style}
      {...rest}
    >
      <div className={`relative ${contentClassName}`}>{children}</div>
    </Tag>
  )
})
