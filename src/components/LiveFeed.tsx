/**
 * LiveFeed — a scrolling ticker showing recent simulated agent payments.
 * Events are generated automatically to simulate a live marketplace.
 * Real events (from ServiceCard simulations) are injected via LiveFeedContext.
 */
import React, { useEffect, useRef, useState, createContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap } from 'lucide-react'

// ── Context so ServiceCard can push real events ─────────────
interface FeedEvent {
  id: string
  service: string
  price: string
  agent: string
  ts: number
}

interface LiveFeedCtx {
  push: (e: Omit<FeedEvent, 'id' | 'ts'>) => void
}
export const LiveFeedContext = createContext<LiveFeedCtx>({ push: () => {} })

// ── Fake event generator ────────────────────────────────────
const FAKE_SERVICES = [
  { name: 'Text Summarizer',     price: '0.001' },
  { name: 'Neural Translator',   price: '0.005' },
  { name: 'Data Analyst',        price: '0.010' },
  { name: 'Wallet Risk Score',   price: '0.050' },
  { name: 'Contract Explainer',  price: '0.020' },
  { name: 'Transaction Decoder', price: '0.005' },
  { name: 'USDC Price Oracle',   price: '0.001' },
  { name: 'Crypto News Feed',    price: '0.002' },
  { name: 'Sentiment Analyzer',  price: '0.003' },
  { name: 'ENS Resolver',        price: '0.002' },
  { name: 'Gas Estimator',       price: '0.001' },
]

function fakeAgent() {
  const prefix = ['0x4f', '0xa1', '0x7c', '0x3e', '0x9b', '0x2d', '0x5a', '0x8f']
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  return prefix[Math.floor(Math.random() * prefix.length)] + hex() + '…' + hex() + hex()
}

function makeEvent(): FeedEvent {
  const svc = FAKE_SERVICES[Math.floor(Math.random() * FAKE_SERVICES.length)]
  return {
    id: Math.random().toString(36).slice(2),
    service: svc.name,
    price: svc.price,
    agent: fakeAgent(),
    ts: Date.now(),
  }
}

// ── Component ────────────────────────────────────────────────
const MAX = 18

export function LiveFeed({ children }: { children?: React.ReactNode }) {
  const [events, setEvents] = useState<FeedEvent[]>(() =>
    Array.from({ length: 6 }, makeEvent),
  )

  // Auto-generate a fake event every 2-4 s
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const delay = 2000 + Math.random() * 2000
      timer = setTimeout(() => {
        setEvents(prev => [makeEvent(), ...prev].slice(0, MAX))
        schedule()
      }, delay)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])

  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to top on new event
  const latestId = events[0]?.id
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [latestId])

  // Exposed push function for real events
  const pushReal = (e: Omit<FeedEvent, 'id' | 'ts'>) => {
    setEvents(prev => [
      { ...e, id: Math.random().toString(36).slice(2), ts: Date.now() },
      ...prev,
    ].slice(0, MAX))
  }

  return (
    <LiveFeedContext.Provider value={{ push: pushReal }}>
      <section className="mb-12">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="display text-lg font-semibold text-[var(--ink)] flex items-center gap-2">
              Live Activity
              <span className="flex items-center gap-1 text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-[var(--success)]/15 text-[var(--success)] border border-[var(--success)]/20">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                LIVE
              </span>
            </h2>
            <p className="text-xs text-[var(--subtle)] mt-0.5">
              Recent agent payments across the marketplace
            </p>
          </div>
          <span className="mono text-[11px] text-[var(--subtle)]">{events.length} events</span>
        </div>

        <div
          ref={scrollRef}
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
        >
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 border-b border-[var(--border)] text-[10px] font-semibold uppercase tracking-widest text-[var(--subtle)]">
            <span>Service</span>
            <span className="text-right">Agent</span>
            <span className="text-right w-16">USDC</span>
          </div>

          {/* Event rows */}
          <div className="divide-y divide-[var(--border)] max-h-56 overflow-y-auto">
            <AnimatePresence initial={false}>
              {events.map((ev) => (
                <motion.div
                  key={ev.id}
                  initial={{ opacity: 0, y: -8, backgroundColor: 'rgba(172,198,233,0.12)' }}
                  animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(172,198,233,0)' }}
                  transition={{ duration: 0.4 }}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 items-center"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap size={10} className="text-[var(--accent)] shrink-0" />
                    <span className="text-xs text-[var(--ink)] truncate">{ev.service}</span>
                  </div>
                  <span className="mono text-[10px] text-[var(--subtle)]">{ev.agent}</span>
                  <div className="flex items-center justify-end gap-0.5 w-16">
                    <span className="mono text-[11px] font-semibold text-[var(--success)]">
                      {ev.price}
                    </span>
                    <span className="text-[9px] text-[var(--subtle)]"> USDC</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </section>
      {children}
    </LiveFeedContext.Provider>
  )
}
