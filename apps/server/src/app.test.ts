import { beforeEach, expect, test } from 'vitest'
import { createApp } from './app.ts'

const app = createApp(async () => true)

beforeEach(() => {
  process.env.DEMO_PASSCODE = 'letmein'
})

test('GET /health is public', async () => {
  const res = await app.request('/health')
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({ ok: true, db: true })
})

test('POST without passcode is 401', async () => {
  expect((await app.request('/anything', { method: 'POST' })).status).toBe(401)
  expect((await app.request('/anything', { method: 'POST', headers: { 'x-demo-passcode': 'nope' } })).status).toBe(401)
})

test('POST with passcode passes the guard', async () => {
  const res = await app.request('/anything', { method: 'POST', headers: { 'x-demo-passcode': 'letmein' } })
  expect(res.status).toBe(404) // no route yet, but the guard let it through
})

test('writes are open when DEMO_PASSCODE is unset (open demo)', async () => {
  delete process.env.DEMO_PASSCODE
  expect((await app.request('/anything', { method: 'POST' })).status).toBe(404) // guard let it through
})
