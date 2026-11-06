import { describe, expect, test } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { NoirContractError, toStroops } from '@noirx402/agent-sdk'
import { tryToBreak } from './refusal.ts'
import type { RemittanceChain } from './noir.ts'

// A fake chain that refuses like the contract, a fake db that keeps the inserted decision.
function setup(refusal: 'over_limit' | 'expired') {
  const inserted: unknown[][] = []
  const db = Object.assign(async (_s: TemplateStringsArray, ...values: unknown[]) => (inserted.push(values), []), {
    json: (v: unknown) => v,
  }) as never
  const chain = {
    checkPayment: async () => ({ ok: false, reason: refusal }),
    authorizePayment: async () => {
      throw new NoirContractError('paymentEscrow', 3, refusal === 'over_limit' ? 'OverLimit' : 'PolicyExpired', 'authorize')
    },
    claim: async () => {
      throw new Error('claim must not be called')
    },
  } as unknown as RemittanceChain
  const reads = {
    getEscrowBalance: async () => toStroops('300'),
    getPolicy: async () => ({ maxAmount: toStroops('100'), expiresAt: new Date('2026-10-31T15:59:59Z') }),
  }
  const deps = { chain, reads, db, agentSecret: Keypair.random().secret(), rate: '15.00', hash: 'h', merchant: Keypair.random().publicKey() }
  return { deps, inserted }
}

describe('try to break it (#9)', () => {
  test('over the cap: contract refuses, names the cap, no funds move, logged as refused', async () => {
    const { deps, inserted } = setup('over_limit')
    const r = await tryToBreak('over-cap', deps)
    expect(r.refused).toBe(true)
    expect(r.checkReason).toBe('over_limit')
    expect(r.contractError).toContain('OverLimit')
    expect(r.fundsMoved).toBe(false)
    expect(r.message).toBe('The contract refused: this is more than the ₱1,500 cap you set for SSS.')
    expect(inserted).toHaveLength(1)
    expect(String(inserted[0][2])).toMatch(/^Forced demo: .*The contract refused.*No funds moved.$/)
  })

  test('expired: contract refuses with the expiry date', async () => {
    const { deps } = setup('expired')
    const r = await tryToBreak('expired', deps)
    expect(r.refused).toBe(true)
    expect(r.checkReason).toBe('expired')
    expect(r.message).toBe("The contract refused: last month's authorization ended on October 31, 2026.")
  })
})
