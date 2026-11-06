import {
  Velo,
  VeloGasSubmissionUnknownError,
  VeloGasWaitError,
  VeloTimeoutError,
  type GasExecutionIdentity,
  type GasSubmitResult,
} from '@carts1024/velo-sdk'

export type ChainTxResult = {
  hash: string
  outerTxHash: string | null
  innerTxHash: string | null
  actualFeeStroops: string | null
  requestId?: string | null
}

let gasClient: Velo | undefined

export const veloGas = () =>
  (gasClient ??= new Velo({
    apiKey: process.env.VELO_GAS_API_KEY ?? '',
    baseUrl: process.env.VELO_GAS_BASE_URL ?? 'https://www.velo-build.dev',
    environment: 'testnet',
  }))

export const setVeloGasForTests = (fake?: Velo) => (gasClient = fake)

export const useGasStation = () => process.env.USE_GAS_STATION === 'true' || process.env.USE_GAS_STATION === '1'

/**
 * Sponsors and submits a signed Noir transaction XDR via Velo Gas Station.
 * If a timeout occurs, recovers via getStatus / waitForResult without creating
 * or signing a new transaction. Only status: 'succeeded' is success.
 */
export async function sponsorAndSubmitSignedXdr(
  signedXdr: string,
  options: { idempotencyKey: string; correlationId?: string },
): Promise<ChainTxResult> {
  const velo = veloGas()
  let result: GasSubmitResult

  try {
    result = await velo.gas.sponsorAndSubmit(signedXdr, {
      idempotencyKey: options.idempotencyKey,
      correlationId: options.correlationId,
    })
  } catch (err) {
    if (err instanceof VeloGasSubmissionUnknownError || err instanceof VeloGasWaitError) {
      result = await velo.gas.waitForResult(err.recovery, {
        correlationId: options.correlationId,
      })
    } else if (
      err instanceof VeloTimeoutError ||
      (err instanceof Error && (err.name === 'VeloTimeoutError' || err.message.toLowerCase().includes('timeout')))
    ) {
      // Sponsorship timed out: replay sponsor with the exact same signedXdr and idempotencyKey to recover reservation
      const reservation = await velo.gas.sponsor(signedXdr, {
        idempotencyKey: options.idempotencyKey,
        correlationId: options.correlationId,
      })
      const identity: GasExecutionIdentity = {
        requestId: reservation.requestId,
        transactionHash: reservation.transactionHash,
      }
      result = await velo.gas.waitForResult(identity, {
        correlationId: options.correlationId,
      })
    } else {
      throw err
    }
  }

  // Only status: 'succeeded' is success. If still running, wait for terminal result.
  if (result.status !== 'succeeded') {
    if (result.status === 'failed' || result.status === 'cancelled') {
      throw new Error(`Velo Gas execution ${result.status}`)
    }
    const settled = await velo.gas.waitForResult(
      { requestId: result.requestId, transactionHash: result.transactionHash },
      { correlationId: options.correlationId },
    )
    if (settled.status !== 'succeeded') {
      throw new Error(`Velo Gas execution ${settled.status}`)
    }
    result = settled
  }

  return {
    hash: result.outerTransactionHash ?? result.transactionHash,
    outerTxHash: result.outerTransactionHash,
    innerTxHash: result.transactionHash,
    actualFeeStroops: result.actualFeeStroops,
    requestId: result.requestId,
  }
}

/**
 * Recovers an in-flight gas sponsorship by its identity without submitting a new transaction.
 */
export async function recoverGasOp(
  identity: GasExecutionIdentity,
  options?: { correlationId?: string },
): Promise<GasSubmitResult | null> {
  if (!useGasStation()) return null
  const velo = veloGas()
  const status = await velo.gas.getStatus(identity, options)
  if (status.status === 'succeeded') return status
  if (status.status === 'failed' || status.status === 'cancelled') {
    throw new Error(`Velo Gas execution ${status.status}`)
  }
  const settled = await velo.gas.waitForResult(identity, options)
  if (settled.status !== 'succeeded') {
    throw new Error(`Velo Gas execution ${settled.status}`)
  }
  return settled
}
