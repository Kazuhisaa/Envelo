import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sql } from './db.ts'

const COOKIE = 'envelo_session'
const MAX_FAILURES = 5
const WINDOW_MS = 15 * 60_000
const HASH_KEY_BYTES = 32
const TOKEN_BYTES = 32
const DEFAULT_TTL_DAYS = 7
const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1

export type AuthSession = { id: string; email: string; expiresAt: Date }
export type AuthEnv = { Variables: { authSession: AuthSession } }

type SessionRow = { id: string; expires_at: Date; last_seen_at: Date }
type PasswordRecord = { n: number; r: number; p: number; salt: Buffer; digest: Buffer }

function deriveKey(password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number; maxmem: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, key) => error ? reject(error) : resolve(key))
  })
}

const hashToken = (value: string) => createHash('sha256').update(value).digest('hex')
const normalizeEmail = (value: string) => value.trim().toLowerCase()
const configuredEmail = () => normalizeEmail(process.env.AUTH_EMAIL ?? '')

function ttlMs() {
  const days = Number(process.env.SESSION_TTL_DAYS ?? DEFAULT_TTL_DAYS)
  return (Number.isFinite(days) && days > 0 ? days : DEFAULT_TTL_DAYS) * 24 * 60 * 60_000
}

function parsePasswordRecord(encoded: string): PasswordRecord {
  const [kind, nText, rText, pText, saltText, digestText, ...extra] = encoded.split('$')
  const n = Number(nText)
  const r = Number(rText)
  const p = Number(pText)
  if (
    kind !== 'scrypt' || extra.length ||
    !Number.isInteger(n) || n < 2 || n > 1_048_576 ||
    !Number.isInteger(r) || r < 1 || r > 32 ||
    !Number.isInteger(p) || p < 1 || p > 16
  ) throw new Error('AUTH_PASSWORD_SCRYPT has an invalid format')
  const salt = Buffer.from(saltText ?? '', 'base64url')
  const digest = Buffer.from(digestText ?? '', 'base64url')
  if (salt.length < 16 || digest.length !== HASH_KEY_BYTES) throw new Error('AUTH_PASSWORD_SCRYPT has an invalid format')
  return { n, r, p, salt, digest }
}

export async function hashPassword(password: string, salt = randomBytes(16)) {
  if (!password) throw new Error('Password cannot be empty')
  const digest = await deriveKey(password, salt, HASH_KEY_BYTES, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024,
  })
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64url'), digest.toString('base64url')].join('$')
}

export async function verifyPassword(password: string, encoded: string) {
  const record = parsePasswordRecord(encoded)
  const actual = await deriveKey(password, record.salt, record.digest.length, {
    N: record.n, r: record.r, p: record.p, maxmem: 128 * record.n * record.r + 16 * 1024 * 1024,
  })
  return timingSafeEqual(actual, record.digest)
}

function clientAddress(c: Context) {
  return (c.req.header('x-forwarded-for')?.split(',')[0] ?? c.req.header('x-real-ip') ?? 'unknown').trim()
}

const attemptKey = (email: string, c: Context) => hashToken(`${email}\n${clientAddress(c)}`)

async function isRateLimited(key: string) {
  const [row] = await sql<{ blocked_until: Date | null }[]>`select blocked_until from auth_login_attempts where key_hash = ${key}`
  return Boolean(row?.blocked_until && row.blocked_until.getTime() > Date.now())
}

async function recordFailure(key: string) {
  const cutoff = new Date(Date.now() - WINDOW_MS)
  const blockedUntil = new Date(Date.now() + WINDOW_MS)
  await sql`
    insert into auth_login_attempts (key_hash, failures, window_started_at, blocked_until)
    values (${key}, 1, now(), null)
    on conflict (key_hash) do update set
      failures = case when auth_login_attempts.window_started_at < ${cutoff} then 1 else auth_login_attempts.failures + 1 end,
      window_started_at = case when auth_login_attempts.window_started_at < ${cutoff} then now() else auth_login_attempts.window_started_at end,
      blocked_until = case
        when auth_login_attempts.window_started_at >= ${cutoff} and auth_login_attempts.failures + 1 >= ${MAX_FAILURES}
        then ${blockedUntil} else null end`
}

