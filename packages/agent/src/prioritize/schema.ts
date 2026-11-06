import { z } from 'zod'
import { AGENCIES, type Agency } from '@envelo/shared'
import type { PrioritizeInput } from './types.ts'

const centavos = z.number().int().nonnegative()

/** What the model must return: centavos per agency, plus one sentence for the freelancer. */
export const AllocationSchema = z.object({
  sss: centavos.describe('Centavos to set aside for SSS from this client payment'),
  philhealth: centavos.describe('Centavos to set aside for PhilHealth from this client payment'),
  pagibig: centavos.describe('Centavos to set aside for Pag-IBIG from this client payment'),
  reason: z.string().trim().min(1).max(300).describe('One plain sentence for the freelancer explaining the order'),
})
export type Allocation = z.infer<typeof AllocationSchema>

/** JSON Schema for the Claude tool, derived from the same zod schema. */
export const allocationJsonSchema = z.toJSONSchema(AllocationSchema)

export type Validated = { ok: true; amounts: Record<Agency, number>; reason: string } | { ok: false; cause: string }

/** Shape check, then the hard rules: no agency above its need, total within what is available. */
export function validateAllocation(raw: unknown, input: PrioritizeInput): Validated {
  const parsed = AllocationSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, cause: `invalid shape: ${parsed.error.issues.map((i) => i.message).join('; ')}` }
  const a = parsed.data
  for (const agency of AGENCIES) {
    if (a[agency] > input.needed[agency]) return { ok: false, cause: `${agency} ${a[agency]} > needed ${input.needed[agency]}` }
  }
  const total = AGENCIES.reduce((s, agency) => s + a[agency], 0)
  if (total > input.availableCentavos) return { ok: false, cause: `total ${total} > available ${input.availableCentavos}` }
  return { ok: true, amounts: { sss: a.sss, philhealth: a.philhealth, pagibig: a.pagibig }, reason: a.reason }
}
