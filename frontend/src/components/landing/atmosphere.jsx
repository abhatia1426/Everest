import { VIEW } from './everest'

/**
 * THE AIR.
 *
 * Everything in the scene that is not rock: the sky column, the light behind
 * the peak, haze between the depth layers, cloud, and the spindrift banner off
 * the summit.
 *
 * ATMOSPHERIC PERSPECTIVE IS PAINTED, NOT FILTERED.
 *
 * The scene is built back-to-front, and a translucent haze rect is laid down
 * BETWEEN each pair of layers. A mountain four layers back is therefore seen
 * through four sheets of air and dissolves; the Nuptse wall in front is seen
 * through none and stays near-black. This is how a matte painter does it, and
 * it costs four rects — where an SVG blur filter over a 1600x900 area would
 * cost a full-surface raster on every frame of the scroll.
 *
 * There is not a single `filter` in this file for that reason. Soft edges come
 * from gradients that fade to transparent, which the GPU composites for free.
 */

/**
 * Gradient and mask definitions.
 *
 * All ids are namespaced by the caller's `useId`, because two instances of the
 * scene on one page (the hero and the ascent) would otherwise collide — and an
 * SVG gradient id collision resolves silently to the first one, producing a
 * scene that is subtly, unexplainably wrong rather than broken.
 */
