import { useEffect } from 'react'
import { Link } from 'react-router-dom'

import { Logo } from '../components/Brand'
import { Hero } from '../components/landing/Hero'
import { Nav } from '../components/landing/Nav'
import { Ascent } from '../components/landing/Ascent'
import { Terrain } from '../components/landing/Terrain'
import { Portfolio } from '../components/landing/Portfolio'
import { Market } from '../components/landing/Market'
import { Exposure, Instrument, Signal, Summit } from '../components/landing/story'

/**
 * Everest — landing page.
 *
 * AN EDITORIAL PRODUCT STORY, not a feature grid. Eight numbered sections,
 * each making one claim and immediately evidencing it with the product:
 *
 *   01  Hero            see the market, know your position
 *   02  The problem     fragmented information, resolved on screen
 *   03  One view        the portfolio experience
 *   04  Follow          watchlist and research
 *   05  Risk            options, breakeven, capital at risk
 *   06  Intelligence    the AI workspace, honestly framed
 *   07  Together        the surfaces as one instrument
 *   08  Close           one line, one action
 *
 * PRINCIPLES
 *
 * · Type carries the page. The hero headline runs to 10.5rem — roughly three
 *   times the largest figure anywhere in /app. Everything else is quiet.
 * · The product is composed INTO the page, never pasted on top of it. Panels
 *   are built from the app's own primitives and tokens (see landing/panels),
 *   so the marketing surface cannot drift from the product.
 * · Ambient light is local to the hero and the close. It is a brand moment at
 *   the two ends of the story, not a permanent background wash.
 * · Motion is scroll-linked and decelerating: masked line reveals, small
 *   parallax offsets, one recede on the hero. No springs with overshoot, no
 *   idle loops, and every primitive collapses to its final state under
 *   `prefers-reduced-motion`.
 * · NO FABRICATED CLAIMS. There are no user counts, ratings, testimonials,
 *   partner logos or performance figures anywhere on this page, because none
 *   of them exist. The page earns credibility by showing the product.
 */
export default function Landing() {
  /*
   * ALWAYS OPEN AT THE TOP.
   *
   * Browsers default `history.scrollRestoration` to 'auto', so a refresh puts
   * the reader back at their previous offset. On a page whose first 490vh is
   * pinned cinematic scenes that means reloading drops you into the middle of
   * a camera move with no context — the scene reads as broken rather than as
   * a position you scrolled to.
   *
   * Restoration is disabled for this route only (the app's own routes still
   * restore, which is what you want there) and restored on unmount. The
   * rAF-deferred second call catches browsers that apply their restore after
   * the first paint; both are cheap and neither interferes with normal
   * scrolling or with the pinned scenes, which read `scrollY` live.
   */
  useEffect(() => {
    const supported = 'scrollRestoration' in window.history
    const previous = supported ? window.history.scrollRestoration : null
    if (supported) window.history.scrollRestoration = 'manual'

    window.scrollTo(0, 0)
    const frame = requestAnimationFrame(() => window.scrollTo(0, 0))

    return () => {
      cancelAnimationFrame(frame)
      if (supported) window.history.scrollRestoration = previous
    }
  }, [])

  return (
    <div className="relative">
      <Nav />

      <main>
        <Hero />
        <Ascent />
        <Terrain />
        <Portfolio />
        <Market />
        <Exposure />
        <Signal />
        <Instrument />
        <Summit />
      </main>

      <Footer />
    </div>
  )
}

/**
 * Footer.
 *
 * Carries the one piece of housekeeping the page genuinely needs: a plain
 * statement of what the data is and is not. On a financial product that is not
 * boilerplate — it is the same honesty the app applies to every quote.
 */
function Footer() {
  return (
    <footer
      className="border-t px-[var(--space-page)] py-12"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/" className="inline-block text-text-primary" aria-label="Everest home">
            <Logo size={18} />
          </Link>
          <p className="mt-3 max-w-[42ch] text-[12px] leading-relaxed text-text-tertiary">
            Everest is a portfolio tracker and research tool. Market data may be delayed and is
            provided for information only — nothing here is financial advice, and AI-generated
            analysis is interpretation, not a forecast.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-8 gap-y-3">
          {/* These must track the section ids in landing/story. The previous
              set pointed at #one-view / #markets / #risk / #intelligence, which
              no longer exist — dead anchors that silently do nothing. */}
          {[
            ['Portfolio', '#portfolio'],
            ['Market', '#market'],
            ['Exposure', '#exposure'],
            ['Intelligence', '#signal'],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-[12.5px] text-text-secondary transition-colors duration-200
                hover:text-text-primary"
            >
              {label}
            </a>
          ))}
          <Link
            to="/login"
            className="text-[12.5px] text-text-secondary transition-colors duration-200
              hover:text-text-primary"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  )
}
