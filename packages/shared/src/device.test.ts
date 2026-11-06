import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { deviceHash } from './device.ts'

test('deviceHash is SHA-256 hex of envelo:<freelancer>:<agency>[:suffix]', () => {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex')
  expect(deviceHash('GABC', 'sss')).toBe(sha('envelo:GABC:sss'))
  expect(deviceHash('GABC', 'sss', 'expired-demo')).toBe(sha('envelo:GABC:sss:expired-demo'))
  expect(deviceHash('GABC', 'sss')).toMatch(/^[0-9a-f]{64}$/)
})
