import type { IncomingMessage, ServerResponse } from "node:http";
import app from "./index";

/**
 * Vercel entry (bundled into api/[...path].cjs by `bun run build:api`).
 * The page calls /api/<route>; the app's own routes have no /api prefix, so strip it.
 */
type Handle = (req: IncomingMessage, res: ServerResponse) => void;

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  req.url = (req.url ?? "/").replace(/^\/api(?=\/|\?|$)/, "") || "/";
  (app as unknown as Handle)(req, res);
}
