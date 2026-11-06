// pnpm setup:testnet — builds (or tops up) the whole Testnet world the demo needs. Safe to run again:
// existing keys in .env are reused and already-registered envelopes are skipped.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Asset, Horizon, Keypair, Networks } from '@stellar/stellar-sdk'
import { NoirAgentClient, keypairSigner, toStroops } from '@noirx402/agent-sdk'
import { AGENCIES, AGENCY_LABEL, deadlineFor, periodOf, type Agency } from '@envelo/shared'
import { deviceHash } from '@envelo/shared/device'

const ENV_FILE = new URL('../../../.env', import.meta.url)
const ENV_EXAMPLE = new URL('../../../.env.example', import.meta.url)
const ACCOUNTS = {
  OWNER_SECRET: 'owner',
  AGENT_SECRET: 'agent',
  SSS_AGENCY_SECRET: 'SSS agency',
  PHILHEALTH_AGENCY_SECRET: 'PhilHealth agency',
  PAGIBIG_AGENCY_SECRET: 'Pag-IBIG agency',
} as const

// ponytail: placeholder per-remittance cap; the set-aside ticket (#6) sets the real one.
const PLACEHOLDER_CAP = toStroops('500')
const EXPIRED_DEMO = { cap: toStroops('100'), fund: toStroops('1'), expiresInMs: 2 * 60_000 }

const horizon = new Horizon.Server('https://horizon-testnet.stellar.org')
const noir = new NoirAgentClient()
const xlm = Asset.native().contractId(Networks.TESTNET)
const txLink = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`

function writeEnv(updates: Record<string, string>) {
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : readFileSync(ENV_EXAMPLE, 'utf8')
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`
    text = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line) : `${text.trimEnd()}\n${line}\n`
  }
  writeFileSync(ENV_FILE, text)
}

async function ensureFunded(kp: Keypair, label: string) {
  try {
    await horizon.loadAccount(kp.publicKey())
    console.log(`  ${label}: exists ${kp.publicKey()}`)
  } catch {
    const res = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`)
    if (!res.ok) throw new Error(`Friendbot failed for ${label}: ${res.status} ${await res.text()}`)
    console.log(`  ${label}: funded by Friendbot ${kp.publicKey()}`)
  }
}

async function ensureEnvelope(p: { owner: Keypair; agent: string; hash: string; label: string; cap: bigint; expiresAt: Date; fund?: bigint }) {
  const signer = keypairSigner(p.owner.secret())
  const currentOwner = await noir.getDeviceOwner(p.hash)
  if (currentOwner === null) {
    const { hash } = await noir.execute(signer, { kind: 'registerDevice', deviceHash: p.hash, agent: p.agent })
    console.log(`  ${p.label}: registerDevice ${txLink(hash)}`)
  } else if (currentOwner !== p.owner.publicKey()) {
    throw new Error(`${p.label}: device ${p.hash} belongs to ${currentOwner}, not this owner`)
  } else {
    console.log(`  ${p.label}: device already registered`)
  }

  if ((await noir.getPolicy(p.hash)) === null) {
    const { hash } = await noir.execute(signer, {
      kind: 'registerAgent',
      deviceHash: p.hash,
      agent: p.agent,
      asset: xlm,
      maxAmount: p.cap,
      expiresAt: p.expiresAt,
    })
    console.log(`  ${p.label}: registerAgent (expires ${p.expiresAt.toISOString()}) ${txLink(hash)}`)
  } else {
    console.log(`  ${p.label}: policy already set`)
  }

  if (p.fund && (await noir.getEscrowBalance(p.hash)) === 0n) {
    const { hash } = await noir.execute(signer, { kind: 'fundEscrow', deviceHash: p.hash, token: xlm, amount: p.fund })
    console.log(`  ${p.label}: fundEscrow ${txLink(hash)}`)
  }
}

console.log('Accounts')
const keys = {} as Record<keyof typeof ACCOUNTS, Keypair>
const created: Record<string, string> = {}
for (const env of Object.keys(ACCOUNTS) as (keyof typeof ACCOUNTS)[]) {
  const existing = process.env[env]
  keys[env] = existing ? Keypair.fromSecret(existing) : Keypair.random()
  if (!existing) created[env] = keys[env].secret()
}
if (Object.keys(created).length) writeEnv(created) // write before funding, so a crash never loses a key
for (const [env, label] of Object.entries(ACCOUNTS) as [keyof typeof ACCOUNTS, string][]) await ensureFunded(keys[env], label)

const owner = keys.OWNER_SECRET
const agent = keys.AGENT_SECRET.publicKey()
const period = periodOf(new Date())

console.log(`\nEnvelopes for period ${period} (freelancer = owner ${owner.publicKey()})`)
const envelopes: { label: string; hash: string }[] = []
for (const agency of AGENCIES) {
  const hash = deviceHash(owner.publicKey(), agency)
  envelopes.push({ label: AGENCY_LABEL[agency], hash })
  await ensureEnvelope({ owner, agent, hash, label: AGENCY_LABEL[agency], cap: PLACEHOLDER_CAP, expiresAt: deadlineFor(agency, period) })
}
const expiredHash = deviceHash(owner.publicKey(), 'sss' satisfies Agency, 'expired-demo')
envelopes.push({ label: 'SSS expired demo', hash: expiredHash })
await ensureEnvelope({
  owner,
  agent,
  hash: expiredHash,
  label: 'SSS expired demo',
  cap: EXPIRED_DEMO.cap,
  expiresAt: new Date(Date.now() + EXPIRED_DEMO.expiresInMs),
  fund: EXPIRED_DEMO.fund,
})

console.log('\nCheck (1 XLM remittance from each envelope)')
for (const e of envelopes) {
  const check = await noir.checkPayment({ deviceHash: e.hash, agent, asset: xlm, amount: toStroops('1') })
  console.log(`  ${e.label.padEnd(18)} ${e.hash}  ${check.ok ? 'ok' : check.reason}`)
}
console.log(`\nDevices owned: ${(await noir.listDevices(owner.publicKey())).length}`)
console.log(Object.keys(created).length ? `New secrets written to .env: ${Object.keys(created).join(', ')}` : 'All keys reused from .env')
console.log(`Owner on Stellar Expert: https://stellar.expert/explorer/testnet/account/${owner.publicKey()}`)
