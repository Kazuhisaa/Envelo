import { AGENCIES, AGENCY_LABEL, type Agency } from '@envelo/shared'
import type { PrioritizeInput, PrioritizeResult } from './prioritize/types.ts'
import { SYSTEM_PROMPT, buildUserPrompt } from './prioritize/prompt.ts'
import { validateAllocation } from './prioritize/schema.ts'
import { geminiJson, geminiModel } from './gemini.ts'

export * from './prioritize/types.ts'
export * from './prioritize/schema.ts'
export * from './prioritize/prompt.ts'
export { geminiModel } from './gemini.ts'

/** Model seam (faked in tests): returns the model's raw JSON text. */
export type ModelClient = typeof geminiJson

/** Split `available` in proportion to `needed`, never above a need. Total ≤ available. */
export function proportionalSplit(availableCentavos: number, needed: Record<Agency, number>): Record<Agency, number> {
  const total = AGENCIES.reduce((s, a) => s + needed[a], 0)
  const amounts = { sss: 0, philhealth: 0, pagibig: 0 }
  if (total <= 0 || availableCentavos <= 0) return amounts
  for (const a of AGENCIES) amounts[a] = Math.min(needed[a], Math.floor((availableCentavos * needed[a]) / total))
  return amounts
}

export type PrioritizeDeps = {
  client?: ModelClient
  apiKey?: string
  timeoutMs?: number
}

function fallbackResult(input: PrioritizeInput, reasonSuffix: string): PrioritizeResult {
  return {
    amounts: proportionalSplit(input.availableCentavos, input.needed),
    reason: `I split it proportionally because ${reasonSuffix} (in proportion to what each envelope still needs).`,
    source: 'fallback',
  }
}

/**
 * Prioritize set-asides when a client payment cannot cover every needed set-aside.
 * Asks Gemini for a structured JSON allocation.
 * If the API call fails, times out, or returns an invalid allocation, falls back to proportional split.
 */
