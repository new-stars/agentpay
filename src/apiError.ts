import type { FullT } from './LangContext'
import { fmt } from './locales'

/**
 * Turn a failed backend response into text in the visitor's language.
 * The backend sends a stable `code`; its English `error` text is never shown.
 */
export async function describeError(res: Response, t: FullT): Promise<string> {
  let code: string | undefined
  try {
    code = ((await res.json()) as { code?: string }).code
  } catch {
    // Body was not JSON: use the generic HTTP message below.
  }
  return (code && t.errors[code]) || fmt(t.errors.http, { status: res.status })
}
