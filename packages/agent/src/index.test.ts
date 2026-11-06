import { describe, expect, test, vi } from 'vitest'
import {
  applyHardRules,
  decideRemittance,
  fallbackDecision,
  proportionalSplit,
  type RemittanceFacts,
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

describe('fallbackDecision', () => {
  const baseFacts: RemittanceFacts = {
    agency: 'sss',
    period: '2026-11',
    contributionStroops: 250_000_0000n, // 250 XLM
    escrowBalanceStroops: 250_000_0000n,
    policy: { maxAmount: 300_000_0000n, expiresAt: new Date('2026-11-30T23:59:59Z') },
    deadline: new Date('2026-11-30T15:59:59Z'),
    alreadyRemitted: false,
    now: new Date('2026-11-29T12:00:00Z'), // ~1 day before deadline
  }

  test('pays when envelope holds full contribution and deadline is <= 2 days away', () => {
    const decision = fallbackDecision(baseFacts)
    expect(decision.action).toBe('pay')
    expect(decision.amount).toBe(baseFacts.contributionStroops)
    expect(decision.reason).toContain('[Fallback]')
    expect(decision.model).toBe('fallback')
  })

  test('waits when envelope is underfunded', () => {
    const underfunded = { ...baseFacts, escrowBalanceStroops: 100_000_0000n }
    const decision = fallbackDecision(underfunded)
    expect(decision.action).toBe('wait')
    expect(decision.amount).toBe(0n)
    expect(decision.reason).toContain('does not hold the full contribution')
    expect(decision.reason).toContain('[Fallback]')
  })

  test('waits when deadline is more than 2 days away', () => {
    const farAway = { ...baseFacts, now: new Date('2026-11-15T12:00:00Z') }
    const decision = fallbackDecision(farAway)
    expect(decision.action).toBe('wait')
    expect(decision.amount).toBe(0n)
    expect(decision.reason).toContain('more than 2 days away')
    expect(decision.reason).toContain('[Fallback]')
  })
})

describe('applyHardRules', () => {
  const facts: RemittanceFacts = {
    agency: 'sss',
    period: '2026-11',
    contributionStroops: 250_000_0000n,
    escrowBalanceStroops: 300_000_0000n,
    policy: null,
    deadline: new Date('2026-11-30T15:59:59Z'),
    alreadyRemitted: false,
    now: new Date('2026-11-29T10:00:00Z'),
  }

  test('passes a valid pay decision', () => {
    const result = applyHardRules(
      { action: 'pay', amount: 250_000_0000n, reason: 'Ready to remit', model: 'claude-sonnet-5-5' },
      facts,
    )
    expect(result.blocked).toBe(false)
    expect(result.decision.action).toBe('pay')
  })

  test('hard rule overrides pay after deadline', () => {
    const pastDeadline = { ...facts, now: new Date('2026-12-01T00:00:00Z') }
    const result = applyHardRules(
      { action: 'pay', amount: 250_000_0000n, reason: 'AI says pay', model: 'claude-sonnet-5-5' },
      pastDeadline,
    )
    expect(result.blocked).toBe(true)
    expect(result.rule).toBe('deadline_passed')
    expect(result.decision.action).toBe('wait')
    expect(result.decision.reason).toContain('deadline for SSS')
    expect(result.decision.reason).toContain('has passed')
  })

  test('hard rule overrides pay if already remitted this period', () => {
    const already = { ...facts, alreadyRemitted: true }
    const result = applyHardRules(
      { action: 'pay', amount: 250_000_0000n, reason: 'AI says pay', model: 'claude-sonnet-5-5' },
      already,
    )
    expect(result.blocked).toBe(true)
    expect(result.rule).toBe('already_remitted')
    expect(result.decision.action).toBe('wait')
    expect(result.decision.reason).toContain('already been remitted for period 2026-11')
  })

  test('hard rule overrides pay if amount exceeds computed contribution', () => {
    const result = applyHardRules(
      { action: 'pay', amount: 500_000_0000n, reason: 'AI says pay more', model: 'claude-sonnet-5-5' },
      facts,
    )
    expect(result.blocked).toBe(true)
    expect(result.rule).toBe('amount_exceeds_contribution')
    expect(result.decision.action).toBe('wait')
    expect(result.decision.reason).toContain('exceeds computed contribution')
  })
})

describe('decideRemittance with Claude caller and fallback', () => {
  const facts: RemittanceFacts = {
    agency: 'philhealth',
    period: '2026-11',
    contributionStroops: 83_333_3333n,
    escrowBalanceStroops: 100_000_0000n,
    policy: null,
    deadline: new Date('2026-11-30T15:59:59Z'),
    alreadyRemitted: false,
    now: new Date('2026-11-29T10:00:00Z'),
  }

  test('returns parsed decision when Claude succeeds with structured JSON', async () => {
    const fakeCaller = async () => JSON.stringify({
      action: 'pay',
      amount: '833333333',
      reason: 'PhilHealth contribution envelope is fully funded and deadline is tomorrow.',
    })

    const decision = await decideRemittance(facts, { caller: fakeCaller })
    expect(decision.action).toBe('pay')
    expect(decision.amount).toBe(833333333n)
    expect(decision.reason).toBe('PhilHealth contribution envelope is fully funded and deadline is tomorrow.')
    expect(decision.model).toBe('claude-sonnet-5-5')
  })

  test('uses fallback when Claude fails or throws', async () => {
    const failingCaller = async () => {
      throw new Error('Claude API network timeout')
    }

    const decision = await decideRemittance(facts, { caller: failingCaller })
    expect(decision.action).toBe('pay') // facts has full balance and is within 2 days
    expect(decision.model).toBe('fallback')
    expect(decision.reason).toContain('[Fallback]')
  })

  test('uses fallback when Claude returns invalid schema', async () => {
    const badSchemaCaller = async () => 'Sorry, I cannot answer this as JSON.'

    const decision = await decideRemittance(facts, { caller: badSchemaCaller })
    expect(decision.model).toBe('fallback')
    expect(decision.reason).toContain('[Fallback]')
  })

  test('with an underfunded envelope, Claude or fallback waits', async () => {
    const underfunded = { ...facts, escrowBalanceStroops: 10_000_0000n }
    const fakeCaller = async () => JSON.stringify({
      action: 'wait',
      amount: 0,
      reason: 'PhilHealth envelope is underfunded; waiting for additional client payments.',
    })

    const decision = await decideRemittance(underfunded, { caller: fakeCaller })
    expect(decision.action).toBe('wait')
    expect(decision.amount).toBe(0n)
    expect(decision.reason).toContain('underfunded')
  })
})
