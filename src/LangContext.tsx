import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { LANGUAGES, translations, type LangCode, type T } from './i18n'
import { extras, type Extra } from './locales'

export type FullT = T & Extra

interface LangCtx {
  lang: LangCode
  t: FullT
  setLang: (l: LangCode) => void
}

const STORAGE_KEY = 'agentpay.lang'

const build = (lang: LangCode): FullT => ({ ...translations[lang], ...extras[lang] })

const Ctx = createContext<LangCtx>({
  lang: 'en',
  t: build('en'),
  setLang: () => undefined,
})

/** English is the default. Only an explicit earlier choice by the visitor changes that. */
function initialLang(): LangCode {
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
  const [lang, setLangState] = useState<LangCode>(initialLang)

  // Keep <html lang> and text direction in sync (Arabic is right-to-left).
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const setLang = (l: LangCode) => {
    setLangState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      // Ignore: the choice just will not persist.
    }
  }

  const t = useMemo(() => build(lang), [lang])

  return <Ctx.Provider value={{ lang, t, setLang }}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLang() {
  return useContext(Ctx)
}
