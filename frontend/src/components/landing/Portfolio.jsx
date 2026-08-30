import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'motion/react'

import { CompanyLogo } from '../ui/CompanyLogo'
import { fmtMoney, fmtPercent, fmtSignedMoney } from '../../lib/format'
import { MassifContours, VIEW } from './everest'
import { MaskedLine } from './motion'
import { TextEffect } from './primitives'
import { INTERVAL } from './terrain.field'
import {
  BOOK,
  COVERED,
  NAMED,
  REST,
  SEGMENTS,
  TOP_THREE,
  WATCHED,
  ordinal,
  remark,
} from './portfolio.data'

/**
 * 04 — PORTFOLIO.
 *
 * THE FIELD BOOK, OPENED.
 *
 * A surveyor works three artifacts: the terrain, the FIELD BOOK the readings
 * are recorded in, and the section drawn from it. Section 03 is the plan view
 * and section 05 is the cut — they own the drawings. This is the book.
 *
 * WHY NOT A THIRD PLATE.
 *
 * The previous build here was a drilled core sample: a column whose segment
 * heights were the weights. It was an honest drawing, and it was the third
 * survey plate in a row. Plan, core, section — three orthogonal projections of
 * one survey read as one long act of MEASURING, and the page never stopped
 * surveying long enough to let the reader arrive at what they own.
 *
 * So the arc is now:
 *
 *   03 — survey the portfolio
 *   04 — OPEN the portfolio      <- the register changes here
 *   05 — understand the market
 *
 * This section is where the page stops drawing at the reader and hands them
 * the book.
 *
 * WHAT SURVIVES FROM THE COLUMN.
 *
 * Its one load-bearing idea: GEOMETRY IS CAPITAL. Every entry's vertical extent
 * is its weight — `height = (weight / 100) * registerHeight`, with no scaling
 * factor, no minimum row, and no exaggeration. NVDA's entry is physically about
 * twice AMZN's because it is about twice the capital. Reading down the page you
 * feel the concentration in the spacing of the rules before you read a figure.
 *
 * Entry content hangs from the TOP of its own row rather than sitting centred
 * in it. That is the difference between a book and a table: the entry is
 * written at its line, and the space beneath it is the capital it occupies. A
 * single line of type centred in a 149px row reads as a mistake; the same line
 * hung from its rule reads as a ledger.
 *
 * WHAT THE MARGIN IS FOR.
 *
 * Weight tells you what you own and nothing whatever about what moved you. The
 * column could never say this. The margin can: reach for a position and it is
 * rewritten with that position's reading, including its rank by capital against
 * its rank by what it actually moved today. AAPL is the second largest holding
 * and fourth of five by move; LLY is fourth by capital and second by move. That
 * divergence is the understanding this section exists to deliver.
 *
 * The margin is MARGINALIA — type written into the open page. It has no card,
 * no container, no background, no radius and no border box in any state, and it
 * is never empty: at rest it reads the whole book, so nothing the section needs
 * to say is gated behind an interaction the reader may never attempt.
 *
 * NOT PINNED. Scroll paces the reading; it does not gate it.
 */

/* ============================================================== the sheet */

/**
 * THE REGISTER'S HEIGHT, IN CSS RATHER THAN IN JAVASCRIPT.
 *
 * Every row is a percentage of this one number, so proportionality is enforced
 * by the layout engine rather than by arithmetic that could drift. It is a
 * custom property and not a measured value because nothing here needs to know
 * the height — the rows divide it and the graduation spans it, and both are
 * expressed as percentages of the same box.
 *
 * The three steps are set by the SMALLEST named position, not by taste. AMZN is
 * 12.3% of the book, so it gets 12.3% of the register: 76px at 620, 71px at 580,
 * 64px at 520. Those are the floors at which its logo and two lines of type
 * still have air around them. Going shorter would force a minimum row height,
 * and a minimum row height is exactly the lie this section refuses to tell.
 */
