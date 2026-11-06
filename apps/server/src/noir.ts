// Envelo's Noir side: the owner (freelancer) key signs envelope writes, per ADR-0001.
import { Asset, Keypair, Networks } from '@stellar/stellar-sdk'
import { NoirAgentClient, NoirContractError, keypairSigner } from '@noirx402/agent-sdk'
import type { Agency } from '@envelo/shared'
import { deviceHash } from '@envelo/shared/device'

export { NoirContractError }
export const noir = new NoirAgentClient()
export const XLM = Asset.native().contractId(Networks.TESTNET)

const secret = (name: string) => {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set (run pnpm setup:testnet)`)
  return v
}
export const ownerKey = () => Keypair.fromSecret(secret('OWNER_SECRET'))
export const agentKey = () => Keypair.fromSecret(secret('AGENT_SECRET'))
export const agentPublicKey = () => agentKey().publicKey()
export const envelopeHash = (agency: Agency) => deviceHash(ownerKey().publicKey(), agency)

export const agencySecretName: Record<Agency, string> = {
  sss: 'SSS_AGENCY_SECRET',
  philhealth: 'PHILHEALTH_AGENCY_SECRET',
  pagibig: 'PAGIBIG_AGENCY_SECRET',
}

export const agencyKey = (agency: Agency) => Keypair.fromSecret(secret(agencySecretName[agency]))
export const agencyPublicKey = (agency: Agency) => agencyKey(agency).publicKey()

export const chain = {
  async fund(agency: Agency, stroops: bigint) {
    const { hash } = await noir.execute(keypairSigner(ownerKey().secret()), {
      kind: 'fundEscrow',
      deviceHash: envelopeHash(agency),
      token: XLM,
      amount: stroops,
    })
    return hash
  },

  /** Sets the envelope's per-remittance cap. The contract has no update, so revoke + register (escrow is untouched). */
  async ensureCap(agency: Agency, capStroops: bigint, expiresAt: Date) {
    const hash = envelopeHash(agency)
    const policy = await noir.getPolicy(hash)
    if (policy?.maxAmount === capStroops && policy.expiresAt?.getTime() === expiresAt.getTime()) return
    const owner = keypairSigner(ownerKey().secret())
    if (policy) await noir.execute(owner, { kind: 'revokeAgent', deviceHash: hash })
    await noir.execute(owner, { kind: 'registerAgent', deviceHash: hash, agent: agentPublicKey(), asset: XLM, maxAmount: capStroops, expiresAt })
  },
}
export type Chain = typeof chain

export const remittanceChain = {
  checkPayment: (p: Parameters<typeof noir.checkPayment>[0]) => noir.checkPayment(p),
  authorizePayment: (p: Parameters<typeof noir.authorizePayment>[0]) => noir.authorizePayment(p),
  claim: (p: Parameters<typeof noir.claim>[0]) => noir.claim(p),
}
export type RemittanceChain = typeof remittanceChain
