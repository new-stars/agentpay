import type { LangCode } from '../i18n'
import type { Extra } from './types'
import { en } from './en'

export type { Extra, ServiceText } from './types'
export { en }

/** Each language is its own chunk and is fetched only when the visitor picks it. English ships with the app. */
const loaders: Record<Exclude<LangCode, 'en'>, () => Promise<Extra>> = {
  zh: () => import('./zh').then(m => m.zh),
  es: () => import('./es').then(m => m.es),
  fr: () => import('./fr').then(m => m.fr),
  de: () => import('./de').then(m => m.de),
  ja: () => import('./ja').then(m => m.ja),
  ar: () => import('./ar').then(m => m.ar),
  pt: () => import('./pt').then(m => m.pt),
  ko: () => import('./ko').then(m => m.ko),
}

export async function loadExtra(lang: LangCode): Promise<Extra> {
  if (lang === 'en') return en
  return loaders[lang]()
}

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
