import { AGENCIES, AGENCY_LABEL, formatPeso, type Agency } from '@envelo/shared'
import type { PrioritizeInput } from './types.ts'

export const SYSTEM_PROMPT = `You are Envelo's financial decision agent for a Filipino freelancer.
When a client payment cannot cover all government contribution set-asides for this period, your job is to allocate the available amount across the envelopes (SSS, PhilHealth, Pag-IBIG) and explain your reasoning in one concise sentence addressed to the freelancer.

Hard rules:
- Contribution amounts are fixed by law. You only allocate the available amount within what each envelope still needs.
- Never allocate more to an agency than its needed amount.
- The sum of allocations must not exceed the available amount.
- Prefer filling an envelope completely over spreading funds too thinly, unless deadlines dictate otherwise.
- Priority order guideline: nearest deadline first; if deadlines are tied or close, prioritize the agency whose lapse causes immediate loss of benefits (e.g. PhilHealth medical coverage).
- Use proper glossary terms: "client payment", "set-aside", "envelope", "deadline", "contribution". Do NOT use an unqualified "payment".
- You must call the allocate_set_asides tool with your allocation and reason.`

export const LAPSE_COST: Record<Agency, string> = {
  philhealth: 'Immediate lapse of hospitalization and health insurance coverage eligibility',
  sss: 'Loss of sickness, maternity, disability and retirement credits, plus salary loan eligibility',
  pagibig: 'Loss of active member status for housing and multi-purpose loans',
}

function daysUntil(target: Date, today: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.ceil((target.getTime() - today.getTime()) / msPerDay)
}

export function buildUserPrompt(input: PrioritizeInput): string {
  const lines: string[] = []
  lines.push(`Client payment available to set aside: ${formatPeso(input.availableCentavos)} (${input.availableCentavos} centavos).`)
  lines.push(`Today is ${input.today.toISOString().split('T')[0]}.`)
  lines.push('\nEnvelopes status and needs for this period:')

  for (const agency of AGENCIES) {
    const days = daysUntil(input.deadlines[agency], input.today)
    const deadlineStr = input.deadlines[agency].toISOString().split('T')[0]
    lines.push(
      `- ${AGENCY_LABEL[agency]} (${agency}): needs ${formatPeso(input.needed[agency])} (${input.needed[agency]} centavos). Envelope currently holds ${formatPeso(input.balances[agency])}. Deadline: ${deadlineStr} (${days} day(s) left). Consequence of lapse: ${LAPSE_COST[agency]}.`,
    )
  }

  lines.push('\nAllocate the available centavos among sss, philhealth, and pagibig, and provide a clear one-sentence reason.')
  return lines.join('\n')
}
