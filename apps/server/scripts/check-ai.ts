// Pre-pitch check: ask the agent's model the two kinds of question it answers, with made-up facts.
// Read-only: no database, no Stellar transaction, nothing is paid. Run from the repo root: pnpm check:ai
import { decideRemittance, geminiModel, prioritizeSetAsides } from '@envelo/agent'

if (!process.env.GEMINI_API_KEY) {
  console.log('GEMINI_API_KEY is not set in .env: the agent would use its fallback rules.')
  process.exit(1)
}

const day = (s: string) => new Date(s)
let failed = false

let t = Date.now()
const split = await prioritizeSetAsides({
  availableCentavos: 1000_00,
  needed: { sss: 760_00, philhealth: 500_00, pagibig: 120_00 },
  deadlines: { sss: day('2026-12-31T15:59:59Z'), philhealth: day('2026-11-30T15:59:59Z'), pagibig: day('2026-12-10T15:59:59Z') },
  balances: { sss: 0, philhealth: 0, pagibig: 0 },
  today: day('2026-11-07T00:00:00Z'),
})
failed ||= split.source !== 'model'
console.log(`Prioritization  ${split.source === 'model' ? 'OK (AI)  ' : 'FALLBACK '} ${Date.now() - t} ms  ${split.reason}`)

t = Date.now()
const decision = await decideRemittance({
  agency: 'philhealth',
  agencyLabel: 'PhilHealth',
  period: '2026-11',
  contributionStroops: 333_333_333n,
  escrowBalanceStroops: 333_333_333n,
  policy: { maxAmount: 3_333_333_333n, expiresAt: day('2026-11-30T15:59:59Z') },
  deadline: day('2026-11-30T15:59:59Z'),
  alreadyRemitted: false,
  now: day('2026-11-30T13:59:59Z'),
  contributionPhpCentavos: 500_00,
  escrowBalancePhpCentavos: 500_00,
})
failed ||= decision.model === 'fallback'
console.log(`Remittance      ${decision.model === 'fallback' ? 'FALLBACK ' : 'OK (AI)  '} ${Date.now() - t} ms  ${decision.action}: ${decision.reason}`)

console.log(failed ? '\nGemini did not answer: the demo still works on the fallback rules, but say so on stage.' : `\nGemini (${geminiModel()}) is answering. Ready for the demo.`)
process.exit(failed ? 1 : 0)
