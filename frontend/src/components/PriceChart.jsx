import { useEffect, useRef } from 'react'
import { createChart, ColorType } from 'lightweight-charts'

import { alpha, useThemeTokens } from '../hooks/useThemeTokens'

/**
 * lightweight-charts wrapper with a candlestick/line toggle.
 *
 * The library requires strictly ascending, unique timestamps in seconds, so
 * candles are converted and de-duplicated before they reach the series.
 */
function toSeconds(iso) {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000)
}

function normalize(candles) {
  const seen = new Set()
  const rows = []

  for (const candle of candles) {
    const time = toSeconds(candle.time)
    if (time === null || seen.has(time)) continue
    seen.add(time)
    rows.push({ ...candle, time })
  }
  return rows.sort((a, b) => a.time - b.time)
}

export function PriceChart({ candles = [], type = 'candlestick', height = 380 }) {
  const tokens = useThemeTokens()
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)

  // Create the chart once; recreating it on every data change causes flicker.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const chart = createChart(container, {
      autoSize: true,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: tokens.textSecondary,
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: tokens.border },
        horzLines: { color: tokens.border },
      },
      rightPriceScale: { borderColor: tokens.border },
      timeScale: {
        borderColor: tokens.border,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1,
        vertLine: { color: alpha(tokens.accent, 0.4), width: 1, style: 2, labelBackgroundColor: tokens.accent },
        horzLine: { color: alpha(tokens.accent, 0.4), width: 1, style: 2, labelBackgroundColor: tokens.accent },
      },
      handleScale: { axisPressedMouseMove: { price: false } },
    })

    chartRef.current = chart
    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [height, tokens])

  // Swap the series whenever the chart type changes.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current)
      seriesRef.current = null
    }

    seriesRef.current =
      type === 'candlestick'
        ? chart.addCandlestickSeries({
            upColor: tokens.up,
            downColor: tokens.down,
            borderUpColor: tokens.up,
            borderDownColor: tokens.down,
            wickUpColor: alpha(tokens.up, 0.6),
            wickDownColor: alpha(tokens.down, 0.6),
          })
        : chart.addAreaSeries({
            lineColor: tokens.accent,
            lineWidth: 2,
            topColor: alpha(tokens.accent, 0.28),
            bottomColor: alpha(tokens.accent, 0),
            crosshairMarkerBorderColor: tokens.accent,
            crosshairMarkerBackgroundColor: tokens.base,
          })
  }, [type, tokens])

  // Push data on every change of candles or type.
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    const rows = normalize(candles)
    series.setData(
      type === 'candlestick'
        ? rows.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
        : rows.map(({ time, close }) => ({ time, value: close })),
    )
    chartRef.current?.timeScale().fitContent()
  }, [candles, type, tokens])

  return <div ref={containerRef} style={{ height }} className="w-full" />
}
