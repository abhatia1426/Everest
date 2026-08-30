import { useEffect, useId, useState } from 'react'
import { motion, useReducedMotion, useTransform } from 'framer-motion'

import {
  AtmosphereDefs,
  BaseFade,
  CloudBank,
  CloudSea,
  Haze,
  Sky,
  Spindrift,
} from './atmosphere'
import { EverestMassif, FarRanges, Lhotse, Nuptse, VIEW } from './everest'

/**
 * THE SCENE — the Everest illustration assembled, with a camera on it.
 *
 * Layers are painted strictly back to front, with a sheet of haze laid between
 * each pair. That ordering is the entire depth model; there is no z-index and
 * no 3D transform anywhere in it.
 *
 *   sky and light
 *   distant Himalaya          -- 4 sheets of air away, nearly dissolved
 *   Lhotse                    -- 3
 *   Everest                   -- 2
 *   Nuptse                    -- 1, almost a silhouette
 *   foreground dissolve into the page
 *
 * THE CAMERA
 *
 * `progress` (0 -> 1) drives one move: layers translate up at rates
 * proportional to their nearness while the whole frame scales gently. Near
 * layers travel fifteen times as far as the sky, so scrolling reads as moving
 * THROUGH the environment and gaining altitude — not as panning a picture.
 *
 * The rates are the only thing making this feel like a climb, so they are
 * tuned as a set: sky -10, ranges -26, Lhotse -52, Everest -78, Nuptse -168,
 * foreground -230.
 */
export function EverestScene({ progress, className = '', narrow = false }) {
  const id = useId().replace(/:/g, '')
  const reduce = useReducedMotion()

  /*
   * Hooks cannot sit behind a branch, so every transform is created
   * unconditionally and reduced motion picks the static value at the end.
   */
  const camScale = useTransform(progress, [0, 1], [1, 1.13])
  const camY = useTransform(progress, [0, 1], [0, -34])

  const skyY = useTransform(progress, [0, 1], [0, -10])
  const rangeY = useTransform(progress, [0, 1], [0, -26])
  const lhotseY = useTransform(progress, [0, 1], [0, -52])
  const everestY = useTransform(progress, [0, 1], [0, -78])
  const nuptseY = useTransform(progress, [0, 1], [0, -168])
  const foreY = useTransform(progress, [0, 1], [0, -230])

  /* Cloud moves fastest and sideways — it is the nearest thing in the frame
     and the only element with its own weather. This is what "clouds pass
     through the scene" means mechanically. */
  const cloudHighY = useTransform(progress, [0, 1], [0, -120])
  const cloudHighX = useTransform(progress, [0, 1], [0, 84])
  const cloudMidY = useTransform(progress, [0, 1], [0, -290])
  const cloudMidX = useTransform(progress, [0, 1], [0, -130])
  const cloudMidOpacity = useTransform(progress, [0, 0.55, 1], [0.55, 0.95, 0.2])

  /* The cloud sea sits nearer than the massif and further than the wall, so it
     travels between their two rates — the ordering that keeps depth coherent. */
  const cloudSeaY = useTransform(progress, [0, 1], [0, -124])
  const cloudSeaX = useTransform(progress, [0, 1], [0, 46])

  /* The plume thins as the camera closes on the summit. */
  const driftOpacity = useTransform(progress, [0, 0.7], [1, 0.35])

  const still = (mv, v = 0) => (reduce ? v : mv)

  return (
    <motion.svg
      className={`h-full w-full ${className}`}
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      style={{ scale: reduce ? 1 : camScale, y: still(camY), transformOrigin: '61% 30%' }}
    >
      <AtmosphereDefs id={id} />

      {/*
        NARROW FRAMING.

        Two separate problems on a phone, both solved by one transform.

        HORIZONTAL: `slice` crops hard and `xMid` centres on x=800, while the
        summit sits at x=1006 — which pushed the peak toward the right edge.

        VERTICAL, and the serious one: at full height the summit landed at
        ~200px down, exactly where the headline sets, so "Know your position."
        ran straight through the white summit cap and became unreadable. On a
        narrow screen there is no room to put type BESIDE the mountain, so the
        mountain has to move below it. Dropping the scene ~200 units puts clear
        sky behind the whole headline and the peak just under it.
      */}
      <g transform={narrow ? 'translate(-150 208) scale(0.9)' : undefined}>
        <motion.g style={{ y: still(skyY) }}>
          <Sky id={id} />
        </motion.g>

        <motion.g style={{ y: still(rangeY) }}>
          <FarRanges />
        </motion.g>
        <Haze id={id} from={470} amount={0.9} />

        {/* Cloud between the distant ranges and the massif — this is the layer
            that establishes there is AIR in the gap, not just stacked shapes. */}
        <motion.g style={{ x: still(cloudHighX), y: still(cloudHighY) }}>
          <CloudBank id={id} cx={430} cy={556} scale={1.15} opacity="var(--cloud-opacity)" />
          <CloudBank id={id} cx={1290} cy={520} scale={0.8} opacity="var(--cloud-opacity)" />
        </motion.g>

        <motion.g style={{ y: still(lhotseY) }}>
          <Lhotse id={id} />
        </motion.g>
        <Haze id={id} from={250} amount={0.34} />

        <motion.g style={{ y: still(everestY) }}>
          <EverestMassif id={id} />
        </motion.g>

        <motion.g style={{ opacity: reduce ? 1 : driftOpacity }}>
          <Spindrift id={id} />
        </motion.g>

        {/* Cloud crossing the FACE. Painted after Everest and before Nuptse, so
            it is unambiguously between the two — the single cheapest cue that
            the massif has kilometres of depth in it. */}
        <motion.g
          style={{
            x: still(cloudMidX),
            y: still(cloudMidY),
            opacity: reduce ? 0.6 : cloudMidOpacity,
          }}
        >
          <CloudBank id={id} cx={880} cy={636} scale={1.5} opacity="var(--cloud-opacity)" />
        </motion.g>

        {/* NO haze sheet here. The cloud sea below already separates the massif
            from the wall, and a translucent grey rect over the same gap on top
            of it just desaturated the mountain's lower half into mud. */}

        {/* THE CLOUD SEA — between the massif and the wall, and the reason the
            peak reads as standing above a valley rather than sitting on one.
            Its own opacity, not the ambient cloud value: this is a defined
            layer in the composition and has to hold an edge. */}
        <motion.g style={{ x: still(cloudSeaX), y: still(cloudSeaY) }}>
          <CloudSea id={id} y={664} opacity={0.62} />
        </motion.g>

        <motion.g style={{ y: still(nuptseY) }}>
          <Nuptse id={id} />
        </motion.g>

        <motion.g style={{ y: still(foreY) }}>
          <BaseFade id={id} />
        </motion.g>
      </g>
    </motion.svg>
  )
}

/**
 * Viewport-width flag for the narrow framing above.
 *
 * A media query rather than a resize handler on width: `matchMedia` fires only
 * when the breakpoint is actually crossed, where a resize listener fires on
 * every pixel of a window drag and would re-render the scene continuously.
 */
export function useNarrowScene() {
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 780px)')
    const apply = () => setNarrow(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  return narrow
}