const REGISTER_H = '[--reg-h:520px] md:[--reg-h:580px] lg:[--reg-h:620px]'

/** Ticks at 03's contour interval, once. */
const TICKS = (() => {
  const out = []
  for (let v = 0; v <= 100 + 1e-9; v += INTERVAL) out.push(Math.round(v * 10) / 10)
  return out
})()

/**
 * Is the sheet too narrow to carry a margin beside the register?
 *
 * Below this the reading cannot sit next to anything, so it does what a field
 * book actually does and writes itself beneath the entry it belongs to.
 *
 * IT MUST BE TAILWIND'S `lg`, EXACTLY.
 *
 * This was 819px while the margin column was gated behind `lg:` at 1024px, and
 * the two disagreeing opened a 204px-wide hole: between 820 and 1023 the sheet
 * called itself wide, so it did not write the reading under the entry, while
 * the margin it was deferring to was still `display:none`. Hovering an entry
 * there dimmed the whole register to show a reading that did not exist
 * anywhere on the page. One breakpoint, one source, or the layout lies.
 */
function useNarrow() {
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const read = () => setNarrow(mq.matches)
    read()
    mq.addEventListener('change', read)
    return () => mq.removeEventListener('change', read)
  }, [])

  return narrow
}

/* ============================================================== the section */

