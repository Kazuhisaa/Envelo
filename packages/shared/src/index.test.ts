import { expect, test } from 'vitest'
import type { Health } from './index.ts'

test('Health shape', () => {
  const h: Health = { ok: true, db: true, time: new Date().toISOString() }
  expect(h.ok).toBe(true)
})
