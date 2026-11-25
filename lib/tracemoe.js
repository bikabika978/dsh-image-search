/** trace.moe 番剧识别：动画截图 → 番剧名 + 集数 + 时间点 + AniList 页面。 */
import { EngineError } from './animetrace.js'

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' }

function clock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const m = Math.floor(s / 60)
  const rest = s % 60
  return `${String(m).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function titleOf(anilist) {
  const t = anilist?.title || {}
  return t.chinese || t.english || t.romaji || t.native || ''
}

export async function queryTraceMoe({ bytes, mime, signal, userAgent, timeoutMs = 40000 }) {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mime }), `image.${EXT[mime] || 'jpg'}`)
  const res = await fetch('https://api.trace.moe/search?anilistInfo', {
    method: 'POST',
    headers: { 'user-agent': userAgent },
    body: form,
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)].filter(Boolean)),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new EngineError(`trace.moe 返回了非 JSON（HTTP ${res.status}）`, { status: res.status })
  }
  if (json.error) throw new EngineError(`trace.moe：${json.error}`)
  const results = Array.isArray(json.result) ? json.result : []
  const best = results
    .filter((r) => r && r.anilist)
    .map((r) => ({
      title: titleOf(r.anilist),
      native_title: r.anilist?.title?.native || '',
      episode: Number.isFinite(Number(r.episode)) ? Number(r.episode) : undefined,
      at: clock(r.from),
      similarity: Number(Number(r.similarity).toFixed(3)),
      anilist_id: Number(r.anilist?.id) || undefined,
      anilist_url: r.anilist?.id ? `https://anilist.co/anime/${r.anilist.id}` : '',
      engine: 'tracemoe',
    }))
    .sort((a, b) => b.similarity - a.similarity)
  return { matches: best, quota: Number(json.quota) || 0, quotaUsed: Number(json.quotaUsed) || 0 }
}
