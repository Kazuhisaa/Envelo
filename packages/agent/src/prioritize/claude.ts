import { allocationJsonSchema } from './schema.ts'

export type ClaudeClient = (req: {
  system: string
  user: string
  apiKey: string
  signal?: AbortSignal
}) => Promise<unknown>

export const defaultClaudeClient: ClaudeClient = async ({ system, user, apiKey, signal }) => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: 500,
      system,
      tools: [
        {
          name: 'allocate_set_asides',
          description: 'Allocate available set-aside centavos across envelopes with a reason for the freelancer',
          input_schema: allocationJsonSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'allocate_set_asides' },
      messages: [{ role: 'user', content: user }],
    }),
    signal,
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    throw new Error(`Anthropic API error (${res.status}): ${errorText}`)
  }

  const json = (await res.json()) as {
    content?: Array<{ type: string; name?: string; input?: unknown }>
  }

  const toolBlock = json.content?.find((b) => b.type === 'tool_use' && b.name === 'allocate_set_asides')
  if (!toolBlock || typeof toolBlock.input !== 'object' || toolBlock.input === null) {
    throw new Error('Claude response did not contain the allocate_set_asides tool call')
  }

  return toolBlock.input
}
