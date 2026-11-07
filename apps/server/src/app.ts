import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Health } from '@envelo/shared'
import { allowedWebOrigin, authenticateRequest, authRoutes, requireTrustedOrigin, type AuthEnv } from './auth.ts'

export function createApp(dbOk: () => Promise<boolean>) {
  const app = new Hono<AuthEnv>()

  app.use('*', cors({ origin: allowedWebOrigin(), credentials: true }))

  app.onError((err, c) => {
    console.error('Unhandled server error:', err)
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  })

  // Public endpoints are explicit; every current and future application route is private by default.
  app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next()
    if (c.req.path === '/health' || c.req.path === '/auth/login' || c.req.path === '/auth/logout' || c.req.path === '/webhooks/velo') return next()
    const session = await authenticateRequest(c)
    if (!session) return c.json({ error: 'Authentication required' }, 401)
    c.set('authSession', session)
    return next()
  })

  app.use('*', requireTrustedOrigin)

  app.get('/health', async (c) => {
    const body: Health = { ok: true, db: await dbOk(), time: new Date().toISOString() }
    return c.json(body)
  })

  app.route('/', authRoutes)

  return app
}
