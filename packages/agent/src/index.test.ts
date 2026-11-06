import { expect, test } from 'vitest'
import { proportionalSplit } from './index.ts'

test('proportional split never exceeds a need or the available amount', () => {
  const needed = { sss: 76_000, philhealth: 50_000, pagibig: 12_000 }
  const split = proportionalSplit(100_000, needed)
  expect(split.sss + split.philhealth + split.pagibig).toBeLessThanOrEqual(100_000)
  expect(split).toEqual({ sss: 55_072, philhealth: 36_231, pagibig: 8_695 })
  expect(proportionalSplit(1_000_000, needed)).toEqual(needed)
  expect(proportionalSplit(0, needed)).toEqual({ sss: 0, philhealth: 0, pagibig: 0 })
})
