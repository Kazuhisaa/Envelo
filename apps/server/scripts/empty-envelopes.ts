// Demo reset: withdraw everything from the three envelopes back to the owner wallet (defundEscrow),
// so "Sealed in envelopes" starts at ₱0 again. Pair it with a TRUNCATE of the app tables.
// Run from the repo root: pnpm reset:envelopes
import { Asset, Keypair, Networks } from '@stellar/stellar-sdk'
import { NoirAgentClient, fromStroops, keypairSigner } from '@noirx402/agent-sdk'
import { AGENCIES, AGENCY_LABEL } from '@envelo/shared'
import { deviceHash } from '@envelo/shared/device'

const secret = process.env.OWNER_SECRET
if (!secret) throw new Error('OWNER_SECRET is not set (run from the repo root with the .env in place)')
const owner = Keypair.fromSecret(secret)
const noir = new NoirAgentClient()
const xlm = Asset.native().contractId(Networks.TESTNET)

for (const agency of AGENCIES) {
  const hash = deviceHash(owner.publicKey(), agency)
  const balance = await noir.getEscrowBalance(hash)
  if (balance <= 0n) {
    console.log(`${AGENCY_LABEL[agency].padEnd(10)} already empty`)
    continue
  }
  const { hash: tx } = await noir.execute(keypairSigner(owner.secret()), { kind: 'defundEscrow', deviceHash: hash, token: xlm, amount: balance })
  console.log(`${AGENCY_LABEL[agency].padEnd(10)} withdrew ${fromStroops(balance)} XLM  https://stellar.expert/explorer/testnet/tx/${tx}`)
}
