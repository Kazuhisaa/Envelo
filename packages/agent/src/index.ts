import { AGENCIES, AGENCY_LABEL, type Agency } from '@envelo/shared'
import type { PrioritizeInput, PrioritizeResult } from './prioritize/types.ts'
import { SYSTEM_PROMPT, buildUserPrompt } from './prioritize/prompt.ts'
import { validateAllocation } from './prioritize/schema.ts'
import { defaultClaudeClient, type ClaudeClient } from './prioritize/claude.ts'

export * from './prioritize/types.ts'
export * from './prioritize/schema.ts'
export * from './prioritize/prompt.ts'
export * from './prioritize/claude.ts'

/** Split `available` in proportion to `needed`, never above a need. Total ≤ available. */
export function proportionalSplit(availableCentavos: number, needed: Record<Agency, number>): Record<Agency, number> {
  const total = AGENCIES.reduce((s, a) => s + needed[a], 0)
  const amounts = { sss: 0, philhealth: 0, pagibig: 0 }
  if (total <= 0 || availableCentavos <= 0) return amounts
  for (const a of AGENCIES) amounts[a] = Math.min(needed[a], Math.floor((availableCentavos * needed[a]) / total))
  return amounts
}

export type PrioritizeDeps = {
  client?: ClaudeClient
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
 * Queries Claude Sonnet 5.5 for a structured allocation.
 * If the API call fails, times out, or returns an invalid allocation, falls back to proportional split.
 */
export async function prioritizeSetAsides(
  input: PrioritizeInput,
  deps: PrioritizeDeps = {},
): Promise<PrioritizeResult> {
  const apiKey = deps.apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return fallbackResult(input, 'the Claude API key is not configured.')
  }

  const client = deps.client ?? defaultClaudeClient
  const timeoutMs = deps.timeoutMs ?? 10_000

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let raw: unknown
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

    const validated = validateAllocation(raw, input)
    if (!validated.ok) {
      console.warn(`[agent] Allocation validation failed: ${validated.cause}`)
      return fallbackResult(input, 'the suggested allocation was invalid.')
    }

    return {
      amounts: validated.amounts,
      reason: validated.reason,
      source: 'claude',
    }
  } catch (err: unknown) {
    const isAbort =
      (err instanceof Error && err.name === 'AbortError') ||
      (typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'AbortError')
    if (isAbort) {
      console.warn(`[agent] Prioritization timed out after ${timeoutMs}ms`)
      return fallbackResult(input, 'the AI decision timed out.')
    }

    console.warn('[agent] Error during Claude prioritization:', err)
    return fallbackResult(input, 'the AI service encountered an error.')
  }
}
