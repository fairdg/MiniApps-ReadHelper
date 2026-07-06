const MODEL = 'gemini-2.5-flash'
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

function apiKey() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')
  return key
}

function buildPrompt(text, targetWords) {
  return [
    `Раздели текст ниже на смысловые фрагменты примерно по ${targetWords} слов каждый.`,
    'Не разрывай предложения и сцены на середине — режь по естественным границам (конец абзаца, смена сцены, конец мысли).',
    'Если во фрагменте попадаются титульные данные, оглавление, аннотация, реклама других книг, копирайт/выходные данные издательства или другой служебный текст, не относящийся к самому произведению — пропусти его, не включай ни в один чанк.',
    'Верни строго JSON-объект вида {"chunks": ["...", "..."]}, без пояснений и markdown.',
    '',
    'Текст:',
    text,
  ].join('\n')
}

export async function splitIntoChunks(text, { targetWords = 250 } = {}) {
  const res = await fetch(`${API_URL}?key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(text, targetWords) }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  })

  if (!res.ok) {
    throw new Error(`Gemini request failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
  const parsed = JSON.parse(raw)
  const chunks = Array.isArray(parsed) ? parsed : parsed.chunks

  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('Gemini returned no chunks')
  }

  return chunks
}
