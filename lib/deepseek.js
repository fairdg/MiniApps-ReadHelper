const API_URL = 'https://api.deepseek.com/chat/completions'

function apiKey() {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new Error('DEEPSEEK_API_KEY is not set')
  return key
}

function buildPrompt(text, targetWords) {
  return [
    `Раздели текст ниже на смысловые фрагменты примерно по ${targetWords} слов каждый.`,
    'Не разрывай предложения и сцены на середине — режь по естественным границам (конец абзаца, смена сцены, конец мысли).',
    'Верни строго JSON-объект вида {"chunks": ["...", "..."]}, без пояснений и markdown.',
    '',
    'Текст:',
    text,
  ].join('\n')
}

export async function splitIntoChunks(text, { targetWords = 250 } = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: buildPrompt(text, targetWords) }],
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    throw new Error(`DeepSeek request failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  const parsed = JSON.parse(data.choices[0].message.content)
  const chunks = Array.isArray(parsed) ? parsed : parsed.chunks

  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('DeepSeek returned no chunks')
  }

  return chunks
}
