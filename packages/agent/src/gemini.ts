// The one place the agent talks to the model: Gemini's generateContent, JSON out.
// Older models (2.5) are closed to new API keys, and the newest ones are often overloaded,
// so the default is 3.5 Flash with 3.5 Flash-Lite as the backup when Gemini is busy.
export const geminiModel = () => process.env.GEMINI_MODEL || 'gemini-3.5-flash'
const BACKUP_MODEL = 'gemini-3.5-flash-lite'

export async function geminiJson(req: { system: string; user: string; apiKey: string; signal?: AbortSignal }): Promise<string> {
  const models = [...new Set([geminiModel(), BACKUP_MODEL])]
  let lastError: Error | null = null
  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': req.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
      signal: req.signal,
    })
    if (!res.ok) {
      lastError = new Error(`Gemini API error (${model}, ${res.status}): ${await res.text().catch(() => '')}`)
      if (res.status === 429 || res.status >= 500) continue // busy: try the backup model
      throw lastError
    }
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
    if (!text) throw new Error(`Gemini (${model}) returned no text`)
    return text
  }
  throw lastError ?? new Error('Gemini: no model answered')
}
