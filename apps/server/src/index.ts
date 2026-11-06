import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { dbOk, migrate } from './db.ts'

await migrate()
const port = Number(process.env.PORT ?? 8787)
serve({ fetch: createApp(dbOk).fetch, port }, () => console.log(`server on :${port}`))
