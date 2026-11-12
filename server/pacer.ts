/**
 * Smooths calls to Circle's settlement service.
 *
 * Circle's service sits behind a web firewall that answered a sustained burst with a block page. A token bucket lets
 * short bursts through at full speed, then holds the rest in a bounded queue and releases them at a steady pace.
 * A request that waits too long, or arrives when the queue is full, is turned away with "retry shortly" before any
 * call is made, so nothing is charged.
 */

export interface PacerOptions {
  /** Steady calls per second once the burst allowance is used up */
  ratePerSecond: number
  /** Calls that may go out back to back */
  burst: number
  /** Longest a request may wait in the queue */
  maxWaitMs: number
  /** Longest queue before new arrivals are refused at once */
  maxQueue: number
}

interface Waiter {
  resolve: (granted: boolean) => void
  timer: ReturnType<typeof setTimeout>
}

export interface Pacer {
  /** Resolves true when a call may go out now, false when the request should be turned away. */
  take: () => Promise<boolean>
  /** Halve the pace for a while. Called when Circle's edge answers HTTP 429. */
  slowDown: (ms: number) => void
  stats: () => { queued: number; tokens: number; granted: number; refused: number; slowedForSeconds: number }
}

export function createPacer(opts: PacerOptions): Pacer {
  let tokens = opts.burst
  let last = Date.now()
  let granted = 0
  let refused = 0
  let wake: ReturnType<typeof setTimeout> | undefined
  let slowUntil = 0
  const rate = () => (Date.now() < slowUntil ? opts.ratePerSecond / 2 : opts.ratePerSecond)
  const queue: Waiter[] = []

  const refill = () => {
    const now = Date.now()
    tokens = Math.min(opts.burst, tokens + ((now - last) / 1000) * rate())
    last = now
  }

  const drain = () => {
    wake = undefined
    refill()
    while (queue.length > 0 && tokens >= 1) {
      tokens -= 1
      const next = queue.shift() as Waiter
      clearTimeout(next.timer)
      granted += 1
      next.resolve(true)
    }
    if (queue.length > 0) {
      const waitMs = Math.max(5, Math.ceil(((1 - tokens) / rate()) * 1000))
      wake = setTimeout(drain, waitMs)
    }
  }

  return {
    slowDown(ms: number) {
      slowUntil = Math.max(slowUntil, Date.now() + ms)
    },
    take() {
      refill()
      if (queue.length === 0 && tokens >= 1) {
        tokens -= 1
        granted += 1
        return Promise.resolve(true)
      }
      if (queue.length >= opts.maxQueue) {
        refused += 1
        return Promise.resolve(false)
      }
      return new Promise<boolean>(resolve => {
        const timer = setTimeout(() => {
          const i = queue.findIndex(w => w.timer === timer)
          if (i >= 0) queue.splice(i, 1)
          refused += 1
          resolve(false)
        }, opts.maxWaitMs)
        queue.push({ resolve, timer })
        if (wake === undefined) wake = setTimeout(drain, 5)
      })
    },
    stats: () => ({ queued: queue.length, tokens: Math.floor(tokens), granted, refused, slowedForSeconds: Math.max(0, Math.ceil((slowUntil - Date.now()) / 1000)) }),
  }
}
