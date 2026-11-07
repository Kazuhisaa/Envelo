import { expect, test } from 'vitest'
import { hashPassword, verifyPassword } from './auth.ts'

test('scrypt password records verify only the original password', async () => {
  const encoded = await hashPassword('correct horse battery staple', Buffer.alloc(16, 7))
  expect(encoded).toMatch(/^scrypt\$16384\$8\$1\$/)
  expect(encoded).not.toContain('correct horse battery staple')
  await expect(verifyPassword('correct horse battery staple', encoded)).resolves.toBe(true)
  await expect(verifyPassword('wrong password', encoded)).resolves.toBe(false)
})

test('invalid password records fail closed', async () => {
  await expect(verifyPassword('anything', 'not-a-password-record')).rejects.toThrow('invalid format')
})
