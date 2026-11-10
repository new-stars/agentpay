import serverless from "serverless-http";
import app from "../../server/index";

/**
 * Netlify entry. The page calls /api/<route>, which netlify.toml rewrites to this function.
 * The app's own routes have no /api prefix, so strip it (and Netlify's function prefix) here.
 */
const handle = serverless(app);
const PREFIX = /^\/(?:\.netlify\/functions\/api|api)(?=\/|$)/;

export const handler = (event: { path: string; rawUrl?: string }, context: unknown): Promise<unknown> => {
  const path = event.path.replace(PREFIX, "") || "/";
  return handle({ ...event, path }, context as object) as Promise<unknown>;
};
