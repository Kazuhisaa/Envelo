import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Health } from '@envelo/shared'

const matches = (given: string, expected: string) =>
  given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))

export function createApp(dbOk: () => Promise<boolean>) {
  const app = new Hono()

  app.use('*', cors())

  // Demo passcode guard: every write needs x-demo-passcode. Fails closed if DEMO_PASSCODE is unset.
  app.use('*', async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') return next()
    const expected = process.env.DEMO_PASSCODE
    const given = c.req.header('x-demo-passcode') ?? ''
    if (!expected || !matches(given, expected)) return c.json({ error: 'bad or missing x-demo-passcode' }, 401)
    return next()
  })

  app.get('/health', async (c) => {
    const body: Health = { ok: true, db: await dbOk(), time: new Date().toISOString() }
    return c.json(body)
  })

  return app
}
