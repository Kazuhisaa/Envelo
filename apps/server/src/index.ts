import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { dbOk, migrate } from './db.ts'
import { veloRoutes } from './velo.ts'

await migrate()
const port = Number(process.env.PORT ?? 8787)
const app = createApp(dbOk).route('/', veloRoutes)
serve({ fetch: app.fetch, port }, () => console.log(`server on :${port}`))
