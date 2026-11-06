// Server-only (node:crypto), so it is a separate entry: import from '@envelo/shared/device'.
import { createHash } from 'node:crypto'
import type { Agency } from './agencies.ts'

/**
 * An envelope's Noir device hash: SHA-256 hex of `envelo:<freelancerId>:<agency>[:<suffix>]`.
 * The freelancer id is the owner account's public key, so a fresh owner never collides with old devices.
 */
export function deviceHash(freelancerId: string, agency: Agency, suffix?: string): string {
  const parts = ['envelo', freelancerId, agency, ...(suffix ? [suffix] : [])]
  return createHash('sha256').update(parts.join(':')).digest('hex')
}