export async function prioritizeSetAsides(
  input: PrioritizeInput,
  deps: PrioritizeDeps = {},
): Promise<PrioritizeResult> {
  const apiKey = deps.apiKey ?? process.env.GEMINI_API_KEY
  if (!apiKey) {
    return fallbackResult(input, 'the Gemini API key is not configured.')
  }

  const client = deps.client ?? geminiJson
  const timeoutMs = deps.timeoutMs ?? 10_000

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let raw: string
    try {
      raw = await client({
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(input),
        apiKey,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    const validated = validateAllocation(JSON.parse(raw), input)
    if (!validated.ok) {
      console.warn(`[agent] Allocation validation failed: ${validated.cause}`)
      return fallbackResult(input, 'the suggested allocation was invalid.')
    }

    return {
      amounts: validated.amounts,
      reason: validated.reason,
      source: 'model',
    }
  } catch (err: unknown) {
    const isAbort =
      (err instanceof Error && err.name === 'AbortError') ||
      (typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'AbortError')
    if (isAbort) {
      console.warn(`[agent] Prioritization timed out after ${timeoutMs}ms`)
      return fallbackResult(input, 'the AI decision timed out.')
    }

    console.warn('[agent] Error during Gemini prioritization:', err)
    return fallbackResult(input, 'the AI service encountered an error.')
  }
}

// --- Remittance decision layer ---

export type RemittanceFacts = {
  agency: Agency
  period: string
  contributionStroops: bigint
  escrowBalanceStroops: bigint
  policy: {
    maxAmount: bigint
    expiresAt: Date | null
  } | null
  deadline: Date
  alreadyRemitted: boolean
  now: Date
  agencyLabel?: string
  contributionPhpCentavos?: number
  escrowBalancePhpCentavos?: number
}

export type RemittanceAction = 'pay' | 'wait' | 'ask_user'

export type RemittanceDecision = {
  action: RemittanceAction
  amount: bigint
  reason: string
  model: string
}

export type ModelCaller = (prompt: string, system: string) => Promise<string>

export type DecideOptions = {
  apiKey?: string
  caller?: ModelCaller
  model?: string
}

/** Fallback rule when the model fails: pay when the envelope holds the full contribution and the deadline is ≤ 2 days away, otherwise wait. */
export function fallbackDecision(facts: RemittanceFacts): RemittanceDecision {
  const msToDeadline = facts.deadline.getTime() - facts.now.getTime()
  const isWithinTwoDays = msToDeadline >= 0 && msToDeadline <= 2 * 24 * 60 * 60 * 1000
  const hasFullContribution = facts.escrowBalanceStroops >= facts.contributionStroops && facts.contributionStroops > 0n

  if (hasFullContribution && isWithinTwoDays) {
    return {
      action: 'pay',
      amount: facts.contributionStroops,
      reason: '[Fallback] The envelope holds the full contribution and the deadline is ≤ 2 days away, so remitting now.',
      model: 'fallback',
    }
  }

  const why = !hasFullContribution
    ? 'the envelope does not hold the full contribution yet'
    : msToDeadline < 0
    ? 'the deadline has already passed'
    : 'the deadline is more than 2 days away'

  return {
    action: 'wait',
    amount: 0n,
    reason: `[Fallback] Waiting because ${why}.`,
    model: 'fallback',
  }
}

/**
 * Hard rules (code, after the AI, before the chain):
 * 1. no remittance after the deadline
 * 2. one remittance per agency per period
 * 3. amount never above the computed contribution
 * A rule that blocks a "pay" decision returns action: 'wait' with its own reason.
 */
export function applyHardRules(decision: RemittanceDecision, facts: RemittanceFacts): { decision: RemittanceDecision; blocked: boolean; rule?: string } {
  if (decision.action !== 'pay') {
    return { decision, blocked: false }
  }

  const agencyName = AGENCY_LABEL[facts.agency] ?? facts.agency

  if (facts.now.getTime() > facts.deadline.getTime()) {
    return {
      decision: {
        action: 'wait',
        amount: 0n,
        reason: `Remittance blocked: deadline for ${agencyName} (${facts.deadline.toISOString()}) has passed.`,
        model: decision.model,
      },
      blocked: true,
      rule: 'deadline_passed',
    }
  }

  if (facts.alreadyRemitted) {
    return {
      decision: {
        action: 'wait',
        amount: 0n,
        reason: `Remittance blocked: ${agencyName} has already been remitted for period ${facts.period}.`,
        model: decision.model,
      },
      blocked: true,
      rule: 'already_remitted',
    }
  }

  if (decision.amount > facts.contributionStroops) {
    return {
      decision: {
        action: 'wait',
        amount: 0n,
        reason: `Remittance blocked: remittance amount exceeds computed contribution of ${facts.contributionStroops.toString()} stroops.`,
        model: decision.model,
      },
      blocked: true,
      rule: 'amount_exceeds_contribution',
    }
  }

  if (decision.amount <= 0n) {
    return {
      decision: {
        action: 'wait',
        amount: 0n,
        reason: 'Remittance blocked: remittance amount must be greater than zero.',
        model: decision.model,
      },
      blocked: true,
      rule: 'invalid_amount',
    }
  }

  return { decision, blocked: false }
}

const REMITTANCE_SYSTEM_PROMPT = `You are Envelo's remittance decision agent. Your job is to decide whether to remit a government contribution for a Filipino freelancer.
You must follow these glossary terms: client payment, set-aside, envelope, remittance, period, deadline, decision. Never refer to an unqualified payment.

Rules:
1. No remittance after the deadline.
2. One remittance per agency per period.
3. Amount must never exceed the computed contribution.
4. If the envelope holds the full contribution and the deadline is within 2 days, decide 'pay'.
5. If the envelope is underfunded or the deadline is still far away, decide 'wait'.
6. If the situation is ambiguous or holds unusual discrepancies, decide 'ask_user'.

You MUST respond with valid JSON only in this exact schema, with no markdown formatting or prose:
{
  "action": "pay" | "wait" | "ask_user",
  "amount": "<stroops integer as string or number>",
  "reason": "<one sentence readable for the freelancer explaining the decision>"
}`

export async function decideRemittance(facts: RemittanceFacts, options?: DecideOptions): Promise<RemittanceDecision> {
  const modelName = options?.model ?? geminiModel()
  const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY

  const userPrompt = JSON.stringify({
    agency: facts.agency,
    agencyLabel: AGENCY_LABEL[facts.agency] ?? facts.agency,
    period: facts.period,
    contributionStroops: facts.contributionStroops.toString(),
    escrowBalanceStroops: facts.escrowBalanceStroops.toString(),
    policyCapStroops: facts.policy?.maxAmount.toString() ?? null,
    policyExpiresAt: facts.policy?.expiresAt?.toISOString() ?? null,
    deadline: facts.deadline.toISOString(),
    alreadyRemittedThisPeriod: facts.alreadyRemitted,
    now: facts.now.toISOString(),
    isWithinTwoDays: facts.deadline.getTime() - facts.now.getTime() <= 2 * 24 * 60 * 60 * 1000,
    hasFullContribution: facts.escrowBalanceStroops >= facts.contributionStroops,
  })

  let rawResponse = ''
  try {
    if (options?.caller) {
      rawResponse = await options.caller(userPrompt, REMITTANCE_SYSTEM_PROMPT)
    } else {
      if (!apiKey) {
        return fallbackDecision(facts)
      }

      rawResponse = await geminiJson({ system: REMITTANCE_SYSTEM_PROMPT, user: userPrompt, apiKey })
    }

    // Clean JSON string (remove markdown code fences if present)
    const cleaned = rawResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned) as { action?: string; amount?: string | number; reason?: string }

    if (!parsed || (parsed.action !== 'pay' && parsed.action !== 'wait' && parsed.action !== 'ask_user')) {
      return fallbackDecision(facts)
    }

    if (typeof parsed.reason !== 'string' || !parsed.reason.trim()) {
      return fallbackDecision(facts)
    }

    let amount = 0n
    if (parsed.action === 'pay') {
      try {
        amount = BigInt(parsed.amount ?? facts.contributionStroops.toString())
      } catch {
        amount = facts.contributionStroops
      }
    }

    return {
      action: parsed.action,
      amount,
      reason: parsed.reason.trim(),
      model: modelName,
    }
  } catch (err) {
    console.warn('decideRemittance error, using fallback:', err)
    return fallbackDecision(facts)
  }
}
