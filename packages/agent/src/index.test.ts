import { describe, expect, test, vi } from 'vitest'
import {
  proportionalSplit,
  prioritizeSetAsides,
  buildUserPrompt,
  validateAllocation,
  type PrioritizeInput,
} from './index.ts'

const mockInput: PrioritizeInput = {
  availableCentavos: 100_000, // ₱1,000
  needed: { sss: 76_000, philhealth: 50_000, pagibig: 12_000 }, // ₱760 / ₱500 / ₱120 = ₱1,380
  deadlines: {
    sss: new Date('2026-12-31T15:59:59Z'),
    philhealth: new Date('2026-11-30T15:59:59Z'),
    pagibig: new Date('2026-12-10T15:59:59Z'),
  },
  balances: { sss: 0, philhealth: 0, pagibig: 0 },
  today: new Date('2026-11-07T00:00:00Z'),
}

describe('proportionalSplit', () => {
  test('never exceeds a need or the available amount', () => {
    const needed = { sss: 76_000, philhealth: 50_000, pagibig: 12_000 }
    const split = proportionalSplit(100_000, needed)
    expect(split.sss + split.philhealth + split.pagibig).toBeLessThanOrEqual(100_000)
    expect(split).toEqual({ sss: 55_072, philhealth: 36_231, pagibig: 8_695 })
    expect(proportionalSplit(1_000_000, needed)).toEqual(needed)
    expect(proportionalSplit(0, needed)).toEqual({ sss: 0, philhealth: 0, pagibig: 0 })
  })
})

describe('validateAllocation', () => {
  test('accepts valid allocation within limits', () => {
    const res = validateAllocation(
      {
        sss: 38_000,
        philhealth: 50_000,
        pagibig: 12_000,
        reason: 'Funded PhilHealth and Pag-IBIG first due to nearest deadlines.',
      },
      mockInput,
    )
    expect(res.ok).toBe(true)
  })

  test('rejects total exceeding available centavos', () => {
    const res = validateAllocation(
      {
        sss: 76_000,
        philhealth: 50_000,
        pagibig: 0,
        reason: 'Over allocation',
      },
      mockInput, // available is 100_000, sum is 126_000
    )
    expect(res.ok).toBe(false)
  })

  test('rejects allocation exceeding agency needed', () => {
    const res = validateAllocation(
      {
        sss: 0,
        philhealth: 60_000, // needed is 50_000
        pagibig: 10_000,
        reason: 'Over agency need',
      },
      mockInput,
    )
    expect(res.ok).toBe(false)
  })

  test('rejects negative numbers or missing fields', () => {
    const res = validateAllocation(
      {
        sss: -100,
        philhealth: 50_000,
        pagibig: 10_000,
        reason: 'Negative',
      },
      mockInput,
    )
    expect(res.ok).toBe(false)
  })
})

describe('prioritizeSetAsides', () => {
  test('applies valid Claude allocation when client succeeds', async () => {
    const fakeClient = vi.fn().mockResolvedValue({
      sss: 38_000,
      philhealth: 50_000,
      pagibig: 12_000,
      reason: 'PhilHealth has the earliest deadline on Nov 30, so I filled it and Pag-IBIG first.',
    })

    const result = await prioritizeSetAsides(mockInput, {
      apiKey: 'test-key',
      client: fakeClient,
    })

    expect(result.source).toBe('claude')
    expect(result.amounts).toEqual({ sss: 38_000, philhealth: 50_000, pagibig: 12_000 })
    expect(result.reason).toContain('PhilHealth has the earliest deadline')
    expect(fakeClient).toHaveBeenCalledOnce()
  })

  test('falls back to proportional split when Claude returns invalid schema', async () => {
    const fakeClient = vi.fn().mockResolvedValue({
      sss: 'not-a-number',
      reason: 'Oops',
    })

    const result = await prioritizeSetAsides(mockInput, {
      apiKey: 'test-key',
      client: fakeClient,
    })

    expect(result.source).toBe('fallback')
    expect(result.amounts).toEqual(proportionalSplit(mockInput.availableCentavos, mockInput.needed))
    expect(result.reason).toMatch(/^I split it proportionally because /)
  })

  test('falls back to proportional split when Claude over-allocates total', async () => {
    const fakeClient = vi.fn().mockResolvedValue({
      sss: 76_000,
      philhealth: 50_000,
      pagibig: 12_000,
      reason: 'Trying to give everyone full amount',
    })

    const result = await prioritizeSetAsides(mockInput, {
      apiKey: 'test-key',
      client: fakeClient,
    })

    expect(result.source).toBe('fallback')
    expect(result.amounts).toEqual(proportionalSplit(mockInput.availableCentavos, mockInput.needed))
    expect(result.reason).toMatch(/^I split it proportionally because /)
  })

  test('falls back to proportional split when Claude allocates more than an agency needs', async () => {
    const fakeClient = vi.fn().mockResolvedValue({
      sss: 0,
      philhealth: 80_000, // needs 50_000
      pagibig: 10_000,
      reason: 'Giving extra to PhilHealth',
    })

    const result = await prioritizeSetAsides(mockInput, {
      apiKey: 'test-key',
      client: fakeClient,
    })

    expect(result.source).toBe('fallback')
    expect(result.amounts).toEqual(proportionalSplit(mockInput.availableCentavos, mockInput.needed))
    expect(result.reason).toMatch(/^I split it proportionally because /)
  })

  test('falls back to proportional split when Claude API throws', async () => {
    const fakeClient = vi.fn().mockRejectedValue(new Error('500 Internal Server Error'))

    const result = await prioritizeSetAsides(mockInput, {
      apiKey: 'test-key',
      client: fakeClient,
    })

    expect(result.source).toBe('fallback')
    expect(result.amounts).toEqual(proportionalSplit(mockInput.availableCentavos, mockInput.needed))
    expect(result.reason).toContain('I split it proportionally because the AI service encountered an error.')
    expect(result.reason).toContain('in proportion')
  })

  test('falls back to proportional split on timeout', async () => {
    const fakeClient = vi.fn().mockImplementation(async ({ signal }: { signal: AbortSignal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    })

    const result = await prioritizeSetAsides(mockInput, {
      apiKey: 'test-key',
      client: fakeClient,
      timeoutMs: 20,
    })

    expect(result.source).toBe('fallback')
    expect(result.amounts).toEqual(proportionalSplit(mockInput.availableCentavos, mockInput.needed))
    expect(result.reason).toContain('I split it proportionally because the AI decision timed out.')
    expect(result.reason).toContain('in proportion')
  })

  test('falls back to proportional split when API key is missing', async () => {
    const fakeClient = vi.fn()

    const result = await prioritizeSetAsides(mockInput, {
      apiKey: '',
      client: fakeClient,
    })

    expect(result.source).toBe('fallback')
    expect(result.amounts).toEqual(proportionalSplit(mockInput.availableCentavos, mockInput.needed))
    expect(result.reason).toContain('I split it proportionally because the Claude API key is not configured.')
    expect(result.reason).toContain('in proportion')
    expect(fakeClient).not.toHaveBeenCalled()
  })

  test('buildUserPrompt includes all agencies, amounts, deadlines, and lapse costs', () => {
    const prompt = buildUserPrompt(mockInput)
    expect(prompt).toContain('₱1,000')
    expect(prompt).toContain('SSS')
    expect(prompt).toContain('PhilHealth')
    expect(prompt).toContain('Pag-IBIG')
    expect(prompt).toContain('2026-11-30')
    expect(prompt).toContain('hospitalization')
  })
})
