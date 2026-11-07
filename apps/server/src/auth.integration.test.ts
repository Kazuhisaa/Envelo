import { createHash } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('authentication sessions', () => {
  let app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> }
  let sql: typeof import('./db.ts').sql
  const origin = 'http://localhost:3000'

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.WEB_URL = origin
    process.env.AUTH_EMAIL = 'freelancer@example.com'
    const db = await import('./db.ts')
    const auth = await import('./auth.ts')
    process.env.AUTH_PASSWORD_SCRYPT = await auth.hashPassword('test-password')
    await db.migrate()
    sql = db.sql
    const { createApp } = await import('./app.ts')
    app = createApp(db.dbOk)
  })

  beforeEach(async () => {
    await sql`truncate auth_sessions, auth_login_attempts restart identity`
  })

  const login = (email = 'freelancer@example.com', password = 'test-password') => app.request('/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  test('login stores only a token hash and the cookie authenticates until logout', async () => {
    const response = await login()
    expect(response.status).toBe(200)
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('envelo_session=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    const cookie = setCookie.split(';')[0]
    const rawToken = cookie.split('=')[1]

    const [stored] = await sql`select token_hash from auth_sessions`
    expect(stored.token_hash).toBe(createHash('sha256').update(rawToken).digest('hex'))
    expect(stored.token_hash).not.toBe(rawToken)

    const session = await app.request('/auth/session', { headers: { cookie } })
    expect(session.status).toBe(200)
    expect(await session.json()).toMatchObject({ user: { email: 'freelancer@example.com' } })

    expect((await app.request('/auth/logout', { method: 'POST', headers: { cookie, origin } })).status).toBe(204)
    expect((await app.request('/auth/session', { headers: { cookie } })).status).toBe(401)
  })

  test('credential failures are generic and become rate limited', async () => {
    expect(await (await login('wrong@example.com')).json()).toEqual({ error: 'Invalid email or password' })
    await sql`truncate auth_login_attempts`
    for (let attempt = 0; attempt < 5; attempt++) expect((await login(undefined, 'wrong')).status).toBe(401)
    expect((await login(undefined, 'wrong')).status).toBe(429)
  })
})
