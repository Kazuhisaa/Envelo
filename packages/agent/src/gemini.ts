// The one place the agent talks to the model: Gemini's generateContent, JSON out.
export const geminiModel = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash'

export async function geminiJson(req: { system: string; user: string; apiKey: string; signal?: AbortSignal }): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': req.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
    signal: req.signal,
  })
  if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${await res.text().catch(() => '')}`)
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
  if (!text) throw new Error('Gemini returned no text')
  return text
}
