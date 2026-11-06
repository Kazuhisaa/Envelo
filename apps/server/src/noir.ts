// Envelo's Noir side: the owner (freelancer) key signs envelope writes, per ADR-0001.
import { Asset, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk'
import { NoirAgentClient, NoirContractError, keypairSigner, type NoirOperation } from '@noirx402/agent-sdk'
import type { Agency } from '@envelo/shared'
import { deviceHash } from '@envelo/shared/device'
import { sponsorAndSubmitSignedXdr, useGasStation, type ChainTxResult } from './gas.ts'

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

/**
 * Executes an owner-signed Noir operation (fundEscrow, registerAgent).
 * When USE_GAS_STATION is enabled, prepares the transaction, signs with the owner key,
 * and sponsors the fees via Velo Gas Station (visible as fee-bump on Stellar Expert).
 * When disabled, submits directly via Soroban RPC.
 */
export async function executeOwnerOp(
  op: NoirOperation,
  options: { idempotencyKey: string; correlationId?: string },
): Promise<ChainTxResult> {
  const owner = ownerKey()

  if (!useGasStation()) {
    const { hash } = await noir.execute(keypairSigner(owner.secret()), op)
    return {
      hash,
      outerTxHash: null,
      innerTxHash: hash,
      actualFeeStroops: null,
      requestId: null,
    }
  }

  // 1. Prepare unsigned transaction XDR
  const unsignedXdr = await noir.prepare(owner.publicKey(), op)

  // 2. Sign with owner key
  const tx = TransactionBuilder.fromXDR(unsignedXdr, noir.config.networkPassphrase)
  tx.sign(owner)
  const signedXdr = tx.toXDR()

  // 3. Sponsor and submit to Velo Gas Station
  return sponsorAndSubmitSignedXdr(signedXdr, options)
}

export const chain = {
  async fund(
    agency: Agency,
    stroops: bigint,
    options?: { idempotencyKey?: string; correlationId?: string; setAsideId?: string | number },
  ): Promise<ChainTxResult> {
    const hash = envelopeHash(agency)
    const idempotencyKey =
      options?.idempotencyKey ??
      (options?.setAsideId ? `setaside:${options.setAsideId}` : `fund:${hash}:${stroops}:${Date.now()}`)
    const correlationId =
      options?.correlationId ?? (options?.setAsideId ? `setaside:${options.setAsideId}` : undefined)

    return executeOwnerOp(
      {
        kind: 'fundEscrow',
        deviceHash: hash,
        token: XLM,
        amount: stroops,
      },
      { idempotencyKey, correlationId },
    )
  },

  /** Sets the envelope's per-remittance cap. The contract has no update, so revoke + register (escrow is untouched). */
  async ensureCap(agency: Agency, capStroops: bigint, expiresAt: Date) {
    const hash = envelopeHash(agency)
    const policy = await noir.getPolicy(hash)
    if (policy?.maxAmount === capStroops && policy.expiresAt?.getTime() === expiresAt.getTime()) return
    const owner = keypairSigner(ownerKey().secret())
    if (policy) await noir.execute(owner, { kind: 'revokeAgent', deviceHash: hash })
    return executeOwnerOp(
      {
        kind: 'registerAgent',
        deviceHash: hash,
        agent: agentPublicKey(),
        asset: XLM,
        maxAmount: capStroops,
        expiresAt,
      },
      {
        idempotencyKey: `registerAgent:${hash}:${capStroops}:${expiresAt.getTime()}`,
        correlationId: `cap:${agency}:${hash.slice(0, 16)}`,
      },
    )
  },
}
export type Chain = {
  fund(
    agency: Agency,
    stroops: bigint,
    options?: { idempotencyKey?: string; correlationId?: string; setAsideId?: string | number },
  ): Promise<ChainTxResult | string>
  ensureCap(agency: Agency, capStroops: bigint, expiresAt: Date): Promise<unknown>
}

export const remittanceChain = {
  checkPayment: (p: Parameters<typeof noir.checkPayment>[0]) => noir.checkPayment(p),
  authorizePayment: (p: Parameters<typeof noir.authorizePayment>[0]) => noir.authorizePayment(p),
  claim: (p: Parameters<typeof noir.claim>[0]) => noir.claim(p),
}
export type RemittanceChain = typeof remittanceChain
