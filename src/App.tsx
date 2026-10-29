import React, { useState, useEffect, useRef } from 'react'
import { ConnectKitButton } from 'connectkit'
import { Bot, Layers, Filter, ExternalLink, BookOpen, Search, X, Sun, Moon } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { motion } from 'framer-motion'
import { ServiceCard, type AgentService } from './components/ServiceCard'
import { HowItWorks } from './components/HowItWorks'
import { StatsBar } from './components/StatsBar'
import { CodeSnippet } from './components/CodeSnippet'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { useLang } from './LangContext'

// ─────────────────────────────────────────────────────────────
// Service catalog (static — names/descriptions stay English)
// ─────────────────────────────────────────────────────────────
const SERVICES: AgentService[] = [
  {
    id: 'summarize',
    name: 'Text Summarizer',
    description:
      'Condenses long-form text into a structured summary with key points, word count, and topic tags. Ideal for RAG pipeline document compression, meeting note digestion, or research briefings.',
    endpoint: '/pay/summarize',
    method: 'POST',
    price: '0.001',
    priceUsd: 0.001,
    category: 'NLP',
    responseTime: '~120 ms',
    sla: '99.9% uptime',
    requestSchema: { text: 'string  — the document to summarize (max 16 000 chars)' },
    responseSchema: {
      summary: 'string  — compressed summary',
      key_points: 'string[]  — bullet list',
      word_count: 'number',
      paid_by: 'address  — agent wallet',
      amount_usdc: 'string',
    },
    examplePayload: {
      text: 'Circle is a global financial technology firm that enables businesses of all sizes to harness the power of digital currencies and public blockchains for payments, commerce and financial applications worldwide.',
    },
    tags: ['nlp', 'rag', 'summarization'],
    useCases: ['RAG pipeline pre-processing', 'Meeting note distillation', 'Research briefings'],
  },
  {
    id: 'translate',
    name: 'Neural Translator',
    description:
      'Translates text across 50+ languages using neural MT. Returns the translation, detected source language, and confidence score. Priced per call, not per character.',
    endpoint: '/pay/translate',
    method: 'POST',
    price: '0.005',
    priceUsd: 0.005,
    category: 'NLP',
    responseTime: '~200 ms',
    sla: '99.5% uptime',
    requestSchema: {
      text: 'string  — text to translate',
      target_lang: 'string  — ISO 639-1 code (e.g. "ja", "fr", "ar")',
    },
    responseSchema: {
      translation: 'string',
      source_lang: 'string  — auto-detected',
      confidence: 'number  — 0–1',
      paid_by: 'address',
      amount_usdc: 'string',
    },
    examplePayload: { text: 'Gasless USDC payments for AI agents.', target_lang: 'ja' },
    tags: ['translation', 'multilingual', 'i18n'],
    useCases: ['Agent-to-agent cross-language messaging', 'Global DeFi UX localisation', 'Document translation at scale'],
  },
  {
    id: 'analyze',
    name: 'Data Analyst',
    description:
      'Accepts a JSON array of data points and returns statistical insights: mean, variance, trend direction, anomaly flags, and a one-sentence natural-language interpretation.',
    endpoint: '/pay/analyze',
    method: 'POST',
    price: '0.010',
    priceUsd: 0.01,
    category: 'Data',
    responseTime: '~180 ms',
    sla: '99.5% uptime',
    requestSchema: { data: 'number[]  — array of numeric data points (max 1 000)' },
    responseSchema: {
      insight: 'string  — NL interpretation',
      mean: 'number',
      variance: 'number',
      trend: '"upward" | "downward" | "flat"',
      anomalies: 'number[]  — indices of outliers',
      paid_by: 'address',
      amount_usdc: 'string',
    },
    examplePayload: { data: [1.2, 1.5, 1.8, 2.1, 1.9, 2.4, 2.8, 3.1] },
    tags: ['analytics', 'statistics', 'ai'],
    useCases: ['On-chain volume trend detection', 'Price feed anomaly alerting', 'Portfolio analytics'],
  },
  {
    id: 'risk',
    name: 'Wallet Risk Score',
    description:
      'Analyses on-chain behaviour of any EVM wallet — transaction history, contract interactions, mixer exposure, and age — and returns a 0–100 risk score with labelled flags.',
    endpoint: '/risk',
    method: 'POST',
    price: '0.050',
    priceUsd: 0.05,
    category: 'Compliance',
    responseTime: '~300 ms',
    sla: '99.0% uptime',
    requestSchema: { address: 'string  — EVM wallet address (0x…)' },
    responseSchema: {
      risk_score: 'number  — 0 (safe) to 100 (high risk)',
      labels: 'string[]  — e.g. ["mixer-exposure", "new-wallet"]',
      recommendation: '"APPROVE" | "REVIEW" | "BLOCK"',
      paid_by: 'address',
      amount_usdc: 'string',
    },
    examplePayload: { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96044' },
    tags: ['compliance', 'aml', 'risk'],
    useCases: ['Pre-payment wallet screening', 'DeFi protocol gating', 'Exchange on-boarding'],
  },
  {
    id: 'explain-contract',
    name: 'Contract Explainer',
    description:
      'Parses a Solidity ABI or bytecode and returns a human-readable explanation of every public function, its parameters, access controls, and potential risk flags.',
    endpoint: '/explain-contract',
    method: 'POST',
    price: '0.020',
    priceUsd: 0.02,
    category: 'Dev Tools',
    responseTime: '~250 ms',
    sla: '99.0% uptime',
    requestSchema: {
      abi: 'string  — JSON-encoded ABI array',
      bytecode: 'string?  — optional hex bytecode',
    },
    responseSchema: {
      functions: 'Array<{ name, description, params, risks }>',
      overall_risk: '"low" | "medium" | "high"',
      risk_flags: 'string[]',
      paid_by: 'address',
      amount_usdc: 'string',
    },
    examplePayload: {
      abi: '[{"name":"transfer","type":"function","inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"type":"bool"}]}]',
    },
    tags: ['solidity', 'audit', 'security'],
    useCases: ['Agent contract pre-flight audit', 'Automated security scanning', 'DeFi interaction safety check'],
  },
  {
    id: 'decode-tx',
    name: 'Transaction Decoder',
    description:
      'Decodes any EVM transaction hash into human-readable form: function name, decoded parameters, internal calls, emitted events, gas breakdown, and a plain-English summary.',
    endpoint: '/decode-tx',
    method: 'POST',
    price: '0.005',
    priceUsd: 0.005,
    category: 'Dev Tools',
    responseTime: '~80 ms',
    sla: '99.5% uptime',
    requestSchema: {
      txHash: 'string  — 0x-prefixed transaction hash',
      chainId: 'number  — EVM chain ID',
    },
    responseSchema: {
      method: 'string  — decoded function signature',
      params: 'Record<string, string>',
      events: 'string[]',
      gas_used: 'number',
      summary: 'string  — plain-English description',
      paid_by: 'address',
      amount_usdc: 'string',
    },
    examplePayload: { txHash: '0xabc123def456789', chainId: 5042002 },
    tags: ['decode', 'evm', 'debug'],
    useCases: ['Explain transactions to end-users', 'Automated trade logging', 'Agent action verification'],
  },
  {
    id: 'price-oracle',
    name: 'USDC Price Oracle',
    description:
      'Returns the current USDC/USD price aggregated from on-chain DEX pools and CEX feeds, with 30-day volatility, 24 h volume, liquidity depth, and a confidence interval.',
    endpoint: '/price',
    method: 'GET',
    price: '0.001',
    priceUsd: 0.001,
    category: 'DeFi',
    responseTime: '~50 ms',
    sla: '99.9% uptime',
    requestSchema: {},
    responseSchema: {
      usdc_usd: 'number',
      vol_30d: 'number  — 30-day annualised volatility',
      volume_24h: 'string',
      liquidity: 'string',
      confidence: 'number  — 0–1',
      paid_by: 'address',
      amount_usdc: 'string',
    },
    examplePayload: undefined,
    tags: ['oracle', 'defi', 'price'],
    useCases: ['Agent portfolio rebalancing triggers', 'Stablecoin peg monitoring', 'Liquidation threshold checks'],
  },
  {
    id: 'news-feed',
    name: 'Crypto News Feed',
    description:
      'Delivers the latest 10 Web3 headlines scored by relevance, sentiment, and market impact. Covers USDC, Circle, Arc, DeFi protocols, and major token events from the past 60 minutes.',
    endpoint: '/news',
    method: 'GET',
    price: '0.002',
    priceUsd: 0.002,
    category: 'Data',
    responseTime: '~150 ms',
    sla: '99.0% uptime',
    requestSchema: {},
    responseSchema: {
      articles: 'Array<{ title, url, sentiment, relevance_score, published_at }>',
      fetched_at: 'ISO 8601 timestamp',
      paid_by: 'address',
      amount_usdc: 'string',
    },
    examplePayload: undefined,
    tags: ['news', 'sentiment', 'data'],
    useCases: ['Pre-trade sentiment analysis', 'Agent news briefing', 'Market event detection'],
  },
  {
    id: 'sentiment',
    name: 'Sentiment Analyzer',
    description:
      'Runs multi-model sentiment analysis on any text — social posts, news articles, or contract descriptions — and returns a polarity score, emotion labels, and a confidence-weighted verdict.',
    endpoint: '/pay/sentiment',
    method: 'POST',
    price: '0.003',
    priceUsd: 0.003,
    category: 'NLP',
    responseTime: '~90 ms',
    sla: '99.5% uptime',
    requestSchema: {
      text: 'string  — text to analyse (max 4 000 chars)',
      context: 'string?  — domain hint: "crypto" | "finance" | "general"',
    },
    responseSchema: {
      polarity: 'number  — –1 (negative) to +1 (positive)',
      label: '"positive" | "neutral" | "negative"',
      emotions: 'Record<string, number>  — e.g. { fear: 0.12, greed: 0.74 }',
      confidence: 'number  — 0–1',
      paid_by: 'address',
      amount_usdc: 'string',
    },
    examplePayload: { text: 'Circle launches instant USDC settlement on Arc — fees near zero.', context: 'crypto' },
    tags: ['sentiment', 'nlp', 'emotions'],
    useCases: ['Token launch sentiment monitoring', 'Social signal scoring for trading agents', 'DAO proposal tone analysis'],
  },
  {
    id: 'ens-lookup',
    name: 'ENS / Address Resolver',
    description:
      'Resolves any ENS name to its current EVM address and vice-versa. Returns the primary name, avatar URL, text records, and a freshness timestamp from the latest on-chain registry state.',
    endpoint: '/pay/ens',
    method: 'POST',
    price: '0.002',
    priceUsd: 0.002,
    category: 'Dev Tools',
    responseTime: '~110 ms',
    sla: '99.5% uptime',
    requestSchema: {
      query: 'string  — ENS name (e.g. "vitalik.eth") or 0x address',
    },
    responseSchema: {
      address: 'string  — resolved EVM address',
      name: 'string  — primary ENS name (if reverse lookup)',
      avatar: 'string?  — avatar URL',
      records: 'Record<string, string>  — text records (email, url, twitter…)',
      resolved_at: 'ISO 8601 timestamp',
      paid_by: 'address',
      amount_usdc: 'string',
    },
    examplePayload: { query: 'vitalik.eth' },
    tags: ['ens', 'identity', 'resolve'],
    useCases: ['Display human-readable names in agent UIs', 'Verify identity before high-value transfers', 'Auto-populate recipient fields in DeFi agents'],
  },
  {
    id: 'gas-estimator',
    name: 'Gas Estimator',
    description:
      'Estimates the gas cost for any EVM function call before execution. Returns base fee, priority fee, and total cost in native token and USD, with a confidence interval across the last 20 blocks.',
    endpoint: '/pay/gas',
    method: 'POST',
    price: '0.001',
    priceUsd: 0.001,
    category: 'DeFi',
    responseTime: '~70 ms',
    sla: '99.9% uptime',
    requestSchema: {
      to: 'string  — contract address',
      data: 'string  — hex-encoded calldata',
      chainId: 'number  — EVM chain ID',
      value: 'string?  — msg.value in wei (default "0")',
    },
    responseSchema: {
      gas_units: 'number  — estimated gas units',
      base_fee_gwei: 'number',
      priority_fee_gwei: 'number',
      total_eth: 'string  — total cost in ETH / native',
      total_usd: 'string  — USD equivalent',
      confidence: 'number  — 0–1',
      paid_by: 'address',
      amount_usdc: 'string',
    },
    examplePayload: { to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', data: '0xa9059cbb', chainId: 1 },
    tags: ['gas', 'evm', 'estimate'],
    useCases: ['Pre-flight cost checks for agent transactions', 'Dynamic fee budgeting in autonomous agents', 'Alerting when gas spikes above a threshold'],
  },
]

const ALL_CATEGORIES = ['All', ...Array.from(new Set(SERVICES.map(s => s.category)))]

// ─────────────────────────────────────────────────────────────
// Rotating hero tagline — cycles language samples
// ─────────────────────────────────────────────────────────────
const HERO_LINES = [
  { lang: 'English',    text: 'AI agents pay for APIs automatically — no sign-up, no API keys.' },
  { lang: '中文',        text: 'AI Agent 无需注册，自动发现价格并用 USDC 完成纳米支付。' },
  { lang: 'Español',    text: 'Los agentes de IA pagan por APIs automáticamente con USDC.' },
  { lang: 'Français',   text: 'Les agents IA paient les APIs automatiquement en USDC.' },
  { lang: 'Deutsch',    text: 'KI-Agenten bezahlen APIs automatisch — ohne Registrierung.' },
  { lang: '日本語',      text: 'AIエージェントがAPIを自動的にUSDCで支払います。' },
  { lang: 'العربية',    text: 'وكلاء الذكاء الاصطناعي يدفعون مقابل APIs تلقائياً بـ USDC.' },
  { lang: 'Português',  text: 'Agentes de IA pagam por APIs automaticamente com USDC.' },
  { lang: '한국어',      text: 'AI 에이전트가 USDC로 API 요금을 자동으로 지불합니다.' },
]

function RotatingHeroLine() {
  const [idx, setIdx] = useState(0)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    ref.current = setInterval(() => setIdx(i => (i + 1) % HERO_LINES.length), 3200)
    return () => { if (ref.current) clearInterval(ref.current) }
  }, [])
  const line = HERO_LINES[idx]
  return (
    <motion.div
      key={idx}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-baseline gap-2"
    >
      <span className="mono text-[10px] text-[var(--subtle)] uppercase tracking-widest shrink-0 w-20">{line.lang}</span>
      <span className="text-sm text-[var(--muted)] leading-snug">{line.text}</span>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// Theme toggle
// ─────────────────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(true)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])
  return { dark, toggle: () => setDark(v => !v) }
}

// Session cost context — shared across all ServiceCards
export const SessionCostContext = React.createContext<{ add: (n: number) => void }>({ add: () => {} })

export default function App() {
  const { t } = useLang()
  const [activeCategory, setActiveCategory] = useState('All')
  const [showSnippet, setShowSnippet] = useState(false)
  const [search, setSearch] = useState('')
  const { dark, toggle: toggleTheme } = useTheme()
  const [sessionCost, setSessionCost] = useState(0)
  const addCost = (n: number) => setSessionCost(v => Math.round((v + n) * 10000) / 10000)

  const filtered = SERVICES.filter(s => {
    const matchCat = activeCategory === 'All' || s.category === activeCategory
    const q = search.toLowerCase().trim()
    const matchSearch = q === '' ||
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some(tag => tag.includes(q)) ||
      s.category.toLowerCase().includes(q)
    return matchCat && matchSearch
  })

  const categories = ALL_CATEGORIES

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-20 border-b border-[var(--border)] backdrop-blur-xl" style={{ background: 'var(--header-bg)' }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center">
              <Bot size={14} className="text-[var(--accent)]" />
            </div>
            <span className="display text-sm font-semibold text-[var(--ink)]">AgentPay</span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--success)]/15 text-[var(--success)] border border-[var(--success)]/20 font-medium">
              <span className="w-1 h-1 rounded-full bg-[var(--success)] animate-pulse" />
              x402 · Circle Gateway
            </span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://developers.circle.com/gateway/nanopayments"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1 text-[11px] text-[var(--subtle)] hover:text-[var(--muted)] transition-colors"
            >
              <BookOpen size={12} />
              {t.docs}
            </a>
            {/* Session cost pill */}
            {sessionCost > 0 && (
              <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--success)]/15 border border-[var(--success)]/25 text-[10px] text-[var(--success)] font-medium tabular-nums">
                <TokenUSDC variant="branded" size={10} />
                {sessionCost.toFixed(4)} spent
              </div>
            )}
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--subtle)] hover:text-[var(--muted)] hover:border-[var(--border-strong)] transition-colors"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            {/* ── Language switcher ── */}
            <LanguageSwitcher />
            <ConnectKitButton />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">

        {/* ── Hero ── */}
        <section className="mb-12">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>

            {/* Protocol badges */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
              {[
                { icon: <TokenUSDC variant="branded" size={13} />, label: 'USDC Nanopayments' },
                { icon: <Layers size={11} className="text-[var(--subtle)]" />, label: t.heroBadgeNetwork },
                { icon: <span className="mono text-[10px] font-bold text-yellow-300">402</span>, label: t.heroBadgeProtocol },
                { icon: <span className="mono text-[10px] text-[var(--accent)]">EIP-3009</span>, label: t.heroBadgeAuth },
              ].map(b => (
                <div key={b.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--muted)] font-medium">
                  {b.icon}
                  {b.label}
                </div>
              ))}
            </div>

            {/* Headline */}
            <h1 className="display text-4xl sm:text-5xl font-semibold text-[var(--ink)] mb-2" style={{ letterSpacing: '-0.04em', lineHeight: 1.1 }}>
              {t.heroHeadline1}<br />
              <span className="text-[var(--accent)]">{t.heroHeadline2}</span>
            </h1>
            <p className="text-base text-[var(--muted)] max-w-2xl leading-relaxed mb-5 mt-3" style={{ textWrap: 'pretty' }}>
              {t.heroSubtitle}
            </p>

            {/* Rotating multilingual sampler (always shows all languages) */}
            <div className="h-8 overflow-hidden mb-6">
              <RotatingHeroLine />
            </div>

            {/* CTA row */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowSnippet(v => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--accent)] text-[#0d1b2f] hover:bg-[var(--accent-hover)] transition-colors"
              >
                <span className="mono text-xs">{'</>'}</span>
                {showSnippet ? t.heroCtaHide : t.heroCta}
              </button>
              <a
                href="https://developers.circle.com/gateway/nanopayments/quickstarts/seller"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-[var(--muted)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors"
              >
                {t.heroCtaSeller}
                <ExternalLink size={12} />
              </a>
            </div>

            {/* Code snippet drawer */}
            {showSnippet && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 overflow-hidden"
              >
                <CodeSnippet />
              </motion.div>
            )}
          </motion.div>
        </section>

        {/* ── Stats bar ── */}
        <StatsBar />

        {/* ── How it works ── */}
        <HowItWorks />

        {/* ── Service catalog ── */}
        <section>
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <h2 className="display text-lg font-semibold text-[var(--ink)]">{t.catalogTitle}</h2>
              <p className="text-xs text-[var(--subtle)] mt-0.5">{t.catalogSubtitle.replace('8 paid', '12 paid')}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Filter size={11} className="text-[var(--subtle)]" />
              <div className="flex gap-1 flex-wrap">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      activeCategory === cat
                        ? 'bg-[var(--accent)] text-[#0d1b2f]'
                        : 'text-[var(--subtle)] border border-[var(--border)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    {cat === 'All' ? t.catalogFilterAll : cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Search box */}
          <div className="relative mb-6">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--subtle)] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search APIs by name, category or tag…"
              className="w-full pl-8 pr-8 py-2 rounded-xl text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtle)] hover:text-[var(--muted)]"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <SessionCostContext.Provider value={{ add: addCost }}>
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((svc, i) => (
              <motion.div
                key={svc.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <ServiceCard service={svc} />
              </motion.div>
            ))}
            {filtered.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full py-16 text-center"
              >
                <p className="text-sm text-[var(--subtle)]">No APIs match <span className="text-[var(--ink)]">"{search}"</span></p>
                <button onClick={() => setSearch('')} className="mt-2 text-xs text-[var(--accent)] hover:underline">
                  Clear search
                </button>
              </motion.div>
            )}
          </motion.div>
          </SessionCostContext.Provider>
        </section>

        {/* ── Footer ── */}
        <footer className="mt-16 pt-8 border-t border-[var(--border)] text-center space-y-2">
          <p className="text-xs text-[var(--subtle)]">
            {t.footerRunning} <span className="text-[var(--ink)]">Arc Testnet</span>
            {' · '}{t.footerSettled}{' '}
            <span className="text-[var(--ink)]">Circle Gateway</span>
            {' · '}{t.footerStandard}:{' '}
            <span className="mono text-[var(--accent)]">x402 + EIP-3009</span>
          </p>
          <p className="text-xs text-[var(--subtle)]">
            {t.footerMonetise}{' '}
            <code className="mono text-[var(--accent)] text-[11px]">app.post("/route", gateway.require("$0.01"), handler)</code>
          </p>
          <p className="text-[10px] text-[var(--subtle)]/60 mt-1">{t.footerTestnet}</p>
          {/* Live deployment links */}
          <div className="flex items-center justify-center gap-4 pt-2">
            {[
              { label: 'GitHub', href: 'https://github.com/new-stars/agentpay' },
              { label: 'Vercel', href: 'https://arc-studio-4347e0e2182e4e099e30c253.vercel.app' },
              { label: 'Netlify', href: 'https://thunderous-swan-3c2126.netlify.app' },
            ].map(l => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-[var(--subtle)] hover:text-[var(--accent)] transition-colors"
              >
                {l.label}
                <ExternalLink size={10} />
              </a>
            ))}
          </div>
        </footer>
      </main>
    </div>
  )
}
