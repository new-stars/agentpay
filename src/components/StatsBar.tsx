import { useEffect, useRef, useState } from 'react'
import { TokenUSDC } from '@web3icons/react'
import { motion } from 'framer-motion'
import { useLang } from '../LangContext'

// Smooth animated counter hook
function useAnimatedNumber(target: number, decimals = 0) {
  const [display, setDisplay] = useState(target)
  const prev = useRef(target)

  useEffect(() => {
    const start = prev.current
    const end = target
    if (start === end) return
    prev.current = end

    const duration = 600
    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const val = start + (end - start) * eased
      setDisplay(parseFloat(val.toFixed(decimals)))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, decimals])

  return display
}

export function StatsBar() {
  const { t } = useLang()
  const [callCount, setCallCount] = useState(12_847)
  const [volumeUsdc, setVolumeUsdc] = useState(38.42)

  useEffect(() => {
    const id = setInterval(() => {
      setCallCount(c => c + Math.floor(Math.random() * 4 + 1))
      setVolumeUsdc(v => Math.round((v + Math.random() * 0.05) * 100) / 100)
    }, 2500)
    return () => clearInterval(id)
  }, [])

  const animatedCalls = useAnimatedNumber(callCount, 0)
  const animatedVolume = useAnimatedNumber(volumeUsdc, 2)

  const stats = [
    { key: 'services',   label: t.statServices,    value: '12',                                       live: false, icon: false },
    { key: 'response',   label: t.statAvgResponse,  value: '< 200 ms',                               live: false, icon: false },
    { key: 'price',      label: t.statMinPrice,     value: '$0.001 USDC',                            live: false, icon: false },
    { key: 'calls',      label: t.statTotalCalls,   value: Math.round(animatedCalls).toLocaleString(), live: true,  icon: false },
    { key: 'volume',     label: t.statVolume,       value: `$${animatedVolume.toFixed(2)} USDC`,      live: true,  icon: true  },
    { key: 'settlement', label: t.statSettlement,   value: 'Circle Gateway',                         live: false, icon: false },
    { key: 'network',    label: t.statNetwork,      value: 'Arc Testnet',                            live: false, icon: false },
  ]

  return (
    <div className="mb-12 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {stats.map((s, i) => (
        <motion.div
          key={s.key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex flex-col gap-1 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]"
        >
          <div className="flex items-center gap-1.5 min-h-[16px]">
            {s.icon && <TokenUSDC variant="branded" size={12} />}
            {s.live && !s.icon && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse shrink-0" />
            )}
            <span className="text-[10px] text-[var(--subtle)] leading-tight">{s.label}</span>
          </div>
          <span className={`text-sm font-semibold tabular-nums leading-tight transition-colors ${s.icon ? 'text-[var(--success)]' : 'text-[var(--ink)]'}`}>
            {s.value}
          </span>
        </motion.div>
      ))}
    </div>
  )
}
