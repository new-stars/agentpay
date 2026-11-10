/**
 * LiveFeed: a ticker of SIMULATED sample activity (labelled as a demo in every language).
 * Calls the visitor makes with "Simulate" are pushed in via LiveFeedContext and shown at the top.
 */
import React, { useEffect, useRef, useState, createContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap } from 'lucide-react'
import { useLang } from '../LangContext'
import { extras, fmt } from '../locales'

// Events store the service id, so the name is rendered in the language active at display time.
interface FeedEvent {
  id: string
  service: string
  price: string
  /** Sample address, or '@you' for a call the visitor made. */
  agent: string
}

interface LiveFeedCtx {
  push: (e: Omit<FeedEvent, 'id'>) => void
}
export const LiveFeedContext = createContext<LiveFeedCtx>({ push: () => {} })

const SAMPLE_SERVICES = [
  { id: 'summarize', name: 'Text Summarizer', price: '0.001' },
  { id: 'translate', name: 'Neural Translator', price: '0.005' },
  { id: 'analyze', name: 'Data Analyst', price: '0.010' },
  { id: 'risk', name: 'Wallet Risk Score', price: '0.050' },
  { id: 'explain-contract', name: 'Contract Explainer', price: '0.020' },
  { id: 'decode-tx', name: 'Transaction Decoder', price: '0.005' },
  { id: 'price-oracle', name: 'USDC Price Oracle', price: '0.001' },
  { id: 'news-feed', name: 'Crypto News Feed', price: '0.002' },
  { id: 'sentiment', name: 'Sentiment Analyzer', price: '0.003' },
  { id: 'ens-lookup', name: 'ENS / Address Resolver', price: '0.002' },
  { id: 'gas-estimator', name: 'Gas Estimator', price: '0.001' },
]

const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
const sampleAgent = () => `0x${hex()}${hex()}…${hex()}${hex()}`
const newId = () => Math.random().toString(36).slice(2)

function makeEvent(): FeedEvent {
  const svc = SAMPLE_SERVICES[Math.floor(Math.random() * SAMPLE_SERVICES.length)]
  return { id: newId(), service: svc.id, price: svc.price, agent: sampleAgent() }
}

const MAX = 18

export function LiveFeed({ children }: { children?: React.ReactNode }) {
  const { t, lang } = useLang()
  const [events, setEvents] = useState<FeedEvent[]>(() => Array.from({ length: 6 }, makeEvent))
  const scrollRef = useRef<HTMLDivElement>(null)

  // Add a sample event every 2 to 4 seconds.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        setEvents(prev => [makeEvent(), ...prev].slice(0, MAX))
        schedule()
      }, 2000 + Math.random() * 2000)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])

  const latestId = events[0]?.id
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [latestId])

  const pushReal = (e: Omit<FeedEvent, 'id'>) => {
    setEvents(prev => [{ ...e, id: newId() }, ...prev].slice(0, MAX))
  }

  const nameOf = (id: string) =>
    extras[lang].services[id]?.name ?? SAMPLE_SERVICES.find(s => s.id === id)?.name ?? id

  return (
    <LiveFeedContext.Provider value={{ push: pushReal }}>
      <section className="mb-12">
        <div className="flex items-center justify-between mb-3 gap-3">
          <div>
            <h2 className="display text-lg font-semibold text-[var(--ink)] flex items-center gap-2">
              {t.feedTitle}
              <span className="flex items-center gap-1 text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-[var(--surface-strong)] text-[var(--subtle)] border border-[var(--border)]">
                {t.feedLive}
              </span>
            </h2>
            <p className="text-xs text-[var(--subtle)] mt-0.5">{t.feedSubtitle}</p>
          </div>
          <span className="mono text-[11px] text-[var(--subtle)] tabular-nums shrink-0">{fmt(t.feedEvents, { n: events.length })}</span>
        </div>

        <div ref={scrollRef} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 border-b border-[var(--border)] text-[10px] font-semibold uppercase tracking-widest text-[var(--subtle)]">
            <span>{t.feedColService}</span>
            <span className="text-end">{t.feedColAgent}</span>
            <span className="text-end w-16">USDC</span>
          </div>

          <div className="divide-y divide-[var(--border)] max-h-56 overflow-y-auto">
            <AnimatePresence initial={false}>
              {events.map(ev => (
                <motion.div
                  key={ev.id}
                  initial={{ opacity: 0, y: -8, backgroundColor: 'rgba(172,198,233,0.12)' }}
                  animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(172,198,233,0)' }}
                  transition={{ duration: 0.4 }}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 items-center"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap size={10} className="text-[var(--accent)] shrink-0" />
                    <span className="text-xs text-[var(--ink)] truncate">{nameOf(ev.service)}</span>
                  </div>
                  <span className={`mono text-[10px] ${ev.agent === '@you' ? 'text-[var(--accent)]' : 'text-[var(--subtle)]'}`}>
                    {ev.agent === '@you' ? t.feedYou : ev.agent}
                  </span>
                  <div className="flex items-center justify-end gap-0.5 w-16">
                    <span className="mono text-[11px] font-semibold text-[var(--success)] tabular-nums">{ev.price}</span>
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
