/**
 * Bundles the backend into one self-contained file that Vercel runs as a serverless function.
 * Vercel does not bundle TypeScript for a "type": "module" project, so the bundle is built here and committed.
 * Run `bun run build:api` after changing anything under server/ or the shared files it imports.
 */
import { build } from "esbuild";

await build({
  entryPoints: ["server/vercel.ts"],
  outfile: "api/[...path].cjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  minify: true,
  legalComments: "none",
  // Vercel wants the function itself as the module export.
  footer: { js: "module.exports = module.exports.default;" },
  logLevel: "info",
});