function cookieOptions(expires?: Date) {
  return {
    path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' as const,
    ...(expires ? { expires } : {}),
  }
}

export function allowedWebOrigin() {
  try { return new URL(process.env.WEB_URL ?? 'http://localhost:3000').origin }
  catch { return 'http://localhost:3000' }
}

export const requireTrustedOrigin: MiddlewareHandler = async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) || c.req.path === '/webhooks/velo') return next()
  if (c.req.header('origin') !== allowedWebOrigin()) return c.json({ error: 'Request origin is not allowed' }, 403)
  return next()
}

export async function authenticateRequest(c: Context): Promise<AuthSession | null> {
  const token = getCookie(c, COOKIE)
  if (!token || token.length < 40 || token.length > 100) return null
  const [row] = await sql<SessionRow[]>`
    select id, expires_at, last_seen_at from auth_sessions
    where token_hash = ${hashToken(token)} and revoked_at is null and expires_at > now()`
  if (!row) return null
  if (Date.now() - row.last_seen_at.getTime() > 15 * 60_000) {
    await sql`update auth_sessions set last_seen_at = now() where id = ${row.id}`
  }
  return { id: row.id, email: configuredEmail(), expiresAt: row.expires_at }
}

export const authRoutes = new Hono<AuthEnv>()

authRoutes.post('/auth/login', async (c) => {
  if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json')) {
    return c.json({ error: 'Content-Type must be application/json' }, 400)
  }
  const body = await c.req.json().catch(() => null)
  if (typeof body?.email !== 'string' || typeof body?.password !== 'string' || body.email.length > 254 || body.password.length > 1024) {
    return c.json({ error: 'Email and password are required' }, 400)
  }
  const email = normalizeEmail(body.email)
  const expectedEmail = configuredEmail()
  const encoded = process.env.AUTH_PASSWORD_SCRYPT ?? ''
  if (!expectedEmail || !encoded) return c.json({ error: 'Authentication is not configured' }, 503)

  const key = attemptKey(email, c)
  const staleAttemptCutoff = new Date(Date.now() - WINDOW_MS)
  await sql`
    delete from auth_login_attempts
    where window_started_at < ${staleAttemptCutoff} and (blocked_until is null or blocked_until <= now())`
  if (await isRateLimited(key)) return c.json({ error: 'Too many sign-in attempts. Try again later.' }, 429)
  let passwordOk = false
  try { passwordOk = await verifyPassword(body.password, encoded) }
  catch (error) {
    console.error('Authentication configuration error:', error instanceof Error ? error.message : String(error))
    return c.json({ error: 'Authentication is not configured' }, 503)
  }
  const emailBytes = Buffer.from(email)
  const expectedEmailBytes = Buffer.from(expectedEmail)
  const emailOk = emailBytes.length === expectedEmailBytes.length && timingSafeEqual(emailBytes, expectedEmailBytes)
  if (!emailOk || !passwordOk) {
    await recordFailure(key)
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  await sql`delete from auth_login_attempts where key_hash = ${key}`
  await sql`delete from auth_sessions where expires_at <= now() or revoked_at is not null`
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const expiresAt = new Date(Date.now() + ttlMs())
  const rememberMe = body.rememberMe === true
  await sql`
    insert into auth_sessions (token_hash, expires_at, user_agent)
    values (${hashToken(token)}, ${expiresAt}, ${c.req.header('user-agent')?.slice(0, 500) ?? null})`
  setCookie(c, COOKIE, token, cookieOptions(rememberMe ? expiresAt : undefined))
  return c.json({ user: { email: expectedEmail } })
})

authRoutes.get('/auth/session', (c) => {
  const session = c.get('authSession')
  return c.json({ user: { email: session.email }, expiresAt: session.expiresAt.toISOString() })
})

authRoutes.post('/auth/logout', async (c) => {
  const token = getCookie(c, COOKIE)
  if (token) await sql`update auth_sessions set revoked_at = now() where token_hash = ${hashToken(token)}`
  deleteCookie(c, COOKIE, cookieOptions())
  return c.body(null, 204)
})