export function Portfolio() {
  const spreadRef = useRef(null)
  const reduce = useReducedMotion()
  const narrow = useNarrow()

  /*
   * HOVER WINS OVER THE LATCH.
   *
   * Clicking latches a position so the reading survives the pointer leaving,
   * which is the only way touch can work at all. But while the pointer is
   * genuinely over another entry, that entry is what the reader is asking
   * about — so hover takes precedence and the latch is what it falls back to.
   *
   * On the narrow sheet there is no hover to speak of and no margin to feed,
   * so only the latch is consulted.
   */
  /*
   * THREE CHANNELS, NOT ONE.
   *
   * Pointer and keyboard must not share a slot. They did at first, and it was
   * wrong in a way that only a keyboard user would ever hit: the register's
   * container clears the hover on `mouseleave`, so any stray pointer movement
   * out of the register — including one caused by the page scrolling under a
   * stationary mouse — wiped the reading that a FOCUSED entry had put in the
   * margin. Verified in the DOM: focus landed on LLY and the margin went back
   * to reading the book.
   *
   * So a pointer clears only what the pointer set, a blur clears only what
   * focus set, and the latch survives both.
   */
  const [pointed, setPointed] = useState(null)
  const [focused, setFocused] = useState(null)
  const [latched, setLatched] = useState(null)
  const activeKey = narrow ? latched : (pointed ?? focused ?? latched)
  const active = NAMED.find((s) => s.ticker === activeKey) ?? null

  const clear = useCallback(() => {
    setPointed(null)
    setFocused(null)
    setLatched(null)
  }, [])

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') clear()
    },
    [clear],
  )

  /*
   * MEASURED ON THE SPREAD, NOT THE SECTION.
   *
   * The heading is most of a screen tall; anchored to the section, the register
   * would have finished resolving before the book was on screen. The range also
   * ENDS while the whole spread is still visible, so the finished page — the
   * thing the section exists to show — is seen complete at least once.
   */
  const { scrollYProgress } = useScroll({
    target: spreadRef,
    offset: ['start 0.92', 'end 0.72'],
  })

  /* ONE TIMELINE, FOUR MOVES: the crown rules across the head of the register,
     the graduation comes up beside it, the entries resolve heaviest-first, and
     the datum finally runs out to both edges — which is the line 05 opens on. */
  const crown = useTransform(scrollYProgress, [0.02, 0.24], [0, 1])
  const scale = useTransform(scrollYProgress, [0.06, 0.4], [0, 1])
  const reveal = useTransform(scrollYProgress, [0.12, 0.78], [0, 1])
  const datum = useTransform(scrollYProgress, [0.6, 0.92], [0, 1])

  return (
    <section id="portfolio" className="relative overflow-hidden pb-[7vh] pt-[7vh]">
      {/*
        THE MAP, RETIRING.

        Section 02 brought the contours over the mountain and 03 made them the
        subject. Here they are ambient and nearly gone — the device fading over
        three sections rather than being switched off — and section 05 picks
        them up at THIS EXACT OPACITY to collapse them onto its datum. Holding
        them steady here rather than transforming them is deliberate: 05 owns
        the collapse, and doing it twice would make the page look like it has
        one idea. Do not restyle this layer without reading Market.jsx first.
      */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.13]" aria-hidden="true">
        <svg
          className="h-full w-full"
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          preserveAspectRatio="xMidYMid slice"
        >
          <MassifContours count={7} stroke="var(--text-tertiary)" />
        </svg>
      </div>

      {/* --------------------------------------------------------- heading */}
      <div className="relative mx-auto w-full max-w-[1240px] px-[var(--space-page)]">
        <div className="max-w-[560px]">
          <p className="e-label mb-6 flex items-center gap-3">
            <span
              className="h-px w-8 shrink-0"
              style={{ background: 'currentColor', opacity: 0.5 }}
              aria-hidden="true"
            />
            04 — Portfolio
          </p>

          <h2 className="e-title">
            <MaskedLine>The book</MaskedLine>
            <MaskedLine delay={0.08}>
              <span style={{ color: 'var(--text-secondary)' }}>behind the map.</span>
            </MaskedLine>
          </h2>

          <TextEffect className="e-lead mt-7 max-w-[var(--e-measure)]" delay={0.15}>
            Every position at the weight it carries — and what each one actually did today.
          </TextEffect>
        </div>
      </div>

      {/* ------------------------------------------------------- the spread */}
      <div
        ref={spreadRef}
        className={`relative mx-auto mt-12 w-full max-w-[1240px] px-[var(--space-page)] lg:mt-16 ${REGISTER_H}`}
      >
        {/*
          THE BOOK, ON THE NARROW SHEET.

          The wide sheet states the book in the margin at rest. The narrow sheet
          has no margin — so without this, the total value, the day's change and
          the concentration simply did not exist below 1024px. Verified at 834
          and 390: the section never once said what the portfolio was worth,
          which on a phone is most of what the reader came for.

          It sits at the HEAD of the register rather than under it, because that
          is where a book states itself: the register's own title, above its
          entries. It stays put when an entry is opened — the entry writes its
          reading at its own line, and the book keeps stating the book.
        */}
        {narrow && (
          <div className="mb-12 max-w-[420px]">
            <BookReading />
          </div>
        )}

        <div
          className="grid gap-x-10 lg:grid-cols-[minmax(0,1fr)_1px_320px]"
          onMouseLeave={() => setPointed(null)}
          onKeyDown={onKeyDown}
          role="presentation"
        >
          {/* ------------------------------------------------ the register */}
          <div className="flex">
            {/* The graduation is dropped on the narrow sheet.

                Not for room — it is 22px — but because an opened entry there
                grows the register in flow, and a scale pinned to the register's
                RESTING height would stop short of its own ticks the moment the
                reader opened anything. Section 05's compact sheet drops its
                lettering for the same class of reason: a measurement that can
                fall out of register with what it measures is worse than an
                absent one. The edge annotation drops its graduation clause to
                match, so the sheet never claims a scale it did not draw. */}
            {!narrow && <Graduation progress={scale} reduce={reduce} />}

            <div className="relative min-w-0 flex-1">
              {/* THE CROWN RULE. The head of the book — the one line above
                  which there is no more capital. It is the register's first
                  rule, which is why no entry draws its own. */}
              <motion.span
                className="absolute inset-x-0 top-0 h-px origin-left"
                style={{
                  background: 'var(--text-primary)',
                  opacity: 0.42,
                  scaleX: reduce ? 1 : crown,
                }}
                aria-hidden="true"
              />

              {SEGMENTS.map((s, i) =>
                s.named ? (
                  <Entry
                    key={s.key}
                    s={s}
                    i={i}
                    lead={i === 0}
                    active={activeKey === s.ticker}
                    dimmed={activeKey !== null && activeKey !== s.ticker}
                    narrow={narrow}
                    reveal={reveal}
                    reduce={reduce}
                    onPoint={() => setPointed(s.ticker)}
                    onUnpoint={() => setPointed(null)}
                    onFocus={() => setFocused(s.ticker)}
                    onUnfocus={() => setFocused(null)}
                    onToggle={() =>
                      setLatched((cur) => (cur === s.ticker ? null : s.ticker))
                    }
                  />
                ) : (
                  <Remainder
                    key={s.key}
                    s={s}
                    i={i}
                    dimmed={activeKey !== null}
                    reveal={reveal}
                    reduce={reduce}
                  />
                ),
              )}
            </div>
          </div>

          {/* THE FOLD. One hairline — the gutter of an open book. Not a panel
              edge: it has no corners, no fill and nothing sits inside it. */}
          <div
            className="hidden self-stretch lg:block"
            style={{ background: 'var(--border)' }}
            aria-hidden="true"
          />

          {/* --------------------------------------------------- the margin */}
          {/* Rendered only where it has room to be marginalia. On the narrow
              sheet the reading is written under its own entry instead. */}
          {!narrow && (
            <div className="hidden lg:block">
              <Margin s={active} reduce={reduce} />
            </div>
          )}
        </div>
      </div>

      {/* The sheet's edge annotation — same register as 03's and 05's, outside
          the page where a survey states its own units. */}
      <div className="relative mx-auto mt-10 w-full max-w-[1240px] px-[var(--space-page)]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <p className="e-label">
            Height: share of capital
            {/* Only claimed where it is actually drawn — see the graduation. */}
            {narrow ? null : (
              <>
                &nbsp;·&nbsp; Graduated at {INTERVAL.toFixed(1)}% of book
                <span className="hidden lg:inline">, the survey&apos;s contour interval</span>
              </>
            )}
          </p>
          <p className="e-label !text-text-secondary">
            Watched, no capital: {WATCHED.map((w) => w.ticker).join(' · ')}
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------------- the datum */}
      {/*
        FULL BLEED, AND THE LAST THING THE SECTION DRAWS.

        Section 05 opens on a datum in exactly this position, labelled with
        exactly this word, positioned with exactly these classes — the seam is
        one line continuing, not two drawings meeting. Market.jsx's `Reference`
        is the other half of this; change one and you must change both.
      */}
      <div className="relative mt-10 w-full">
        <motion.div
          className="h-px w-full origin-left"
          style={{ background: 'var(--border-strong)', scaleX: reduce ? 1 : datum }}
          aria-hidden="true"
        />
        <motion.div
          className="absolute left-[var(--space-page)] top-0 -translate-y-full pb-1"
          style={{ opacity: reduce ? 1 : datum }}
        >
          <p className="e-label">Datum</p>
        </motion.div>
      </div>
    </section>
  )
}

