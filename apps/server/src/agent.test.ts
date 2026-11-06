import { beforeEach, describe, expect, test } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { toStroops, fromStroops } from '@noirx402/agent-sdk'
import { deadlineFor, periodOf, type Agency } from '@envelo/shared'
import { clock } from './clock.ts'
import {
  explainCheckReason,
  fastForward,
  tickEnvelope,
  type EnvelopeReads,
  type TickEnvOptions,
} from './agent.ts'
import type { RemittanceChain } from './noir.ts'

describe('agent remittance loop (Noir and Claude faked)', () => {
  const period = periodOf(new Date())

  // Mock fake chain
  type AuthorizeCall = { agent: any; deviceHash: string; merchant: string; asset: string; amount: bigint }
  type ClaimCall = { merchant: any; token: string }
  type CheckCall = { deviceHash: string; agent: string; asset: string; amount: bigint }

  let checkCalls: CheckCall[] = []
  let authorizeCalls: AuthorizeCall[] = []
  let claimCalls: ClaimCall[] = []
  let checkResult: { ok: true } | { ok: false; reason: any } = { ok: true }

  const fakeChain: RemittanceChain = {
    async checkPayment(p) {
      checkCalls.push(p)
      return checkResult
    },
    async authorizePayment(p) {
      authorizeCalls.push(p)
      return { hash: `auth_tx_${authorizeCalls.length}`, nonce: 1234567890n }
    },
    async claim(p) {
      claimCalls.push(p)
      return { hash: `claim_tx_${claimCalls.length}` }
    },
  }

  let escrowBalances: Record<Agency, bigint> = {
    sss: toStroops('300'),
    philhealth: toStroops('100'),
    pagibig: toStroops('50'),
  }

  const fakeReads: EnvelopeReads = {
    async getEscrowBalance(deviceHash: string) {
      return toStroops('500')
    },
    async getPolicy(deviceHash: string) {
      return { maxAmount: toStroops('500'), expiresAt: new Date('2026-11-30T23:59:59Z') }
    },
  }

  // In-memory fake database queries to simulate decisions and remittances tables without Postgres
  let decisionsDb: any[] = []
  let remittancesDb: any[] = []

  const fakeSql = Object.assign(
    async (strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join('?')
      if (query.includes('insert into decisions')) {
        const id = String(decisionsDb.length + 1)
        const row = {
          id,
          agency: values[0],
          period: values[1],
          action: values[2],
          amount_stroops: values[3],
          reason: values[4],
          facts_snapshot: values[5],
          model: values[6],
          created_at: new Date(),
        }
        decisionsDb.push(row)
        return [row]
      }
      if (query.includes('insert into remittances')) {
        const row = {
          agency: values[0],
          period: values[1],
          amount_stroops: values[2],
          authorize_tx_hash: values[3],
          claim_tx_hash: values[4],
          nonce: values[5],
          decision_id: values[6],
          created_at: new Date(),
        }
        remittancesDb.push(row)
        return [row]
      }
      if (query.includes('select count(*)::text as count from remittances')) {
        const agency = values[0]
        const period = values[1]
        const cnt = remittancesDb.filter((r) => r.agency === agency && r.period === period).length
        return [{ count: String(cnt) }]
      }
      if (query.includes('select coalesce(sum(amount_stroops), 0)::text as total from client_payments')) {
        return [{ total: '0' }]
      }
      if (query.includes('select * from decisions')) {
        return decisionsDb
      }
      if (query.includes('select r.*, d.reason from remittances')) {
        return remittancesDb
      }
      return []
    },
    {
      json: (val: any) => val,
    },
  ) as any

  beforeEach(() => {
    checkCalls = []
    authorizeCalls = []
    claimCalls = []
    checkResult = { ok: true }
    decisionsDb = []
    remittancesDb = []
    clock.reset()
    process.env.XLM_PHP_RATE = '15.00'
    process.env.AGENT_SECRET = Keypair.random().secret()
    process.env.SSS_AGENCY_SECRET = Keypair.random().secret()
    process.env.PHILHEALTH_AGENCY_SECRET = Keypair.random().secret()
    process.env.PAGIBIG_AGENCY_SECRET = Keypair.random().secret()
    process.env.OWNER_SECRET = Keypair.random().secret()
  })

  test('model failure uses the fallback and states [Fallback] in the reason', async () => {
    // Fast-forward simulated clock to 1 day before deadline
    const deadline = deadlineFor('philhealth', period)
    clock.set(new Date(deadline.getTime() - 24 * 3600_000))

    const failingClaude = async () => {
      throw new Error('Anthropic rate limited')
    }

    const opts: TickEnvOptions = {
      chain: fakeChain,
      reads: fakeReads,
      claudeCaller: failingClaude,
      db: fakeSql,
      period,
    }

    const res = await tickEnvelope('philhealth', opts)
    expect(res.decision.action).toBe('pay')
    expect(res.decision.model).toBe('fallback')
    expect(res.decision.reason).toContain('[Fallback]')
    expect(authorizeCalls.length).toBe(1)
    expect(claimCalls.length).toBe(1)
    expect(decisionsDb.length).toBe(1)
    expect(remittancesDb.length).toBe(1)
  })

  test('with an underfunded envelope, agent waits and no chain write happens', async () => {
    const deadline = deadlineFor('philhealth', period)
    clock.set(new Date(deadline.getTime() - 24 * 3600_000))

    const underfundedReads: EnvelopeReads = {
      async getEscrowBalance() {
        return 0n // 0 escrow balance
      },
      async getPolicy() {
        return { maxAmount: toStroops('500'), expiresAt: deadline }
      },
    }

    const opts: TickEnvOptions = {
      chain: fakeChain,
      reads: underfundedReads,
      claudeCaller: async () => JSON.stringify({ action: 'wait', amount: 0, reason: 'Envelope is underfunded.' }),
      db: fakeSql,
    }

    const res = await tickEnvelope('philhealth', opts)
    expect(res.decision.action).toBe('wait')
    expect(res.decision.amount).toBe(0n)
    expect(authorizeCalls.length).toBe(0)
    expect(claimCalls.length).toBe(0)
    expect(remittancesDb.length).toBe(0)
  })

  test('hard rule overrides a "pay" if deadline has passed', async () => {
    const deadline = deadlineFor('sss', period)
    // Clock is set after the deadline
    clock.set(new Date(deadline.getTime() + 3600_000))

    const payClaude = async () => JSON.stringify({
      action: 'pay',
      amount: '2520000000',
      reason: 'AI says remit now anyway!',
    })

    const opts: TickEnvOptions = {
      chain: fakeChain,
      reads: fakeReads,
      claudeCaller: payClaude,
      db: fakeSql,
      period,
    }

    const res = await tickEnvelope('sss', opts)
    expect(res.blockedByHardRule).toBe('deadline_passed')
    expect(res.decision.action).toBe('wait')
    expect(res.decision.reason).toContain('deadline for SSS')
    expect(res.decision.reason).toContain('has passed')
    expect(authorizeCalls.length).toBe(0)
    expect(claimCalls.length).toBe(0)
  })

  test('hard rule overrides a "pay" if agency was already remitted this period', async () => {
    const deadline = deadlineFor('pagibig', period)
    clock.set(new Date(deadline.getTime() - 24 * 3600_000))

    // Mark as already remitted
    remittancesDb.push({
      agency: 'pagibig',
      period,
      amount_stroops: '266666667',
      authorize_tx_hash: 'tx_prev_auth',
      claim_tx_hash: 'tx_prev_claim',
      nonce: '1',
      decision_id: '1',
      created_at: new Date(),
    })

    const payClaude = async () => JSON.stringify({
      action: 'pay',
      amount: '266666667',
      reason: 'AI wants to remit again',
    })

    const opts: TickEnvOptions = {
      chain: fakeChain,
      reads: fakeReads,
      claudeCaller: payClaude,
      db: fakeSql,
      period,
    }

    const res = await tickEnvelope('pagibig', opts)
    expect(res.blockedByHardRule).toBe('already_remitted')
    expect(res.decision.action).toBe('wait')
    expect(res.decision.reason).toContain('already been remitted for period')
    expect(authorizeCalls.length).toBe(0)
  })

  test('hard rule overrides a "pay" if amount exceeds computed contribution', async () => {
    const deadline = deadlineFor('philhealth', period)
    clock.set(new Date(deadline.getTime() - 24 * 3600_000))

    const payTooMuchClaude = async () => JSON.stringify({
      action: 'pay',
      amount: '9999999999999', // huge amount
      reason: 'AI trying to remit over the contribution cap',
    })

    const opts: TickEnvOptions = {
      chain: fakeChain,
      reads: fakeReads,
      claudeCaller: payTooMuchClaude,
      db: fakeSql,
    }

    const res = await tickEnvelope('philhealth', opts)
    expect(res.blockedByHardRule).toBe('amount_exceeds_contribution')
    expect(res.decision.action).toBe('wait')
    expect(res.decision.reason).toContain('exceeds computed contribution')
    expect(authorizeCalls.length).toBe(0)
  })

  test('a failed checkPayment is explained and nothing is authorized', async () => {
    const deadline = deadlineFor('sss', period)
    clock.set(new Date(deadline.getTime() - 24 * 3600_000))

    // Noir contract checkPayment returns over_limit
    checkResult = { ok: false, reason: 'over_limit' }

    const payClaude = async () => JSON.stringify({
      action: 'pay',
      amount: '2520000000',
      reason: 'Time to remit SSS contribution.',
    })

    const opts: TickEnvOptions = {
      chain: fakeChain,
      reads: fakeReads,
      claudeCaller: payClaude,
      db: fakeSql,
    }

    const res = await tickEnvelope('sss', opts)
    expect(checkCalls.length).toBe(1)
    expect(authorizeCalls.length).toBe(0)
    expect(claimCalls.length).toBe(0)
    expect(res.remittance).toBeNull()
    expect(res.decision.reason).toContain('over_limit')
    expect(res.decision.reason).toContain('exceeds envelope per-remittance cap')
  })

  test('fast-forward sets clock to just before deadline and processes all envelopes', async () => {
    const opts: TickEnvOptions = {
      chain: fakeChain,
      reads: fakeReads,
      claudeCaller: async () => JSON.stringify({ action: 'pay', reason: 'Deadline is approaching, remit.' }),
      db: fakeSql,
    }

    const ff = await fastForward(undefined, opts)
    expect(ff.isSimulated).toBe(true)
    expect(ff.results.length).toBe(3) // sss, philhealth, pagibig
    expect(authorizeCalls.length).toBe(3)
    expect(claimCalls.length).toBe(3)

    // Second run does not remit again (one remittance per agency per period)
    const secondFf = await fastForward(undefined, opts)
    expect(authorizeCalls.length).toBe(3) // still 3, no new calls!
    expect(secondFf.results.every((r) => r.blockedByHardRule === 'already_remitted')).toBe(true)
  })
})
