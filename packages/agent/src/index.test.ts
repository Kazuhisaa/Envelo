import { expect, test } from 'vitest'
import { AGENT_NAME } from './index.ts'

test('agent package loads', () => {
  expect(AGENT_NAME).toBe('envelo-agent')
})
