import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Zap, Key, RotateCcw, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { useLang } from '../LangContext'

const STEP_ICONS = [Bot, Zap, Key, RotateCcw, CheckCircle2]
const STEP_COLORS = [
  { color: 'text-[var(--accent)]',   bg: 'bg-[var(--accent)]/10',   border: 'border-[var(--accent)]/20'   },
  { color: 'text-yellow-300',        bg: 'bg-yellow-300/10',        border: 'border-yellow-300/20'        },
  { color: 'text-[var(--success)]',  bg: 'bg-[var(--success)]/10',  border: 'border-[var(--success)]/20'  },
  { color: 'text-[var(--accent)]',   bg: 'bg-[var(--accent)]/10',   border: 'border-[var(--accent)]/20'   },
  { color: 'text-[var(--success)]',  bg: 'bg-[var(--success)]/10',  border: 'border-[var(--success)]/20'  },
]
const STEP_CODES = [
  'POST /pay/summarize  →  (no auth headers)',
  '← 402  { price: "0.001", network: "ARC-TESTNET", scheme: "gateway-nanopayment" }',
  'signTypedData(transferWithAuthorization { to: seller, value: 1000, nonce, deadline })',
  'POST /pay/summarize  X-Payment: base64(signedAuth)  →  200 OK + payload',
  'Gateway.batchTransfer([auth1, auth2, …authN])  →  1 on-chain tx, N settlements',
]

export function HowItWorks() {
  const { t } = useLang()
  const [open, setOpen] = useState(false)

  const steps = [
    { num: '01', title: t.howStep1Title, body: t.howStep1Body },
    { num: '02', title: t.howStep2Title, body: t.howStep2Body },
    { num: '03', title: t.howStep3Title, body: t.howStep3Body },
    { num: '04', title: t.howStep4Title, body: t.howStep4Body },
    { num: '05', title: t.howStep5Title, body: t.howStep5Body },
  ]

  return (
    <section className="mb-12">
      {/* Clickable header row */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-4 mb-1 group"
      >
        <div className="text-left">
          <h2 className="display text-lg font-semibold text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">
            {t.howTitle}
          </h2>
          <p className="text-xs text-[var(--subtle)] mt-0.5">{t.howSubtitle}</p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5 text-[11px] text-[var(--subtle)] group-hover:text-[var(--muted)] transition-colors">
          <span className="hidden sm:inline">{open ? 'Collapse' : 'Expand'}</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      <AnimatePresence initial={false}>
      {open && <motion.div
        key="how-body"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden"
      >
      <div className="pt-4">

      <div className="space-y-3">
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[i]
          const c = STEP_COLORS[i]
          return (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={`flex gap-4 p-4 rounded-2xl border bg-[var(--surface)] backdrop-blur-sm ${c.border}`}
            >
              {/* Step number + icon */}
              <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${c.bg} border ${c.border}`}>
                  <Icon size={15} className={c.color} />
                </div>
                <span className={`mono text-[10px] font-bold ${c.color}`}>{step.num}</span>
                {i < steps.length - 1 && (
                  <div className="w-px flex-1 bg-[var(--border)] mt-1 min-h-[16px]" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-1">
                <h3 className="display text-sm font-semibold text-[var(--ink)] mb-2 leading-snug">
                  {step.title}
                </h3>
                <p className="text-xs text-[var(--muted)] leading-relaxed mb-3">{step.body}</p>
                <div className="px-3 py-2 rounded-lg bg-[#060f1c] border border-[var(--border)]">
                  <code className="mono text-[10px] text-[var(--accent)] break-all">{STEP_CODES[i]}</code>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Protocol reference row */}
      <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-[var(--subtle)]">
        {[
          ['HTTP 402', 'RFC 7235 Payment Required'],
          ['EIP-3009', 'transferWithAuthorization'],
          ['Circle Gateway', 'Off-chain batch settlement'],
          ['x402', 'Agent-native payment protocol'],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="mono text-[var(--accent)]">{k}</span>
            <span>—</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
      </div>{/* /pt-4 */}
      </motion.div>}
      </AnimatePresence>
    </section>
  )
}
