"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@astreex/ui/lib/utils"

/**
 * `usePressDepth` — vendored from interior.dev (MIT, ddoemonn/interior), a
 * headless micro-interaction hook that owns the "half-second after a click"
 * for a button: pointer-tracked press with 3D tilt toward the cursor,
 * keyboard parity (Space/Enter), abandoned-gesture handling (drag off + release
 * cancels, blur/visibilitychange reset), and a `prefers-reduced-motion` opt-out
 * (consumed by the styled component below). Reskinned to Astryx tokens here.
 * Source: https://github.com/ddoemonn/interior  (components/interior/press-depth.tsx)
 */

const PRESS = {
  type: "spring",
  stiffness: 520,
  damping: 34,
  mass: 0.45,
} as const

type PressOrigin = { x: number; y: number }

type UsePressDepthResult = {
  pressed: boolean
  origin: PressOrigin | null
  ref: (node: HTMLElement | null) => void
  bind: {
    onPointerDown: (event: React.PointerEvent) => void
    onKeyDown: (event: React.KeyboardEvent) => void
    onKeyUp: (event: React.KeyboardEvent) => void
    onBlur: () => void
  }
}

function usePressDepth(disabled = false): UsePressDepthResult {
  const [pressed, setPressed] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [origin, setOrigin] = useState<PressOrigin | null>(null)

  const node = useRef<HTMLElement | null>(null)
  const pointer = useRef<number | null>(null)
  const down = useRef(false)

  const setDown = useCallback((next: boolean) => {
    if (down.current === next) return
    down.current = next
    setPressed(next)
  }, [])

  const stop = useCallback(() => {
    pointer.current = null
    setTracking(false)
    setOrigin(null)
    setDown(false)
  }, [setDown])

  useEffect(() => {
    if (!tracking) return
    const contains = (event: PointerEvent) => {
      const el = node.current
      if (!el) return false
      const r = el.getBoundingClientRect()
      return (
        event.clientX >= r.left &&
        event.clientX <= r.right &&
        event.clientY >= r.top &&
        event.clientY <= r.bottom
      )
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer.current) return
      setDown(contains(event))
    }
    const lift = (event: PointerEvent) => {
      if (event.pointerId !== pointer.current) return
      stop()
    }
    const bail = () => stop()
    const hidden = () => {
      if (document.hidden) stop()
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", lift)
    window.addEventListener("pointercancel", lift)
    window.addEventListener("blur", bail)
    document.addEventListener("visibilitychange", hidden)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", lift)
      window.removeEventListener("pointercancel", lift)
      window.removeEventListener("blur", bail)
      document.removeEventListener("visibilitychange", hidden)
    }
  }, [tracking, setDown, stop])

  const ref = useCallback((next: HTMLElement | null) => {
    node.current = next
  }, [])

  const bind = {
    onPointerDown: (event: React.PointerEvent) => {
      if (disabled) return
      if (event.pointerType === "mouse" && event.button !== 0) return
      const r = event.currentTarget.getBoundingClientRect()
      setOrigin({
        x: Math.max(
          -1,
          Math.min(1, ((event.clientX - r.left) / r.width) * 2 - 1),
        ),
        y: Math.max(
          -1,
          Math.min(1, ((event.clientY - r.top) / r.height) * 2 - 1),
        ),
      })
      pointer.current = event.pointerId
      setTracking(true)
      setDown(true)
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (disabled || event.repeat) return
      if (event.key === " " || event.key === "Enter") setDown(true)
    },
    onKeyUp: (event: React.KeyboardEvent) => {
      if (
        event.key === " " ||
        event.key === "Enter" ||
        event.key === "Escape"
      ) {
        setDown(false)
      }
    },
    onBlur: () => stop(),
  }

  return { pressed, origin, ref, bind }
}

const DEPTH = 4
const TILT = 7

/**
 * Primary call-to-action with interior.dev tactile press depth and a subtle 3D
 * tilt toward the pointer. Styled against the Astryx amber-accent primary tokens.
 * Renders a real link (so middle-click / open-in-new-tab still works). Reduced
 * motion disables the tilt + spring. For the rest of the product, the shared
 * shadcn-style <Button> continues to back onto the same Astryx tokens.
 */
export function PressButton({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  const { pressed, origin, ref, bind } = usePressDepth(false)
  const lean = pressed && origin && !reduced ? origin : null

  return (
    <Link
      ref={ref}
      href={href}
      data-pressed={pressed ? "" : undefined}
      style={{
        paddingBottom: DEPTH,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
      className={cn(
        "group relative inline-flex items-stretch rounded-lg align-middle outline-none select-none",
        className,
      )}
      {...bind}
    >
      {/* tactile depth base */}
      <span
        aria-hidden
        style={{ top: DEPTH }}
        className="absolute inset-x-0 bottom-0 rounded-lg bg-black/10"
      />
      <motion.span
        initial={false}
        animate={{
          y: pressed ? DEPTH : 0,
          rotateX: lean ? -lean.y * TILT : 0,
          rotateY: lean ? lean.x * TILT : 0,
        }}
        transition={reduced ? { duration: 0 } : PRESS}
        style={{ transformPerspective: 340 }}
        className="bg-primary text-primary-foreground group-focus-visible:ring-ring group-focus-visible:ring-offset-background relative inline-flex items-center justify-center gap-2 rounded-lg border border-transparent px-[22px] py-3.5 text-[15px] leading-none font-medium group-focus-visible:ring-2 group-focus-visible:ring-offset-2"
      >
        {/* top inner sheen */}
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: pressed ? 0 : 1 }}
          transition={reduced ? { duration: 0 } : PRESS}
          className="pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_1.5px_0_rgba(255,255,255,0.25),inset_0_-1px_0_rgba(0,0,0,0.08)]"
        />
        {children}
      </motion.span>
    </Link>
  )
}
