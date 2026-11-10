import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { LANGUAGES, translations, type LangCode, type T } from './i18n'
import { en, loadExtra, type Extra } from './locales'

export type FullT = T & Extra

interface LangCtx {
  lang: LangCode
  t: FullT
  setLang: (l: LangCode) => void
}

const STORAGE_KEY = 'agentpay.lang'

const build = (lang: LangCode, extra: Extra): FullT => ({ ...translations[lang], ...extra })

const Ctx = createContext<LangCtx>({
  lang: 'en',
  t: build('en', en),
  setLang: () => undefined,
})

/** English is the default. Only an explicit earlier choice by the visitor changes that. */
function savedLang(): LangCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    const match = LANGUAGES.find(l => l.code === saved)
    if (match) return match.code
  } catch {
    // Storage can be blocked (private mode, sandboxed iframe). Fall back to English.
  }
  return 'en'
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<{ lang: LangCode; extra: Extra }>({ lang: 'en', extra: en })
  const latest = useRef<LangCode>('en')

  // Text for a language is fetched on demand; the UI switches only once all of it is here.
  const select = useCallback((l: LangCode) => {
    latest.current = l
    void loadExtra(l)
      .then(extra => {
        if (latest.current === l) setActive({ lang: l, extra })
      })
      .catch(() => {
        // Network hiccup: stay on the current language instead of showing a half-translated page.
      })
  }, [])

  // Restore an earlier choice once on first load.
  useEffect(() => {
    const wanted = savedLang()
    if (wanted !== 'en') select(wanted)
  }, [select])

  // Keep <html lang> and text direction in sync (Arabic is right-to-left).
  useEffect(() => {
    document.documentElement.lang = active.lang
    document.documentElement.dir = active.lang === 'ar' ? 'rtl' : 'ltr'
  }, [active.lang])

  const setLang = useCallback((l: LangCode) => {
    select(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      // Ignore: the choice just will not persist.
    }
  }, [select])

  const t = useMemo(() => build(active.lang, active.extra), [active])
  const value = useMemo(() => ({ lang: active.lang, t, setLang }), [active.lang, t, setLang])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLang() {
  return useContext(Ctx)
}
