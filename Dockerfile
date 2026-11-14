# AgentPay backend: the payment server, the seller marketplace and the credit pool.
#
# Run exactly ONE instance: the credit pool and the payment ledger live on this container's disk.
# Mount a persistent volume at /app/server/data, or every redeploy starts from nothing.
# Pinned to the Bun version this was tested with (see .bun-version).
FROM oven/bun:1.3.14

WORKDIR /app

# Dependencies first so they are cached between builds (only what the backend needs, not the page's wallet libraries).
COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server ./server
# The few shared files the backend imports from the page's source.
# tsconfig.json defines the "@/" import alias those shared files use.
COPY tsconfig.json ./
COPY src/onchain-facts.ts src/onchain-money.ts src/receipts.ts src/registry.ts ./src/

RUN mkdir -p /app/server/data && chown -R bun:bun /app/server/data
VOLUME ["/app/server/data"]

ENV NODE_ENV=production PORT=3001
EXPOSE 3001
USER bun

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD bun -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Stops cleanly on SIGTERM, which saves the latest credit balances.
CMD ["bun", "run", "server/index.ts"]
