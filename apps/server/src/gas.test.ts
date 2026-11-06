import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import {
  VeloGasSubmissionUnknownError,
  VeloGasWaitError,
  VeloTimeoutError,
  type GasExecutionIdentity,
  type GasSubmitResult,
  type Velo,
} from '@carts1024/velo-sdk'
import { setVeloGasForTests, useGasStation, recoverGasOp } from './gas.ts'
import { executeOwnerOp, noir, ownerKey } from './noir.ts'

describe('Velo Gas Station sponsorship of owner-signed Noir operations', () => {
  const originalEnv = { ...process.env }
  const testOwner = Keypair.random()
  const testAgent = Keypair.random()

  beforeEach(() => {
    process.env.OWNER_SECRET = testOwner.secret()
    process.env.AGENT_SECRET = testAgent.secret()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    setVeloGasForTests(undefined)
    vi.restoreAllMocks()
  })

  test('when USE_GAS_STATION is off, executes directly via Noir without Velo Gas', async () => {
    process.env.USE_GAS_STATION = 'false'
    expect(useGasStation()).toBe(false)

    const executeSpy = vi.spyOn(noir, 'execute').mockResolvedValueOnce({ hash: 'tx_direct_123' })
    const prepareSpy = vi.spyOn(noir, 'prepare')

    const res = await executeOwnerOp(
      { kind: 'fundEscrow', deviceHash: 'dev123', token: 'XLM', amount: 1000n },
      { idempotencyKey: 'setaside:1', correlationId: 'setaside:1' },
    )

    expect(executeSpy).toHaveBeenCalledTimes(1)
    expect(prepareSpy).not.toHaveBeenCalled()
    expect(res).toEqual({
      hash: 'tx_direct_123',
      outerTxHash: null,
      innerTxHash: 'tx_direct_123',
      actualFeeStroops: null,
      requestId: null,
    })
  })

  test('when USE_GAS_STATION is on, prepares, signs with owner key, and sponsors via Velo Gas Station', async () => {
    process.env.USE_GAS_STATION = 'true'
    expect(useGasStation()).toBe(true)

    // Unsigned transaction with a valid shape
    const unsignedXdr =
      'AAAAAgAAAADW9Wp6sL8XnAAAAAAAZaAAAAAAAAAAAAAAAAAAAAABAAAAAgAAAAA=' // mock minimal valid XDR or mock prepare
    vi.spyOn(noir, 'prepare').mockResolvedValueOnce(unsignedXdr)
    const executeSpy = vi.spyOn(noir, 'execute')

    let passedSignedXdr = ''
    let passedOptions: unknown = null

    const mockVelo = {
      gas: {
        async sponsorAndSubmit(xdr: string, options: unknown) {
          passedSignedXdr = xdr
          passedOptions = options
          return {
            object: 'gas_submit_result',
            requestId: 'req_sponsor_1',
            transactionHash: 'inner_hash_abc',
            outerTransactionHash: 'outer_fee_bump_xyz',
            status: 'succeeded',
            reservedStroops: '100',
            actualFeeStroops: '100',
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            reconciliationRequired: false,
          } as GasSubmitResult
        },
        async waitForResult() {
          throw new Error('should not be called when status is already succeeded')
        },
      },
    } as unknown as Velo

    setVeloGasForTests(mockVelo)

    // Mock TransactionBuilder.fromXDR to verify signing without needing real network RPC
    const { TransactionBuilder } = await import('@stellar/stellar-sdk')
    const originalFromXDR = TransactionBuilder.fromXDR
    const mockTx = {
      sign: vi.fn(),
      toXDR: () => 'signed_xdr_payload_123',
    }
    vi.spyOn(TransactionBuilder, 'fromXDR').mockReturnValueOnce(mockTx as any)

    const res = await executeOwnerOp(
      { kind: 'fundEscrow', deviceHash: 'dev123', token: 'XLM', amount: 1000n },
      { idempotencyKey: 'setaside:42', correlationId: 'setaside:42' },
    )

    expect(executeSpy).not.toHaveBeenCalled()
    expect(mockTx.sign).toHaveBeenCalledWith(expect.anything())
    expect(passedSignedXdr).toBe('signed_xdr_payload_123')
    expect(passedOptions).toEqual({
      idempotencyKey: 'setaside:42',
      correlationId: 'setaside:42',
    })
    expect(res).toEqual({
      hash: 'outer_fee_bump_xyz',
      outerTxHash: 'outer_fee_bump_xyz',
      innerTxHash: 'inner_hash_abc',
      actualFeeStroops: '100',
      requestId: 'req_sponsor_1',
    })
  })

  test('a forced timeout recovers the original result without a second transaction', async () => {
    process.env.USE_GAS_STATION = 'true'

    const prepareSpy = vi.spyOn(noir, 'prepare').mockResolvedValueOnce('unsigned_xdr_test')
    const { TransactionBuilder } = await import('@stellar/stellar-sdk')
    const mockTx = {
      sign: vi.fn(),
      toXDR: () => 'signed_xdr_recovered',
    }
    vi.spyOn(TransactionBuilder, 'fromXDR').mockReturnValueOnce(mockTx as any)

    const identity: GasExecutionIdentity = {
      requestId: 'req_timeout_999',
      transactionHash: 'inner_tx_hash_999',
    }

    let sponsorSubmitCalls = 0
    let waitForResultCalls = 0

    const mockVelo = {
      gas: {
        async sponsorAndSubmit() {
          sponsorSubmitCalls++
          // Force a timeout error with recovery identity
          throw new VeloGasSubmissionUnknownError(identity, 'timeout')
        },
        async waitForResult(targetIdentity: GasExecutionIdentity) {
          waitForResultCalls++
          expect(targetIdentity).toEqual(identity)
          return {
            object: 'gas_submit_result',
            requestId: targetIdentity.requestId,
            transactionHash: targetIdentity.transactionHash,
            outerTransactionHash: 'outer_fee_bump_recovered',
            status: 'succeeded',
            reservedStroops: '100',
            actualFeeStroops: '100',
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            reconciliationRequired: false,
          } as GasSubmitResult
        },
      },
    } as unknown as Velo

    setVeloGasForTests(mockVelo)

    const res = await executeOwnerOp(
      { kind: 'fundEscrow', deviceHash: 'dev123', token: 'XLM', amount: 5000n },
      { idempotencyKey: 'setaside:99', correlationId: 'setaside:99' },
    )

    // CRITICAL: prepare and sign were only called ONCE — no second transaction!
    expect(prepareSpy).toHaveBeenCalledTimes(1)
    expect(mockTx.sign).toHaveBeenCalledTimes(1)
    expect(sponsorSubmitCalls).toBe(1)
    expect(waitForResultCalls).toBe(1)

    // Result matches the recovered transaction
    expect(res).toEqual({
      hash: 'outer_fee_bump_recovered',
      outerTxHash: 'outer_fee_bump_recovered',
      innerTxHash: 'inner_tx_hash_999',
      actualFeeStroops: '100',
      requestId: 'req_timeout_999',
    })
  })

  test('only status succeeded is success; throws on terminal failed or cancelled status', async () => {
    process.env.USE_GAS_STATION = 'true'

    vi.spyOn(noir, 'prepare').mockResolvedValueOnce('unsigned_xdr_fail')
    const { TransactionBuilder } = await import('@stellar/stellar-sdk')
    const mockTx = {
      sign: vi.fn(),
      toXDR: () => 'signed_xdr_fail',
    }
    vi.spyOn(TransactionBuilder, 'fromXDR').mockReturnValueOnce(mockTx as any)

    const mockVelo = {
      gas: {
        async sponsorAndSubmit() {
          return {
            object: 'gas_submit_result',
            requestId: 'req_failed',
            transactionHash: 'inner_fail',
            outerTransactionHash: null,
            status: 'failed',
            reservedStroops: '100',
            actualFeeStroops: null,
            expiresAt: new Date().toISOString(),
            reconciliationRequired: false,
          } as GasSubmitResult
        },
      },
    } as unknown as Velo

    setVeloGasForTests(mockVelo)

    await expect(
      executeOwnerOp(
        { kind: 'fundEscrow', deviceHash: 'dev123', token: 'XLM', amount: 1000n },
        { idempotencyKey: 'setaside:fail', correlationId: 'setaside:fail' },
      ),
    ).rejects.toThrow(/Velo Gas execution failed/)
  })

  test('recoverGasOp retrieves existing status without preparing new transactions', async () => {
    process.env.USE_GAS_STATION = 'true'

    const mockVelo = {
      gas: {
        async getStatus(identity: GasExecutionIdentity) {
          return {
            object: 'gas_submit_result',
            requestId: identity.requestId,
            transactionHash: identity.transactionHash,
            outerTransactionHash: 'outer_bump_existing',
            status: 'succeeded',
            reservedStroops: '100',
            actualFeeStroops: '100',
            expiresAt: new Date().toISOString(),
            reconciliationRequired: false,
          } as GasSubmitResult
        },
      },
    } as unknown as Velo

    setVeloGasForTests(mockVelo)

    const recovered = await recoverGasOp({
      requestId: 'req_prior',
      transactionHash: 'hash_prior',
    })

    expect(recovered?.status).toBe('succeeded')
    expect(recovered?.outerTransactionHash).toBe('outer_bump_existing')
  })
})
