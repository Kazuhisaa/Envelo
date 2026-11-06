import { serve } from '@hono/node-server'
import { AGENCIES } from '@envelo/shared'
import { createApp } from './app.ts'
import { dbOk, migrate } from './db.ts'
import { chain, envelopeHash, noir } from './noir.ts'
import { runSetAside, setAsideRoutes } from './setAside.ts'
import { onClientPayment, veloRoutes } from './velo.ts'
import { agentRoutes, tickAll } from './agent.ts'
import { refusalRoutes } from './refusal.ts'

await migrate()
onClientPayment((id) => void runSetAside(id, chain).catch(() => {}))

// Envelope balances come from Soroban RPC (several seconds from Railway). Serve the last known value at once and
// refresh it in the background when older than 10 s (stale-while-revalidate); the cache is warmed at startup,
// so the dashboard never waits on the chain. Only the very first read of a balance blocks.
const balances = new Map<string, { at: number; value: bigint }>()
const inFlight = new Map<string, Promise<bigint>>()
const fetchBalance = (hash: string) => {
  let p = inFlight.get(hash)
  if (!p) {
    p = noir.getEscrowBalance(hash)
    inFlight.set(hash, p)
    p.then((value) => balances.set(hash, { at: Date.now(), value }), () => {}).finally(() => inFlight.delete(hash))
  }
  return p
}
const cachedBalance = async (hash: string) => {
  const hit = balances.get(hash)
  if (!hit) return fetchBalance(hash)
  if (Date.now() - hit.at > 10_000) void fetchBalance(hash).catch(() => {})
  return hit.value
}
for (const a of AGENCIES) void fetchBalance(envelopeHash(a)).catch(() => {}) // warm the cache
const reads = { balance: (a: Parameters<typeof envelopeHash>[0]) => cachedBalance(envelopeHash(a)), hash: envelopeHash }
const app = createApp(dbOk)
  .route('/', veloRoutes)
  .route('/', setAsideRoutes(chain, reads))
  .route('/', agentRoutes())
  .route('/', refusalRoutes())

// Daily cron (bonus): runs one tick daily with the real clock
const ONE_DAY_MS = 24 * 60 * 60 * 1000
setInterval(async () => {
  try {
    console.log('Daily cron: running remittance tick with real clock…')
    await tickAll()
  } catch (err) {
    console.error('Daily cron remittance tick error:', err)
  }
}, ONE_DAY_MS)

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, () => console.log(`server on :${port}`))
