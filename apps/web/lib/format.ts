import { phpToStroops } from '@envelo/shared'

export const peso = (centavos: number | null) => centavos === null
  ? 'PHP unavailable'
  : `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: centavos % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`

export const xlm = (amount: string) => {
  const stripped = amount.replace(/\s*XLM\s*/gi, '').trim()
  return `${stripped || '0'} XLM`
}


export function month(period: string) {
  const [year, mon] = period.split('-').map(Number)
  return new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(Date.UTC(year, mon - 1, 1)))
}

export function date(value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat('en-PH', { ...options, timeZone: 'Asia/Manila' }).format(new Date(value))
}

export function timestamp(value: string) {
  return date(value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

export function deadlineLabel(value: string, now = new Date()) {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Manila' }).format(d)
  const current = day(now)
  const due = day(new Date(value))
  if (due < current) return 'Deadline passed'
  if (due === current) return 'Due today'
  const remaining = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${current}T00:00:00Z`)) / 86_400_000)
  return `${remaining} day${remaining === 1 ? '' : 's'} left`
}

export function parsePhp(input: string): number | null {
  const clean = input.trim().replaceAll(',', '')
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(clean)) return null
  const [whole, part = ''] = clean.split('.')
  const value = Number(whole) * 100 + Number(part.padEnd(2, '0'))
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

export function phpToXlm(centavos: number, rate: string): string {
  const stroops = phpToStroops(centavos, rate)
  if (stroops <= 0n) throw new Error('Amount is too small at this rate')
  const whole = stroops / 10_000_000n
  const fraction = (stroops % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

export const explorer = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${encodeURIComponent(hash)}`