/* ================================================================= pieces */

/**
 * THE GRADUATION — 03's contour interval, standing up.
 *
 * Section 03 contours the book at 2% of capital and draws every fifth line
 * heavier. The register is ruled at exactly the same interval with exactly the
 * same emphasis, so the map's contour spacing becomes the book's own scale. It
 * is the transition stated as a measurement rather than asserted in copy.
 *
 * Labelled only from `lg`, where there is genuinely room for lettering to the
 * left of the ticks. Below that the graduation stays as texture and the figures
 * live in the entries, where they are anyway.
 */
function Graduation({ progress, reduce }) {
  return (
    <motion.div
      className="relative w-[22px] shrink-0 lg:w-[62px]"
      style={{ height: 'var(--reg-h)', opacity: reduce ? 1 : progress }}
      aria-hidden="true"
    >
      {TICKS.map((v) => (
        <span
          key={v}
          className="absolute right-0 h-px"
          style={{
            top: `${v}%`,
            width: v % 10 === 0 ? 16 : 7,
            background: 'var(--border-strong)',
            opacity: v % 10 === 0 ? 1 : 0.5,
          }}
        />
      ))}

      {TICKS.filter((v) => v % 20 === 0).map((v) => (
        <span
          key={v}
          className="num absolute right-[22px] hidden -translate-y-1/2 text-[10.5px]
            text-text-tertiary lg:block"
          style={{ top: `${v}%` }}
        >
          {v}%
        </span>
      ))}
    </motion.div>
  )
}

