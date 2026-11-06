import { describe, expect, test } from 'vitest'
import {
  contributionFor,
  contributionRule,
  contributionsFor,
  formatPeso,
  deadlineFor,
  periodOf,
  phpToStroops,
  setAsideFor,
  sssMsc,
  stroopsToPhp,
} from './index.ts'

const php = (pesos: number) => Math.round(pesos * 100)

describe('worked examples from the spec', () => {
  test.each([
    [3_000, 760, 500, 120],
    [25_000, 3_780, 1_250, 400],
    [60_000, 5_280, 3_000, 400],
  ])('₱%i → SSS %i, PhilHealth %i, Pag-IBIG %i', (income, sss, philhealth, pagibig) => {
    expect(contributionsFor(php(income))).toEqual({ sss: php(sss), philhealth: php(philhealth), pagibig: php(pagibig) })
  })
})

describe('SSS bracket edges', () => {
  test.each([
    [5_249, 5_000],
    [5_250, 5_500],
    [14_749, 14_500],
    [14_750, 15_000],
    [34_750, 35_000],
    [1_000_000, 35_000],
    [0, 5_000],
  ])('₱%i → MSC %i', (income, msc) => {
    expect(sssMsc(php(income))).toBe(php(msc))
  })

  test('EC is ₱10 below MSC 15,000 and ₱30 from it', () => {
    expect(contributionFor('sss', php(14_749))).toBe(php(14_500 * 0.15 + 10))
    expect(contributionFor('sss', php(14_750))).toBe(php(15_000 * 0.15 + 30))
  })
})

test('PhilHealth clamps income to ₱10,000–₱100,000 and Pag-IBIG caps at ₱10,000', () => {
  expect(contributionFor('philhealth', php(500_000))).toBe(php(5_000))
  expect(contributionFor('philhealth', php(12_345.67))).toBe(61_728) // 5% rounded to the centavo
  expect(contributionFor('pagibig', php(9_000))).toBe(php(360))
})

describe('setAsideFor', () => {
  test('a monthly-paid freelancer gets the whole contribution in one client payment', () => {
    expect(setAsideFor('sss', php(25_000), 0)).toBe(php(3_780))
  })

  test('a second client payment only sets aside the difference', () => {
    const first = setAsideFor('sss', php(10_000), 0)
    expect(first).toBe(php(1_510)) // MSC 10,000 → 1,500 + EC 10
    expect(setAsideFor('sss', php(25_000), first)).toBe(php(3_780 - 1_510))
  })

  test('never negative', () => {
    expect(setAsideFor('pagibig', php(25_000), php(9_999))).toBe(0)
  })
})

describe('deadlines and periods (sample rules)', () => {
  test('November 2026', () => {
    expect(deadlineFor('sss', '2026-11').toISOString()).toBe('2026-12-31T15:59:59.000Z')
    expect(deadlineFor('philhealth', '2026-11').toISOString()).toBe('2026-11-30T15:59:59.000Z') // Mon
    expect(deadlineFor('pagibig', '2026-11').toISOString()).toBe('2026-12-10T15:59:59.000Z')
  })

  test('PhilHealth skips a weekend month-end and SSS rolls over the year', () => {
    expect(deadlineFor('philhealth', '2026-10').toISOString()).toBe('2026-10-30T15:59:59.000Z') // Oct 31 is Sat
    expect(deadlineFor('sss', '2026-12').toISOString()).toBe('2027-01-31T15:59:59.000Z')
  })

  test('periodOf uses Philippine time', () => {
    expect(periodOf(new Date('2026-11-30T16:30:00Z'))).toBe('2026-12') // Dec 1, 00:30 in Manila
    expect(periodOf(new Date('2026-11-30T15:30:00Z'))).toBe('2026-11')
  })
})

describe('PHP ↔ stroops', () => {
  test.each([
    [php(3_780), '12.50'],
    [php(1_250), '12.50'],
    [php(400), '7.33'],
    [61_728, '13.07'],
    [1, '12.50'],
  ])('%i centavos at ₱%s/XLM round-trips exactly', (centavos, rate) => {
    expect(stroopsToPhp(phpToStroops(centavos, rate), rate)).toBe(centavos)
  })

  test('₱12.50 is exactly 1 XLM at ₱12.50/XLM', () => {
    expect(phpToStroops(php(12.5), '12.50')).toBe(10_000_000n)
  })

  test('rejects a bad rate', () => {
    expect(() => phpToStroops(100, 'abc')).toThrow()
    expect(() => phpToStroops(100, '0')).toThrow()
  })
})

test('reasons read like the spec', () => {
  expect(contributionRule('sss', php(25_000))).toBe('15% of your ₱25,000 MSC plus ₱30 EC')
  expect(contributionRule('philhealth', php(3_000))).toBe('5% of your ₱3,000 income (counted as ₱10,000, within ₱10,000–₱100,000)')
  expect(contributionRule('pagibig', php(25_000))).toBe('4% of your income, counted up to ₱10,000')
  expect(formatPeso(6_125)).toBe('₱61.25')
})
