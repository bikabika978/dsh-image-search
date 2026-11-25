/** SerpApi Google Lens：通用的以图搜图（免费 250 次/月，国内直连可达，不需要代理）。 */
import { EngineError } from './animetrace.js'

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' }

function compact(object) {
  const result = {}
  for (const [key, value] of Object.entries(object)) {
    if (value !== undefined && value !== null && value !== '') result[key] = value
  }
  return result
}

function pickMatches(list, maxResults) {
  if (!Array.isArray(list)) return []
  return list
    .slice(0, maxResults)
    .map((m) =>
      compact({
        title: m?.title ? String(m.title).slice(0, 140) : undefined,
        source: m?.source ? String(m.source).slice(0, 60) : undefined,
        link: m?.link ? String(m.link) : undefined,
        thumbnail: m?.thumbnail || m?.image ? String(m.thumbnail || m.image) : undefined,
      }),
    )
    .filter((m) => m.link || m.title)
}

export async function queryGoogleLens({ img, apiKey, maxResults = 6, signal, userAgent, timeoutMs = 40000 }) {
  if (!apiKey) throw new EngineError('未配置 serpapiKey：到 serpapi.com 免费注册即可获得 250 次/月')
  const composed = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)].filter(Boolean))

  // URL 图片：一步直达；本地图片：先 POST /image 拿 image_id，再查 Lens（两步）。
  let imageId
  if (img.kind !== 'url') {
    const form = new FormData()
    form.append('image', new Blob([img.bytes], { type: img.mime }), `image.${EXT[img.mime] || 'jpg'}`)
    form.append('api_key', apiKey)
    const upload = await fetch('https://serpapi.com/image', {
      method: 'POST',
      headers: { 'user-agent': userAgent, accept: 'application/json' },
      body: form,
      signal: composed,
    })
    const uploadText = await upload.text()
    let uploadJson
    try {
      uploadJson = JSON.parse(uploadText)
    } catch {
      throw new EngineError(`SerpApi 上传图片返回了非 JSON（HTTP ${upload.status}）`, { status: upload.status })
    }
    if (!upload.ok || uploadJson.error) {
      const message = typeof uploadJson.error === 'string' ? uploadJson.error : `HTTP ${upload.status}`
      const sizeKb = Math.round(img.bytes.length / 1024)
      const hint = img.bytes.length > 500 * 1024 ? `（图片 ${sizeKb}KB，SerpApi 上传上限约 500KB，可先裁剪/压缩）` : ''
      throw new EngineError(`SerpApi 上传图片失败：${message}${hint}`, { status: upload.status })
    }
    imageId = uploadJson.image_id || uploadJson.id
    if (!imageId) throw new EngineError('SerpApi 上传成功但未返回 image_id')
  }

  const qs = new URLSearchParams({ engine: 'google_lens', api_key: apiKey, hl: 'zh-CN' })
  if (imageId) qs.set('image_id', imageId)
  else qs.set('url', img.url)
  const res = await fetch(`https://serpapi.com/search.json?${qs}`, {
    headers: { 'user-agent': userAgent, accept: 'application/json' },
    signal: composed,
  })

  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new EngineError(`SerpApi 返回了非 JSON（HTTP ${res.status}）`, { status: res.status })
  }
  if (!res.ok || json.error) {
    const message = typeof json.error === 'string' ? json.error : `HTTP ${res.status}`
    throw new EngineError(`SerpApi：${message}`, { status: res.status, code: json.status })
  }

  const knowledge = json.knowledge_graph || {}
  return {
    text: Array.isArray(json.text) ? json.text.map((t) => t?.text).filter(Boolean).join(' ').slice(0, 1500) : '',
    knowledge_title: knowledge.title ? String(knowledge.title).slice(0, 120) : '',
    knowledge_description: knowledge.description ? String(knowledge.description).slice(0, 500) : '',
    visual_matches: pickMatches(json.visual_matches, maxResults),
    exact_matches: pickMatches(json.exact_matches, maxResults),
    organic: (Array.isArray(json.organic_results) ? json.organic_results : [])
      .slice(0, maxResults)
      .map((m) => compact({
        title: m?.title ? String(m.title).slice(0, 140) : undefined,
        link: m?.link ? String(m.link) : undefined,
        snippet: m?.snippet ? String(m.snippet).slice(0, 200) : undefined,
      }))
      .filter((m) => m.link || m.title),
  }
}
