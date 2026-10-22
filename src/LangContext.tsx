import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { translations, type LangCode, type T } from './i18n'

interface LangCtx {
  lang: LangCode
  t: T
  setLang: (l: LangCode) => void
}

const Ctx = createContext<LangCtx>({
  lang: 'en',
  t: translations.en,
  setLang: () => undefined,
})

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>('en')

  const setLang = (l: LangCode) => {
    setLangState(l)
    // RTL switch for Arabic
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = l
  }

  return (
    <Ctx.Provider value={{ lang, t: translations[lang], setLang }}>
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLang() {
  return useContext(Ctx)
}
