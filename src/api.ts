import { useEffect, useState } from 'react'

/**
 * Where the backend lives. Same-origin `/api` by default (the dev proxy, or a host that serves both).
 * A page hosted as plain static files has no backend at all; set VITE_API_BASE to a backend hosted elsewhere
 * (an https URL, or a path). The value is public: it ends up in the page.
 */
const raw = (import.meta.env.VITE_API_BASE as string | undefined)?.trim()
export const API_BASE = (raw && /^(https?:\/\/|\/)/.test(raw) ? raw : '/api').replace(/\/$/, '')

export type BackendState = 'checking' | 'online' | 'offline'

let probe: Promise<boolean> | undefined

/** One cached check per page load. Only a JSON "ok" from the health route counts: a 404 page or index.html does not. */
export function checkBackend(): Promise<boolean> {
  probe ??= fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) })
    .then(async (res) => {
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return false
      return ((await res.json()) as { status?: string }).status === 'ok'
    })
    .catch(() => false)
  return probe
}

export function useBackendStatus(): BackendState {
  const [state, setState] = useState<BackendState>('checking')
  useEffect(() => {
    let cancelled = false
    void checkBackend().then((ok) => { if (!cancelled) setState(ok ? 'online' : 'offline') })
    return () => { cancelled = true }
  }, [])
  return state
}