/**
 * The triangulation mark from 03, at the entry it belongs to.
 *
 * Same mark, same colour family, different artifact — the station you plotted
 * on the map is the entry you are now reading. It is the quietest possible
 * carry-over and it does the whole job of continuity, which is why this section
 * adds no other survey furniture.
 *
 * At rest the cross is drawn in the border colour with the accent held in the
 * centre dot alone; active brings the accent up. That is the entire focus
 * signal on the register side — no ring, no fill, no box.
 */
function Mark({ active, lead }) {
  const size = lead ? 15 : 13
  const stroke = active ? 'var(--accent-blue)' : 'var(--border-strong)'

  return (
    <span
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="absolute h-px transition-colors duration-200"
        style={{ width: size, background: stroke }}
      />
      <span
        className="absolute w-px transition-colors duration-200"
        style={{ height: size, background: stroke }}
      />
      <span
        className="absolute rounded-full transition-all duration-200"
        style={{
          width: active ? 6 : 4,
          height: active ? 6 : 4,
          background: 'var(--accent-blue)',
          opacity: active ? 1 : 0.5,
        }}
      />
    </span>
  )
}

/**
 * ONE POSITION, AS A REGISTER ENTRY.
 *
 * NOT A CARD AND NOT A TABLE ROW. A survey mark, a logo, a name, and the
 * figures run out to the right margin — the grammar of a ruled book. The row's
 * HEIGHT is the position's weight, and its content hangs from the rule at the
 * top of that row, so the air beneath the type is the capital.
 *
 * A real `<button>`, so keyboard focus, `aria-pressed` and touch all work
 * without re-implementing any of them on a div. It is styled to nothing: the
 * only thing that makes it look interactive is that the page responds.
 */
