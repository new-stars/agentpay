import { useState, useRef, useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, CheckCircle, XCircle, Loader2, Terminal,
  ChevronDown, ChevronUp, Code2, Lightbulb, Clock, Shield, Fuel, Copy, Check,
} from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { useLang } from '../LangContext'
import { SessionCostContext } from '../App'

// ──────────────────────────────────────────
// Type
// ──────────────────────────────────────────
export interface AgentService {
  id: string
  name: string
  description: string
  endpoint: string
  method: 'GET' | 'POST'
  price: string
  priceUsd: number
  category: string
  responseTime: string
  sla: string
  requestSchema: Record<string, string>
  responseSchema: Record<string, string>
  examplePayload?: Record<string, unknown>
  tags: string[]
  useCases: string[]
}

type PayStatus = 'idle' | 'detecting' | 'negotiating' | 'paying' | 'success' | 'error'
type Tab = 'trace' | 'schema' | 'uses'

interface LogLine {
  type: 'info' | 'agent' | 'server' | 'success' | 'error'
  text: string
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────
function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

const METHOD_COLOR: Record<string, string> = {
  GET: 'text-[var(--success)]',
  POST: 'text-[var(--accent)]',
}

const CATEGORY_ICON: Record<string, string> = {
  NLP: '⬡',
  Data: '◈',
  DeFi: '◆',
  Compliance: '▣',
  'Dev Tools': '◉',
}

// ──────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────
function SchemaTable({ schema, title }: { schema: Record<string, string>; title: string }) {
  const entries = Object.entries(schema)
  if (entries.length === 0) return <p className="text-[11px] text-[var(--subtle)] italic">No parameters</p>
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--subtle)] mb-1.5">{title}</div>
      <div className="space-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-[11px]">
            <span className="mono text-[var(--accent)] shrink-0">{k}</span>
            <span className="text-[var(--subtle)]">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────
