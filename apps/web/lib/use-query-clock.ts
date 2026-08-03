"use client"

import { useEffect, useState } from "react"

const QUERY_CLOCK_INTERVAL_MS = 30_000

export function useQueryClock(): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(
      () => setNow(Date.now()),
      QUERY_CLOCK_INTERVAL_MS,
    )
    return () => window.clearInterval(interval)
  }, [])

  return now
}