function Entry({
  s,
  i,
  lead,
  active,
  dimmed,
  narrow,
  reveal,
  reduce,
  onPoint,
  onUnpoint,
  onFocus,
  onUnfocus,
  onToggle,
}) {
  const appear = useTransform(reveal, [i * 0.1, 0.32 + i * 0.1], [0, 1])

  return (
    <motion.div className="relative" style={{ opacity: reduce ? 1 : appear }}>
      <button
        style={{ height: `calc(var(--reg-h) * ${s.height / 100})` }}
        type="button"
        aria-pressed={active}
        aria-label={`${s.ticker}, ${s.name}, ${s.weight.toFixed(1)}% of book`}
        onMouseEnter={onPoint}
        onMouseLeave={onUnpoint}
        /*
         * ONLY KEYBOARD FOCUS FEEDS THE MARGIN.
         *
         * A mouse click focuses the button too, and treating that as a focus
         * READING made the latch impossible to release: click to latch, click
         * again to unlatch, move the pointer away — and the reading stayed,
         * because the button still held focus and the focus channel was still
         * asserting it. Verified end to end; the margin never returned to the
         * book.
         *
         * `:focus-visible` is exactly the distinction wanted here — it is true
         * when the browser judges the focus worth showing a ring for (keyboard,
         * assistive tech) and false for a plain mouse click. So the keyboard
         * gets a margin that follows it, and the mouse gets a latch it can
         * actually turn off.
         */
        onFocus={(e) => {
          let visible = true
          try {
            visible = e.currentTarget.matches(':focus-visible')
          } catch {
            /* Pre-:focus-visible engines: fall back to treating focus as
               keyboard focus, which is the accessible default. */
          }
          if (visible) onFocus()
        }}
        onBlur={onUnfocus}
        onClick={onToggle}
        /*
         * flex-col, NOT block.
         *
         * A button centres its own content box vertically — a UA behaviour, not
         * a style anything here sets — so `block` plus `pt-4` still rendered the
         * entry in the MIDDLE of its row. Measured: NVDA's content sat 53px into
         * a 149px row and AMZN's 19px into a 76px one, i.e. exactly centred,
         * scaling with the weight. That reads as a mis-centred table row and it
         * throws away the one idea this register is built on: the entry is
         * written at its rule, and the air beneath it is the capital.
         */
        className="group relative flex w-full flex-col justify-start appearance-none border-0
          bg-transparent p-0 text-left outline-none"
      >
        {/* The entry's own rule. The crown draws the first one, so this hangs
            below it and the register never doubles a line. */}
        {i > 0 && (
          <span
            className="absolute inset-x-0 top-0 h-px"
            style={{ background: 'var(--border)' }}
            aria-hidden="true"
          />
        )}

        {/* Focus, and only focus, gets a mark in the left edge — a keyboard
            reader needs to see where they are, and a pointer reader never
            sees this at all. */}
        <span
          className="absolute left-0 top-0 h-px w-6 opacity-0 transition-opacity duration-200
            group-focus-visible:opacity-100"
          style={{ background: 'var(--accent-blue)' }}
          aria-hidden="true"
        />

        <span
          className="flex items-center gap-3 pr-1 pt-4 transition-opacity duration-[260ms]
            sm:gap-4"
          style={{ opacity: dimmed ? 0.4 : 1 }}
        >
          <Mark active={active} lead={lead} />

          <CompanyLogo ticker={s.ticker} name={s.name} size={lead ? 28 : 22} />

          <span className="flex min-w-0 shrink items-baseline gap-2.5">
            <span
              className={`num font-semibold text-text-primary ${
                lead ? 'text-[16px] sm:text-[18px]' : 'text-[13px] sm:text-[14px]'
              }`}
            >
              {s.ticker}
            </span>
            {/* The company name is the first thing to go when the register runs
                out of room: the ticker and the logo already identify the
                position, and the figures need every pixel. */}
            <span
              className="hidden truncate text-[11.5px] text-text-tertiary xl:inline"
              style={{ opacity: 0.85 }}
            >
              {s.name}
            </span>
          </span>

          <span className="flex-1" aria-hidden="true" />

          <span className="flex shrink-0 items-baseline gap-3 whitespace-nowrap sm:gap-6">
            <span
              className={`num font-semibold text-text-primary ${
                lead ? 'text-[14px]' : 'text-[12.5px]'
              }`}
            >
              {fmtMoney(s.value)}
            </span>
            <span
              className={`num hidden text-right text-text-secondary sm:block ${
                lead ? 'w-[54px] text-[13px]' : 'w-[50px] text-[12px]'
              }`}
            >
              {s.weight.toFixed(1)}%
            </span>
            <span
              className={`num text-right font-semibold ${
                s.change >= 0 ? 'text-up' : 'text-down'
              } ${lead ? 'w-[58px] text-[13px]' : 'w-[54px] text-[12px]'}`}
            >
              {fmtPercent(s.change)}
            </span>
          </span>
        </span>
      </button>

      {/*
        THE NARROW SHEET'S READING.

        No margin to write into, so the remarks are written under the entry they
        belong to — which is what a field book does when the page runs out. The
        row grows to hold them; that displacement is the act of opening, not a
        layout bug, and it is why only one entry can be open at a time.
      */}
      {narrow && (
        <AnimatePresence initial={false}>
          {active && (
            <motion.div
              key="reading"
              className="overflow-hidden"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.32, ease: [0.22, 0.61, 0.36, 1] }}
            >
              <div className="pb-5 pl-[26px] pt-4">
                <Reading s={s} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  )
}

/**
 * The capital the register does not name.
 *
 * Deliberately quiet and deliberately present. Hatched rather than filled — a
 * surveyor hatches ground that is there but not surveyed, which is exactly what
 * the other nine positions are. It carries no mark, no logo and no reading,
 * because there is nothing behind it to read.
 *
 * A register of five entries that silently stopped at 90.1% would be the book
 * lying about its own size, which is the one thing it may not do.
 */
function Remainder({ s, i, dimmed, reveal, reduce }) {
  const appear = useTransform(reveal, [i * 0.1, 0.32 + i * 0.1], [0, 1])

  return (
    <motion.div
      className="relative"
      style={{
        height: `calc(var(--reg-h) * ${s.height / 100})`,
        opacity: reduce ? 1 : appear,
      }}
    >
      <span
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'var(--border)' }}
        aria-hidden="true"
      />
      <span
        className="absolute inset-x-0 bottom-0 top-px"
        style={{
          background:
            'repeating-linear-gradient(45deg, transparent 0 6px, var(--border-strong) 6px 7px)',
          opacity: 0.5,
        }}
        aria-hidden="true"
      />

      <span
        className="relative flex items-baseline gap-3 pt-4 transition-opacity duration-[260ms]"
        style={{ opacity: dimmed ? 0.4 : 1 }}
      >
        <span className="e-label">
          {s.count} further positions
          <span className="hidden sm:inline"> &nbsp;·&nbsp; not named on this sheet</span>
        </span>
        <span className="flex-1" aria-hidden="true" />
        <span className="num text-[11.5px] text-text-tertiary">{s.height.toFixed(1)}%</span>
      </span>
    </motion.div>
  )
}