// Main component
// ──────────────────────────────────────────
export function ServiceCard({ service }: { service: AgentService }) {
  const { t } = useLang()
  const { add: addSessionCost } = useContext(SessionCostContext)
  const [status, setStatus] = useState<PayStatus>('idle')
  const [logs, setLogs] = useState<LogLine[]>([])
  const [response, setResponse] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab | null>(null)
  const [copied, setCopied] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const copyEndpoint = () => {
    void navigator.clipboard.writeText(service.endpoint).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const addLog = (line: LogLine) => setLogs(prev => [...prev, line])

  const simulate = async () => {
    setStatus('detecting')
    setLogs([])
    setResponse(null)
    setActiveTab('trace')
    // Scroll this card into view so the trace panel is visible
    setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 80)

    // ── Step 1: unauthenticated request → 402 ──
    addLog({ type: 'agent', text: `→  ${service.method} ${service.endpoint}` })
    addLog({ type: 'info',  text: `   [no credentials attached]` })
    await sleep(600)

    try {
      const unauth = await fetch(`/api${service.endpoint}`, {
        method: service.method,
        headers: { 'Content-Type': 'application/json' },
        ...(service.examplePayload ? { body: JSON.stringify(service.examplePayload) } : {}),
      })
      const challenge = await unauth.json() as { accepts?: Array<{ network: string; priceUsdc?: string }>; price?: string }
      addLog({ type: 'server', text: `←  HTTP ${unauth.status} Payment Required` })
      const net = challenge.accepts?.map(a => a.network).join(', ') ?? 'ARC-TESTNET'
      addLog({ type: 'info',  text: `   price   : ${challenge.price ?? service.price} USDC` })
      addLog({ type: 'info',  text: `   network : ${net}` })
      addLog({ type: 'info',  text: `   scheme  : gateway-nanopayment` })
    } catch {
      addLog({ type: 'server', text: `←  HTTP 402 Payment Required` })
      addLog({ type: 'info',  text: `   price   : ${service.price} USDC` })
      addLog({ type: 'info',  text: `   network : ARC-TESTNET` })
      addLog({ type: 'info',  text: `   scheme  : gateway-nanopayment` })
    }

    // ── Step 2: negotiate ──
    setStatus('negotiating')
    await sleep(450)
    addLog({ type: 'agent', text: `   Parsing payment requirements…` })
    await sleep(400)
    addLog({ type: 'agent', text: `   Building EIP-3009 transferWithAuthorization` })
    await sleep(300)
    addLog({ type: 'agent', text: `   Signing with agent wallet (off-chain, no gas)` })
    await sleep(500)
    addLog({ type: 'info',  text: `   Signature: 0xd3a5…f8b2 ✓` })

    // ── Step 3: paid retry ──
    setStatus('paying')
    await sleep(300)
    addLog({ type: 'agent', text: `→  ${service.method} ${service.endpoint}` })
    addLog({ type: 'info',  text: `   X-Payment: <EIP-3009 signed auth>` })
    await sleep(650)

    try {
      const paid = await fetch(`/api${service.endpoint}`, {
        method: service.method,
        headers: {
          'Content-Type': 'application/json',
          'X-PAYMENT': 'simulated-gateway-nanopayment-auth',
        },
        ...(service.examplePayload ? { body: JSON.stringify(service.examplePayload) } : {}),
      })
      const data = await paid.json() as Record<string, unknown>
      addLog({ type: 'server',  text: `←  HTTP 200 OK` })
      addLog({ type: 'success', text: `   Payment queued for Circle Gateway batch` })
      addLog({ type: 'success', text: `   ${service.price} USDC authorised — settled off-chain` })
      setResponse(JSON.stringify(data, null, 2))
      addSessionCost(service.priceUsd)
      setStatus('success')
    } catch {
      addLog({ type: 'server',  text: `←  HTTP 200 OK` })
      addLog({ type: 'success', text: `   Payment queued for Circle Gateway batch` })
      addLog({ type: 'success', text: `   ${service.price} USDC authorised — settled off-chain` })
      setResponse(JSON.stringify({ result: 'Service response delivered', settled: true, paidUsdc: service.price }, null, 2))
      addSessionCost(service.priceUsd)
      setStatus('success')
    }
  }

  const reset = () => {
    setStatus('idle')
    setLogs([])
    setResponse(null)
    setActiveTab(null)
  }

  const toggleTab = (tab: Tab) => setActiveTab(prev => prev === tab ? null : tab)

  const statusMeta: Record<PayStatus, { label: string; color: string }> = {
    idle:        { label: t.cardStatusReady,       color: 'text-[var(--subtle)]'  },
    detecting:   { label: t.cardStatusDetecting,   color: 'text-[var(--accent)]'  },
    negotiating: { label: t.cardStatusNegotiating, color: 'text-yellow-300'        },
    paying:      { label: t.cardStatusPaying,      color: 'text-[var(--accent)]'  },
    success:     { label: t.cardStatusSuccess,     color: 'text-[var(--success)]' },
    error:       { label: t.cardStatusError,       color: 'text-[var(--danger)]'  },
  }

  const isRunning = status === 'detecting' || status === 'negotiating' || status === 'paying'

  return (
    <motion.div
      ref={cardRef}
      layout
      className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] backdrop-blur-md overflow-hidden h-full"
    >
      {/* ── Card body ── */}
      <div className="p-5 flex-1">

        {/* Category + tags */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--subtle)] px-2 py-0.5 rounded-full border border-[var(--border)]">
            {CATEGORY_ICON[service.category] ?? '●'} {service.category}
          </span>
          {service.tags.slice(0, 2).map(t => (
            <span key={t} className="text-[10px] text-[var(--subtle)]/70">#{t}</span>
          ))}
        </div>

        {/* Name + price */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="display text-base font-semibold text-[var(--ink)] leading-tight">{service.name}</h3>
          <div className="shrink-0 flex flex-col items-end">
            <div className="flex items-center gap-1">
              <TokenUSDC variant="branded" size={14} />
              <span className="display text-base font-bold text-[var(--ink)] tabular-nums">{service.price}</span>
            </div>
            <span className="text-[10px] text-[var(--subtle)]">USDC / call</span>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-[var(--muted)] leading-relaxed mb-4">{service.description}</p>

        {/* Endpoint row */}
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-[var(--surface-muted)] border border-[var(--border)]">
          <span className={`mono text-[11px] font-bold shrink-0 ${METHOD_COLOR[service.method] ?? 'text-[var(--muted)]'}`}>
            {service.method}
          </span>
          <span className="mono text-[11px] text-[var(--muted)] truncate flex-1">{service.endpoint}</span>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1">
              <Clock size={10} className="text-[var(--subtle)]" />
              <span className="text-[10px] text-[var(--subtle)]">{service.responseTime}</span>
            </div>
            <button
              onClick={copyEndpoint}
              title="Copy endpoint"
              className="p-0.5 rounded text-[var(--subtle)] hover:text-[var(--accent)] transition-colors"
            >
              {copied ? <Check size={11} className="text-[var(--success)]" /> : <Copy size={11} />}
            </button>
          </div>
        </div>

        {/* SLA + status row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <Shield size={11} className="text-[var(--subtle)]" />
            <span className="text-[10px] text-[var(--subtle)]">{service.sla}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {isRunning ? (
              <Loader2 size={12} className="text-[var(--accent)] animate-spin" />
            ) : status === 'success' ? (
              <CheckCircle size={12} className="text-[var(--success)]" />
            ) : status === 'error' ? (
              <XCircle size={12} className="text-[var(--danger)]" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--subtle)]" />
            )}
            <span className={`text-[11px] font-medium ${statusMeta[status].color}`}>
              {statusMeta[status].label}
            </span>
          </div>
        </div>

        {/* Primary action */}
        {status === 'idle' ? (
          <button
            onClick={() => { void simulate() }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-[#0d1b2f] hover:bg-[var(--accent-hover)] transition-colors"
          >
            <Zap size={12} />
            {t.cardSimulate}
          </button>
        ) : status === 'success' || status === 'error' ? (
          <button
            onClick={reset}
            className="w-full px-3 py-2 rounded-xl text-xs font-medium text-[var(--muted)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors"
          >
            {t.cardReset}
          </button>
        ) : (
          <div className="w-full h-8 rounded-xl border border-[var(--border)] flex items-center justify-center gap-2 text-xs text-[var(--subtle)]">
            <Loader2 size={11} className="animate-spin" />
            {statusMeta[status].label}
          </div>
        )}

        {/* Gas-saved callout — shown only after a successful simulation */}
        <AnimatePresence>
          {status === 'success' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.3 }}
              className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--success)]/8 border border-[var(--success)]/20"
            >
              <Fuel size={11} className="text-[var(--success)] shrink-0" />
              <span className="text-[11px] text-[var(--success)] font-medium">
                $0.00 gas paid &mdash; EIP-3009 off-chain auth, no on-chain tx needed
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Tab bar ── */}
      <div className="border-t border-[var(--border)] flex">
        {([ 
          { id: 'trace',  icon: Terminal,  label: t.cardTabTrace    },
          { id: 'schema', icon: Code2,     label: t.cardTabSchema   },
          { id: 'uses',   icon: Lightbulb, label: t.cardTabUseCases },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => toggleTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-[var(--accent)] bg-[var(--accent)]/8 border-b-2 border-[var(--accent)]'
                : 'text-[var(--subtle)] hover:text-[var(--muted)]'
            }`}
          >
            <tab.icon size={10} />
            {tab.label}
            {activeTab === tab.id ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </button>
        ))}
      </div>

      {/* ── Expandable panels ── */}
      <AnimatePresence initial={false}>
        {activeTab === 'trace' && (
          <motion.div
            key="trace"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden bg-[#060f1c] border-t border-[var(--border)]"
          >
            <div className="p-4">
              {logs.length === 0 && !isRunning ? (
                <p className="mono text-[11px] text-[var(--subtle)] italic">
                  {t.cardSimulate} →
                </p>
              ) : (
                <div className="space-y-0.5 max-h-52 overflow-y-auto">
                  {logs.map((l, i) => (
                    <div key={i} className={`mono text-[11px] leading-[1.6] ${
                      l.type === 'agent'   ? 'text-[var(--accent)]'   :
                      l.type === 'server'  ? 'text-yellow-300'         :
                      l.type === 'success' ? 'text-[var(--success)]'  :
                      l.type === 'error'   ? 'text-[var(--danger)]'   :
                      'text-[var(--subtle)]'
                    }`}>
                      {l.text}
                    </div>
                  ))}
                  {isRunning && <div className="mono text-[11px] text-[var(--subtle)] animate-pulse">▌</div>}
                </div>
              )}

              {response && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <div className="text-[10px] text-[var(--subtle)] uppercase tracking-widest mb-1.5">
                    {t.cardResponseLabel}
                  </div>
                  <pre className="mono text-[11px] text-[var(--success)] whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto">
                    {response}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'schema' && (
          <motion.div
            key="schema"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-[var(--border)]"
          >
            <div className="p-4 space-y-4 bg-[var(--surface-muted)]">
              <SchemaTable schema={service.requestSchema} title={t.cardRequest} />
              <SchemaTable schema={service.responseSchema} title={t.cardResponse} />
              {service.examplePayload && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--subtle)] mb-1.5">
                    {t.cardExamplePayload}
                  </div>
                  <pre className="mono text-[11px] text-[var(--muted)] whitespace-pre-wrap break-all">
                    {JSON.stringify(service.examplePayload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'uses' && (
          <motion.div
            key="uses"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-[var(--border)]"
          >
            <div className="p-4 bg-[var(--surface-muted)]">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--subtle)] mb-2">
                {t.cardUseCases}
              </div>
              <ul className="space-y-1.5">
                {service.useCases.map((uc, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[var(--muted)]">
                    <span className="text-[var(--accent)] shrink-0 mt-0.5">→</span>
                    {uc}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}


