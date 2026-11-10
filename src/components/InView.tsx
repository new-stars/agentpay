import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Renders its children only once the placeholder is close to the viewport.
 * Used for sections far below the fold so their code and their network calls wait until needed.
 */
export function InView({ children, minHeight = 320, rootMargin = '500px' }: {
  children: ReactNode
  minHeight?: number
  rootMargin?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setSeen(true)
        io.disconnect()
      }
    }, { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [seen, rootMargin])

  return <div ref={ref} style={seen ? undefined : { minHeight }}>{seen ? children : null}</div>
}
