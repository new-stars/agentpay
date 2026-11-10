import type { LangCode } from '../i18n'
import type { Extra } from './types'
import { en } from './en'
import { zh } from './zh'
import { es } from './es'
import { fr } from './fr'
import { de } from './de'
import { ja } from './ja'
import { ar } from './ar'
import { pt } from './pt'
import { ko } from './ko'

export type { Extra, ServiceText } from './types'

export const extras: Record<LangCode, Extra> = { en, zh, es, fr, de, ja, ar, pt, ko }

/** Fill `{name}` placeholders. Unknown placeholders are left visible so a typo is easy to spot. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => String(vars[key] ?? `{${key}}`))
}

/** BCP 47 tag used for number formatting per UI language. */
export const NUMBER_LOCALE: Record<LangCode, string> = {
  en: 'en-US', zh: 'zh-CN', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', ja: 'ja-JP', ar: 'ar-EG', pt: 'pt-BR', ko: 'ko-KR',
}

/** Display an amount string such as "0.001005" with the digits and separators of the UI language. */
export function money(lang: LangCode, value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  return new Intl.NumberFormat(NUMBER_LOCALE[lang], { minimumFractionDigits: 3, maximumFractionDigits: 6 }).format(n)
}
