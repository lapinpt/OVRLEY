/**
 * Provides reusable progress UI primitives for the application.
 *
 * The indicator glides toward the target `value` via a requestAnimationFrame
 * tween rather than a CSS transition. The previous CSS
 * `transition-transform duration-300` produced visible "move → settle → idle
 * → move" stair-stepping because CSS transitions retrigger on every new value
 * and don't know when the next value will arrive.
 *
 * Backend progress now arrives as a stream of `render-progress` events at the
 * true frame-production rate (per in-order frame-front advancement) rather than
 * a fixed 500 ms poll. The tween duration is therefore derived from the
 * observed inter-event gap, capped to a small range — close to the next
 * expected event, so the bar reaches each streamed value just as the next one
 * arrives and produces continuous motion at the true rate of progress:
 *
 * - Fast renders (events every ~16 ms): tween caps to the floor (one frame),
 *   effectively snapping — the bar already moves continuously because events
 *   arrive continuously.
 * - Slow renders (events every ~1000 ms): tween extends toward the gap, so
 *   the bar visibly eases toward the next streamed value instead of jumping
 *   once per second.
 * - Backward moves (new render started) and moves to either endpoint
 *   (0 % at start, 100 % at completion) always snap — tweens near the end of
 *   a render would make the bar visibly lag behind the "Finalizing Video"
 *   state, and backward tweens would obscure a fresh render's reset.
 */

import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'

import { cn } from '@/lib/utils'

/**
 * Minimum tween duration — one animation frame. Below this, the bar snaps
 * because inter-event gaps are smaller than a frame anyway.
 */
const TWEEN_FLOOR_MS = 16

/**
 * Maximum tween duration — prevents the bar from creeping too slowly if a
 * single event is delayed (e.g. a long reorder-window stall). The next event
 * will arrive sooner than this in practice.
 */
const TWEEN_CEIL_MS = 800

/** Multiplier applied to the observed inter-event gap to derive the tween
 * duration. 1.0 means "reach the new value just as the next event arrives". */
const TWEEN_GAP_RATIO = 1.0

/** easeOutCubic — fast start, gentle finish, no overshoot. */
function easeOutCubic(progress) {
  return 1 - Math.pow(1 - progress, 3)
}

/**
 * Renders a determinate progress bar that glides toward `value` via rAF.
 *
 * @param {object} props - Component props.
 * @param {string} [props.className] - Additional class names merged onto the root.
 * @param {number} props.value - Completion percentage in the range [0, 100].
 * @returns {JSX.Element} Rendered progress bar.
 */
function Progress({ className, value, ...props }) {
  const target = Number.isFinite(value) && value > 0 ? Math.min(value, 100) : 0

  const [display, setDisplay] = React.useState(target)
  const displayRef = React.useRef(target)
  const fromRef = React.useRef(target)
  const rafRef = React.useRef(null)
  const startRef = React.useRef(null)
  const lastTargetAtRef = React.useRef(null)
  const tweenMsRef = React.useRef(TWEEN_FLOOR_MS)

  React.useEffect(() => {
    const now = performance.now()

    // Snap on backward moves (new render started), and at either endpoint
    // (no tween at start or completion — the bar must not lag the status text).
    if (target <= displayRef.current || target >= 100 || target === 0) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      displayRef.current = target
      fromRef.current = target
      startRef.current = null
      lastTargetAtRef.current = now
      tweenMsRef.current = TWEEN_FLOOR_MS
      setDisplay(target)
      return
    }

    // Derive the tween duration from the observed inter-event gap so motion
    // matches the true rate of progress. First forward move after a reset has
    // no baseline gap, so fall back to the ceiling — short enough to feel
    // responsive, long enough to smooth the first step.
    if (lastTargetAtRef.current != null) {
      const gap = now - lastTargetAtRef.current
      tweenMsRef.current = Math.max(TWEEN_FLOOR_MS, Math.min(gap * TWEEN_GAP_RATIO, TWEEN_CEIL_MS))
    } else {
      tweenMsRef.current = TWEEN_CEIL_MS
    }
    lastTargetAtRef.current = now

    // Forward move: tween from the live displayed value to the new target.
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
    }
    fromRef.current = displayRef.current
    startRef.current = null

    const animate = (frameNow) => {
      if (startRef.current == null) startRef.current = frameNow
      const progress = Math.min((frameNow - startRef.current) / tweenMsRef.current, 1)
      const eased = easeOutCubic(progress)
      const next = fromRef.current + (target - fromRef.current) * eased
      displayRef.current = next
      setDisplay(next)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        rafRef.current = null
        displayRef.current = target
        setDisplay(target)
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [target])

  // Clean up any in-flight rAF on unmount.
  React.useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn('bg-primary/20 relative h-2 w-full overflow-hidden rounded-full', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1"
        style={{ transform: `translateX(-${100 - (display || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
