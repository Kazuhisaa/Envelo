import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { dbOk, migrate } from './db.ts'
import { chain, envelopeHash, noir } from './noir.ts'
import { runSetAside, setAsideRoutes } from './setAside.ts'
import { onClientPayment, veloRoutes } from './velo.ts'
import { agentRoutes, tickAll } from './agent.ts'
import { refusalRoutes } from './refusal.ts'

await migrate()
onClientPayment((id) => void runSetAside(id, chain).catch(() => {}))

// Envelope balances come from Soroban RPC (~1-3 s each); cache them briefly so dashboard polls don't wait on the chain.
const balanceCache = new Map<string, { at: number; value: Promise<bigint> }>()
const cachedBalance = (hash: string) => {
  const hit = balanceCache.get(hash)
  if (hit && Date.now() - hit.at < 10_000) return hit.value
  const value = noir.getEscrowBalance(hash)
  value.catch(() => balanceCache.delete(hash))
  balanceCache.set(hash, { at: Date.now(), value })
  return value
}
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