/**
 * THE MARGIN.
 *
 * Marginalia, not a panel: no card, no container, no background, no radius, no
 * border box, in any state. The only rules are hairlines of the same weight the
 * register is ruled with, because a survey book's margin is ruled too.
 *
 * It is NEVER EMPTY. At rest it reads the whole book, so a reader who never
 * touches anything still gets a complete statement — and the interaction adds
 * to the page rather than unlocking it.
 *
 * The two states are absolutely positioned in a min-height box so the crossfade
 * overlaps cleanly and the spread's grid never reflows when the reading
 * changes. Motion here communicates focus and nothing else: a short fade with a
 * 6px rise, no spring, no overshoot.
 */
function Margin({ s, reduce }) {
  return (
    <div className="relative min-h-[360px]" aria-live="polite">
      {/*
       * A CROSSFADE, NOT A SEQUENCE.
       *
       * `mode="wait"` runs exit and entrance in series, so every swap cost the
       * sum of both — and a reader sweeping the register generates a swap per
       * entry. Clearing the old reading is not information; writing the new one
       * is, and there is no moment where the margin should be blank.
       *
       * Both readings occupy the same absolutely-positioned box, so one simply
       * dissolves into the other in a single ~0.22s move. Nothing has to finish
       * before the next thing starts, which is what a margin that follows a
       * moving pointer needs.
       */}
      <AnimatePresence initial={false}>
        <motion.div
          key={s ? s.ticker : '__book__'}
          className="absolute inset-x-0 top-0"
          /*
           * The exit is FASTER than the entrance, and deliberately so.
           *
           * `mode="wait"` runs them in series, so a symmetrical 0.28/0.28 cost
           * 0.56s per swap — measured, and far too slow for something driven by
           * hover, where a reader sweeping the register wants the margin to keep
           * up with them. Clearing the old reading is not information; writing
           * the new one is. So the old one goes at 0.14 and the new one arrives
           * at 0.24, which lands the whole swap under 0.4s while still reading
           * as one deliberate movement rather than a flicker.
           */
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { duration: reduce ? 0 : 0.22, ease: [0.22, 0.61, 0.36, 1] },
          }}
          exit={
            reduce
              ? { opacity: 0 }
              : { opacity: 0, y: -4, transition: { duration: 0.16, ease: 'easeIn' } }
          }
        >
          {s ? <Reading s={s} /> : <BookReading />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** A hairline of the same weight the register is ruled with. */
function Rule() {
  return (
    <div className="my-5 h-px w-full" style={{ background: 'var(--border)' }} aria-hidden="true" />
  )
}

/**
 * The margin at rest — the whole book.
 *
 * PERCENTAGE ONLY at book level. The product's own dollar move is deliberately
 * absent: see portfolio.data, which documents why a book dollar move printed
 * beside per-position dollar moves invites an addition that does not close.
 */
function BookReading() {
  return (
    <>
      <p className="e-label">The book</p>

      <p className="num-hero mt-3 text-[clamp(1.75rem,2.6vw,2.375rem)] leading-none
        text-text-primary">
        {fmtMoney(BOOK.total)}
      </p>

      <p className="num mt-2.5 text-[13px] font-semibold text-up">
        {fmtPercent(BOOK.change)} today
      </p>

      <Rule />

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="e-label">Positions</dt>
        <dd className="num text-right text-[12.5px] text-text-primary">{BOOK.positions}</dd>
        <dt className="e-label">Named</dt>
        <dd className="num text-right text-[12.5px] text-text-primary">{NAMED.length}</dd>
        <dt className="e-label">Covered</dt>
        <dd className="num text-right text-[12.5px] text-text-primary">
          {COVERED.toFixed(1)}%
        </dd>
      </dl>

      <Rule />

      <p className="max-w-[34ch] text-[13px] leading-relaxed text-text-secondary">
        Top three hold {TOP_THREE.toFixed(1)}% of capital. The remaining {REST.count} positions
        share {REST.height.toFixed(1)}%.
      </p>
    </>
  )
}

/**
 * The margin, reading one position.
 *
 * The two ranks at the foot are the point of the whole section. Their
 * denominators differ and both are printed, because they have to: capital rank
 * is valid against all fourteen positions, and move rank is only knowable
 * across the five the book names. Blurring that into one number would be a
 * fabricated denominator on a financial page.
 */
function Reading({ s }) {
  const up = s.change >= 0

  return (
    <>
      <p className="e-label">{s.sector}</p>

      <div className="mt-3 flex items-center gap-3">
        <CompanyLogo ticker={s.ticker} name={s.name} size={30} />
        <span className="num text-[20px] font-semibold leading-none text-text-primary">
          {s.ticker}
        </span>
      </div>

      <p className="mt-2 text-[12.5px] text-text-tertiary">{s.name}</p>

      <Rule />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <dt className="e-label">Value</dt>
          <dd className="num mt-1.5 text-[14px] font-semibold text-text-primary">
            {fmtMoney(s.value)}
          </dd>
        </div>
        <div>
          <dt className="e-label">Of book</dt>
          <dd className="num mt-1.5 text-[14px] font-semibold text-text-primary">
            {s.weight.toFixed(1)}%
          </dd>
        </div>
        <div>
          <dt className="e-label">Today</dt>
          <dd className={`num mt-1.5 text-[14px] font-semibold ${up ? 'text-up' : 'text-down'}`}>
            {fmtPercent(s.change)}
          </dd>
        </div>
        <div>
          <dt className="e-label">Moved</dt>
          <dd className={`num mt-1.5 text-[14px] font-semibold ${up ? 'text-up' : 'text-down'}`}>
            {fmtSignedMoney(s.move)}
          </dd>
        </div>
      </dl>

      <Rule />

      <p className="e-label !text-text-secondary">
        {ordinal(s.capitalRank)} of {BOOK.positions} by capital
      </p>
      <p className="e-label mt-2 !text-text-secondary">
        {ordinal(s.moveRank)} of {NAMED.length} named by today&apos;s move
      </p>

      <p className="mt-4 max-w-[34ch] text-[13px] leading-relaxed text-text-secondary">
        {remark(s)}
      </p>
    </>
  )
}
