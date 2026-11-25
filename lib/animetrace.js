/** AnimeTrace 角色识别：二次元插画/头像/表情包 → 角色名 + 作品名。 */
export class EngineError extends Error {
  constructor(message, detail) {
    super(message)
    this.name = 'EngineError'
    this.detail = detail
  }
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' }

export async function queryAnimeTrace({ bytes, mime, token, signal, userAgent, timeoutMs = 40000 }) {
  const url = 'https://api.animetrace.com/v1/search' + (token ? `?token=${encodeURIComponent(token)}` : '')
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mime }), `image.${EXT[mime] || 'jpg'}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'user-agent': userAgent,
      origin: 'https://www.animetrace.com',
      referer: 'https://www.animetrace.com/',
    },
    body: form,
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)].filter(Boolean)),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new EngineError(`AnimeTrace 返回了非 JSON（HTTP ${res.status}）`, { status: res.status })
  }
  if (json.code !== 0) {
    const message = json.zh_message || json.msg || `code ${json.code}`
    throw new EngineError(`AnimeTrace：${message}`, { code: json.code, status: res.status })
  }
  const data = Array.isArray(json.data) ? json.data : []
  const guesses = []
  for (const item of data.slice(0, 4)) {
    const box = Array.isArray(item.box) ? item.box.map(Number).filter(Number.isFinite) : undefined
    const confidence = item.not_confident ? 'low' : 'high'
    for (const c of (item.character || []).slice(0, 4)) {
      const name = String(c.character || '').trim()
      if (!name) continue
      guesses.push({ name, work: String(c.work || '').trim(), confidence, engine: 'animetrace', box })
    }
  }
  return { guesses }
}
