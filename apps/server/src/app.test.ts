import { beforeEach, expect, test } from 'vitest'
import { createApp } from './app.ts'

const app = createApp(async () => true)

beforeEach(() => {
  process.env.WEB_URL = 'http://localhost:3000'
})

test('GET /health is public', async () => {
  const res = await app.request('/health')
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({ ok: true, db: true })
})

test('application reads and writes require a session', async () => {
  expect((await app.request('/anything')).status).toBe(401)
  expect((await app.request('/anything', { method: 'POST' })).status).toBe(401)
  expect((await app.request('/auth/session')).status).toBe(401)
})

test('login requires the configured web origin', async () => {
  const request = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
  expect((await app.request('/auth/login', request)).status).toBe(403)
  expect((await app.request('/auth/login', { ...request, headers: { ...request.headers, origin: 'https://evil.example' } })).status).toBe(403)
})

test('the Velo webhook bypasses browser auth and origin checks', async () => {
  const res = await app.request('/webhooks/velo', { method: 'POST' })
  expect(res.status).toBe(404)
})
