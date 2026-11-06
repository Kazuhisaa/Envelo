import { expect, test } from 'vitest'
import { serialized } from './setAside.ts'

test('a job queued while another runs waits for it (agent tick after set-aside)', async () => {
  const order: string[] = []
  let release!: () => void
  const setAside = serialized('set-aside', () => new Promise<void>((r) => (release = r)).then(() => void order.push('set-aside done')))
  const tick = serialized('agent tick', async () => void order.push('agent tick'))
  await new Promise((r) => setTimeout(r, 10))
  expect(order).toEqual([]) // the tick has not started while the set-aside is running
  release()
  await Promise.all([setAside, tick])
  expect(order).toEqual(['set-aside done', 'agent tick'])
})

test('a failed job does not block the next one', async () => {
  await expect(serialized('boom', async () => { throw new Error('boom') })).rejects.toThrow('boom')
  await expect(serialized('next', async () => 'ran')).resolves.toBe('ran')
})