export function AtmosphereDefs({ id }) {
  return (
    <defs>
      {/*
        THE SKY COLUMN.

        Five stops, not two. The zenith is the coldest and deepest value; the
        band just above the ridgeline is the brightest. That non-linear ramp is
        what makes the air read as something with DEPTH you are looking up
        through, rather than as a background fill.
      */}
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--sky-zenith)" />
        <stop offset="26%" stopColor="var(--sky-high)" />
        <stop offset="54%" stopColor="var(--sky-mid)" />
        <stop offset="78%" stopColor="var(--sky-low)" />
        <stop offset="100%" stopColor="var(--sky-horizon)" />
      </linearGradient>

      {/* The light source, behind and left of the summit. */}
      {/* Energy pushed to the outer stops: no findable edge, no bright core. */}
      <radialGradient id={`${id}-glow`}>
        <stop offset="0%" stopColor="var(--sky-glow-core)" />
        <stop offset="26%" stopColor="var(--sky-glow)" />
        <stop offset="62%" stopColor="var(--sky-glow)" stopOpacity="0.35" />
        <stop offset="100%" stopColor="transparent" />
      </radialGradient>

      {/* Rim light spilling around the west arête. */}
      <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--tr9)" stopOpacity="0.55" />
        <stop offset="100%" stopColor="var(--tr9)" stopOpacity="0" />
      </linearGradient>

      {/*
        HAZE. Vertical: thin at the top of a layer, dense at its base, because
        you are looking through more air the closer to the horizon you look.
        One gradient, reused at four different opacities.
      */}
      <linearGradient id={`${id}-haze`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="rgb(var(--haze))" stopOpacity="0" />
        <stop offset="55%" stopColor="rgb(var(--haze))" stopOpacity="0.72" />
        <stop offset="100%" stopColor="rgb(var(--haze))" stopOpacity="1" />
      </linearGradient>

      {/* Soft-bodied cloud. Never a hard edge anywhere on it. */}
      <radialGradient id={`${id}-cloud`}>
        <stop offset="0%" stopColor="rgb(var(--cloud))" stopOpacity="1" />
        <stop offset="46%" stopColor="rgb(var(--cloud))" stopOpacity="0.6" />
        <stop offset="100%" stopColor="rgb(var(--cloud))" stopOpacity="0" />
      </radialGradient>

      {/* The summit plume, thinning as it streams east. */}
      <linearGradient id={`${id}-drift`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="rgb(var(--spindrift))" stopOpacity="0.5" />
        <stop offset="45%" stopColor="rgb(var(--spindrift))" stopOpacity="0.22" />
        <stop offset="100%" stopColor="rgb(var(--spindrift))" stopOpacity="0" />
      </linearGradient>

      {/*
        The base fade. The scene has to END somewhere, and a hard cut at the
        bottom of the viewport would announce "this is an illustration in a
        box". Instead the foreground dissolves into the page background, so the
        mountain and the page are one continuous surface.
      */}
      <linearGradient id={`${id}-base`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="rgb(var(--bg-base-rgb))" stopOpacity="0" />
        <stop offset="100%" stopColor="rgb(var(--bg-base-rgb))" stopOpacity="1" />
      </linearGradient>
    </defs>
  )
}

/** The sky column, the light behind the peak, and — at night — a few stars. */
export function Sky({ id }) {
  return (
    <g>
      {/*
        Deliberately much taller than the viewBox. The narrow framing shifts the
        whole scene down by ~200 units so the summit clears the headline on a
        phone, and a sky sized to the viewBox would leave an unpainted strip
        along the top — invisible in dark mode, a white band in daylight.
      */}
      <rect x="-60" y="-460" width={VIEW.w + 120} height={VIEW.h + 900} fill={`url(#${id}-sky)`} />

      {/*
        Stars are driven by `--star-opacity`, which light mode sets to 0. No
        conditional rendering and no `isDark` prop — the theme switch is a CSS
        attribute flip, so the sky changes hour without React doing anything.
      */}
      <g style={{ opacity: 'var(--star-opacity)' }} fill="rgb(var(--spindrift))">
        {STARS.map((s, i) => (
          <circle key={i} cx={s[0]} cy={s[1]} r={s[2]} opacity={s[3]} />
        ))}
      </g>

      {/*
        The light source, behind and left of the summit.

        BIG AND SOFT. At rx=520 it read as a discrete bright disc floating in
        the sky — a lens flare, or a smudge. Ambient light has no edge you can
        find, so the ellipse is nearly as wide as the frame and the gradient
        carries almost all its energy in the outer stops.
      */}
      <ellipse cx="700" cy="300" rx="820" ry="520" fill={`url(#${id}-glow)`} />
    </g>
  )
}

/**
 * A sheet of air.
 *
 * @param {number} from   viewBox y where the sheet begins
 * @param {number} amount 0-1 opacity of the sheet
 */
export function Haze({ id, from, amount }) {
  return (
    <rect
      x="-60"
      y={from}
      width={VIEW.w + 120}
      height={VIEW.h - from + 60}
      fill={`url(#${id}-haze)`}
      opacity={amount}
    />
  )
}

/**
 * High-altitude cloud.
 *
 * Each bank is several very flat overlapping ellipses. Flat is the whole
 * point — cumulus is a fair-weather, low-altitude shape, and putting it at
 * 8,000m instantly reads as wrong. At this height cloud is stratiform and
 * lenticular: it lies in sheets and it streams.
 */
export function CloudBank({ id, cx, cy, scale = 1, opacity = 1 }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`} opacity={opacity}>
      <ellipse cx="0" cy="0" rx="300" ry="26" fill={`url(#${id}-cloud)`} />
      <ellipse cx="-130" cy="10" rx="170" ry="17" fill={`url(#${id}-cloud)`} />
      <ellipse cx="150" cy="-8" rx="200" ry="14" fill={`url(#${id}-cloud)`} />
      <ellipse cx="40" cy="14" rx="240" ry="11" fill={`url(#${id}-cloud)`} />
    </g>
  )
}

/**
 * THE SUMMIT PLUME.
 *
 * Everest's most recognisable non-geometric feature: the jet stream shears the
 * top of the mountain and tears a banner of ice crystals eastward off the
 * summit. It is the detail that says "this peak is in the jet stream" — which
 * is to say, it is the detail that says the mountain is very, very high.
 */
export function Spindrift({ id, opacity = 1 }) {
  return (
    /*
     * NO BLEND MODE. `mix-blend-mode: screen` turned this into a hard grey bar
     * over the night sky — it lightened everything it crossed uniformly, which
     * is the opposite of a translucent veil. Plain alpha over a gradient that
     * already fades to nothing is both cheaper and correct.
     *
     * The plume also has to stay THIN. Snow streaming off a summit is a wisp
     * seen from twenty kilometres away; drawn thick it reads as a cloud sitting
     * on the peak, or worse, as a smudge on the artwork.
     */
    <g opacity={opacity}>
      {/*
        NO PATHS, NO STROKES — soft forms only.

        Every previous attempt at this drew the plume as a filled path with
        stroked streaks over it, and every one of them rendered as a hard bright
        BAR ruled across the sky: a scratch on the artwork, the most conspicuous
        thing in the frame, and the first thing the eye went to instead of the
        summit.

        The reason is that a gradient-filled path still has a crisp silhouette,
        and a crisp silhouette on a 400px-long thin shape is a line no matter
        what is inside it. Blown snow has no silhouette at all. So the plume is
        built from the same soft ellipses as the cloud, tilted along the wind
        and fading out — the shape is never resolved, which is the whole point.
      */}
      {/*
        SHORT AND FAINT. Run out to x=1490 at half opacity, these ellipses
        merged into one continuous beam from the summit to the corner of the
        frame — a comet, and the brightest thing in the composition. The plume
        is a grace note on the peak, so it now stops within ~250px of it and
        never rises above a fifth of full strength.
      */}
      <g transform="rotate(-6 1010 216)">
        <ellipse cx="1084" cy="210" rx="96" ry="12" fill={`url(#${id}-cloud)`} opacity="0.22" />
        <ellipse cx="1168" cy="200" rx="104" ry="8" fill={`url(#${id}-cloud)`} opacity="0.15" />
        <ellipse cx="1246" cy="192" rx="82" ry="5" fill={`url(#${id}-cloud)`} opacity="0.09" />
      </g>
    </g>
  )
}

/**
 * THE CLOUD SEA.
 *
 * A bright band of cloud lying in the valley between the massif and the Nuptse
 * wall — the single highest-leverage element in the whole composition.
 *
 * Before it, the mountain met the foreground directly and the two dark masses
 * fused into one silhouette: a big shape with a notch in it, occupying the
 * bottom two-thirds of the frame and reading FLAT. Putting a luminous
 * horizontal band between them separates the planes instantly, and because the
 * band is level and the mountain is not, it also establishes a horizon — so the
 * peak stops being a shape on a page and starts being something ABOVE you.
 *
 * It is also simply true of the place. The Khumbu sits under a sea of monsoon
 * cloud for much of the year, and the summits stand out of it.
 */
export function CloudSea({ id, y = 636, opacity = 1 }) {
  return (
    <g opacity={opacity}>
      {/* The body: one long, very flat mass, thickest in the middle. */}
      <ellipse cx="620" cy={y} rx="880" ry="46" fill={`url(#${id}-cloud)`} />
      <ellipse cx="1180" cy={y + 16} rx="620" ry="34" fill={`url(#${id}-cloud)`} />
      <ellipse cx="140" cy={y + 10} rx="520" ry="30" fill={`url(#${id}-cloud)`} />
      {/* Two risen tufts, so the top edge is not a straight line. */}
      <ellipse cx="430" cy={y - 26} rx="260" ry="20" fill={`url(#${id}-cloud)`} />
      <ellipse cx="980" cy={y - 16} rx="200" ry="15" fill={`url(#${id}-cloud)`} />
    </g>
  )
}

/** The dissolve from the foreground into the page. */
export function BaseFade({ id, from = 0.78 }) {
  return (
    <rect
      x="-60"
      y={VIEW.h * from}
      width={VIEW.w + 120}
      height={VIEW.h * (1 - from) + 60}
      fill={`url(#${id}-base)`}
    />
  )
}

/**
 * Star field — fixed, not random.
 *
 * `Math.random()` here would reshuffle the sky on every render and, worse,
 * differ between the server-rendered and client-rendered pass. A literal table
 * is boring and correct. Confined to the upper sky: stars low on the horizon
 * would sit in the haze band where real ones are extinguished.
 */
const STARS = [
  [118, 62, 1.1, 0.7], [244, 128, 0.9, 0.5], [318, 44, 1.3, 0.85], [402, 168, 0.8, 0.4],
  [486, 92, 1, 0.6], [560, 206, 0.85, 0.35], [642, 58, 1.2, 0.75], [726, 148, 0.9, 0.5],
  [822, 36, 1, 0.62], [906, 112, 0.8, 0.42], [1044, 74, 1.15, 0.7], [1132, 176, 0.85, 0.4],
  [1216, 52, 1.05, 0.66], [1298, 132, 0.9, 0.48], [1382, 88, 1.2, 0.72], [1462, 190, 0.8, 0.36],
  [1536, 66, 1, 0.58], [178, 214, 0.75, 0.32], [1594, 148, 0.85, 0.44], [70, 156, 0.95, 0.52],
  [372, 258, 0.7, 0.28], [880, 236, 0.72, 0.3], [1180, 268, 0.7, 0.26], [520, 320, 0.65, 0.2],
]
