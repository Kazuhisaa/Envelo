import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { dbOk, migrate } from './db.ts'
import { chain, envelopeHash, noir } from './noir.ts'
import { runSetAside, setAsideRoutes } from './setAside.ts'
import { onClientPayment, veloRoutes } from './velo.ts'

await migrate()
onClientPayment((id) => void runSetAside(id, chain).catch(() => {}))

const reads = { balance: (a: Parameters<typeof envelopeHash>[0]) => noir.getEscrowBalance(envelopeHash(a)), hash: envelopeHash }
const app = createApp(dbOk).route('/', veloRoutes).route('/', setAsideRoutes(chain, reads))
const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, () => console.log(`server on :${port}`))
