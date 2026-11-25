/**
 * dsh-image-search — 以图搜图。
 * 引擎：Google Lens（可选 Key，通用最强）＋ AnimeTrace（二次元角色）＋ trace.moe（番剧出处）＋ 百度识图（兜底）。
 * 出处页：AniList 作品/角色页 + Lens/百度识图返回的来源页。
 */
import path from 'node:path'
import { createCache } from './lib/cache.js'
import { loadImage, DEFAULT_UA } from './lib/image.js'
import { queryAnimeTrace } from './lib/animetrace.js'
import { queryTraceMoe } from './lib/tracemoe.js'
import { queryGoogleLens } from './lib/serpapi.js'
import { lookupAnime, lookupCharacter } from './lib/anilist.js'
import { createBaiduRunner } from './lib/baidu.js'
import { compressForUpload } from './lib/compress.js'

const TOOL_NAME = 'image_search'
const ENGINES = ['animetrace', 'tracemoe', 'lens', 'baidu']

const DESCRIPTION =
  '以图搜图：给一张图片，反查它是什么角色/什么东西、出自哪部作品或哪一集、以及图片来源页面。' +
  '输入本地绝对路径或 http(s) 图片地址。' +
  '配置了 Google Lens（serpapiKey）时先走 Lens（通用识别最强，本地图片上传上限约 500KB），否则用 AnimeTrace 认二次元角色、trace.moe 认番剧截图，' +
  '都认不出时用百度识图兜底。多个引擎并行执行，按画像/意图自动取舍。' +
  '当用户发来图片问「这是谁/什么角色/哪部番/哪里来的/这个梗是什么」，或你想追溯网页上某张图的来源时使用。' +
  '会把图片字节发送给上述第三方服务（含境外的 SerpApi/AnimeTrace/trace.moe）；免费引擎有每日额度，失败或额度用尽时如实返回原因。'

const PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    image: { type: 'string', description: '本地图片绝对路径，或 http(s) 图片地址。' },
    intent: {
      type: 'string',
      enum: ['auto', 'character', 'anime'],
      description: 'auto（默认）均衡识别；character 只关心角色是谁；anime 只关心番剧出处。',
    },
    engine: {
      type: 'string',
      enum: ['auto', 'lens', 'animetrace', 'tracemoe', 'baidu'],
      description: '指定单个引擎；auto（默认）并行调度：免费引擎先跑，认不出再上 Lens/百度。',
    },
    max_results: { type: 'integer', description: '最多返回多少条候选与出处链接，默认 6。' },
  },
  required: ['image'],
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'message'],
  properties: {
    ok: { type: 'boolean', description: '是否得到可用结论。' },
    message: { type: 'string', description: '一句话结论。' },
    image_kind: { type: 'string', enum: ['url', 'path'] },
    image_sha256: { type: 'string' },
    cached: { type: 'boolean' },
    guesses: {
      type: 'array',
      description: '角色候选（AnimeTrace）。',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          name: { type: 'string' },
          work: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'low'] },
          engine: { type: 'string' },
          box: { type: 'array', items: { type: 'number' } },
        },
      },
    },
    anime: {
      type: 'object',
      description: '番剧匹配（trace.moe），或经 AniList 解析出的作品页。',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        episode: { type: 'integer' },
        at: { type: 'string' },
        similarity: { type: 'number' },
        anilist_url: { type: 'string' },
        engine: { type: 'string' },
      },
    },
    lens: {
      type: 'object',
      description: 'Google Lens 结果：识别结论、图中文字、视觉匹配与精确匹配。',
      additionalProperties: false,
      properties: {
        knowledge_title: { type: 'string' },
        knowledge_description: { type: 'string' },
        text: { type: 'string' },
        visual_matches: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              source: { type: 'string' },
              link: { type: 'string' },
              thumbnail: { type: 'string' },
            },
          },
        },
        exact_matches: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              source: { type: 'string' },
              link: { type: 'string' },
              thumbnail: { type: 'string' },
            },
          },
        },
        organic: {
          type: 'array',
          description: 'Lens 关联的网页结果（标题/链接/摘要）。',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              link: { type: 'string' },
              snippet: { type: 'string' },
            },
          },
        },
      },
    },
    baidu: {
      type: 'object',
      description: '百度识图兜底结果。',
      additionalProperties: false,
      properties: {
        guess: { type: 'string' },
        text: { type: 'string' },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['url'],
            properties: { title: { type: 'string' }, url: { type: 'string' } },
          },
        },
      },
    },
    links: {
      type: 'array',
      description: '出处页链接。',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'url'],
        properties: { label: { type: 'string' }, url: { type: 'string' } },
      },
    },
    engines: { type: 'array', items: { type: 'string' } },
    notes: { type: 'array', items: { type: 'string' } },
  },
}

function clamp(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function normalizeOptions(raw) {
  const c = raw && typeof raw === 'object' ? raw : {}
  const fromConfig = (key) => (typeof c[key] === 'string' ? c[key].trim() : '')
  const env = (name) => (typeof process.env[name] === 'string' ? process.env[name].trim() : '')
  return {
    // 配置优先；留空时读环境变量，方便开源后不把 Key 写进仓库
    animetraceToken: fromConfig('animetraceToken') || env('ANIMETRACE_TOKEN'),
    serpapiKey: fromConfig('serpapiKey') || env('SERPAPI_KEY'),
    lensPolicy: c.lensPolicy === 'always' ? 'always' : 'auto',
    enableAnimeTrace: c.enableAnimeTrace !== false,
    enableTraceMoe: c.enableTraceMoe !== false,
    enableBaiduFallback: c.enableBaiduFallback !== false,
    maxImageBytes: Number.isFinite(c.maxImageBytes) ? c.maxImageBytes : 8 * 1024 * 1024,
    maxBaiduBytes: Number.isFinite(c.maxBaiduBytes) ? c.maxBaiduBytes : 4 * 1024 * 1024,
    cacheTtlHours: Number.isFinite(c.cacheTtlHours) ? c.cacheTtlHours : 24,
    serpapiUploadMaxBytes: Number.isFinite(c.serpapiUploadMaxBytes) ? c.serpapiUploadMaxBytes : 500000,
    compressMaxDimension: Number.isFinite(c.compressMaxDimension) ? c.compressMaxDimension : 1600,
    timeoutMs: Number.isFinite(c.timeoutMs) ? c.timeoutMs : 60000,
    engineTimeoutMs: Number.isFinite(c.engineTimeoutMs) ? c.engineTimeoutMs : 12000,
    userAgent: typeof c.userAgent === 'string' && c.userAgent ? c.userAgent : DEFAULT_UA,
  }
}

function createPathResolver(ctx, exec) {
  return (input) => {
    if (path.isAbsolute(input)) return input
    let base = process.cwd()
    try {
      const session = exec?.agent?.session
      const wd = session ? ctx.workingDirectory?.get(session) : undefined
      if (typeof wd === 'string' && wd) base = wd
    } catch {
      /* 服务不可用时退回进程工作目录 */
    }
    return path.resolve(base, input)
  }
}

function composeSignal(signal, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`本次搜索超时（${timeoutMs}ms）`)), timeoutMs)
  timer.unref?.()
  const onAbort = () => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

function pushLink(links, label, url) {
  if (!url || typeof url !== 'string') return
  if (links.some((l) => l.url === url)) return
  links.push({ label, url })
}

function animeLabel(value) {
  return value.anime?.episode || Number.isFinite(value.anime?.similarity) ? '番剧' : '作品'
}

function lensHasResult(lens) {
  if (!lens) return false
  return Boolean(
    lens.knowledge_title ||
      (lens.exact_matches && lens.exact_matches.length) ||
      (lens.visual_matches && lens.visual_matches.length) ||
      (lens.organic && lens.organic.length),
  )
}

/** 每个引擎返回一个"补丁"，由调用方按固定优先级合并，保证并行结果与顺序无关。 */
function createEngineRunner({ img, options, maxResults, signal, baidu }) {
  return async function runEngine(name) {
    if (name === 'lens') {
      // 本地图片超过 SerpApi 上传上限时，先用 sharp 压到上限内（纯 Node，不碰浏览器）
      let uploadImg = img
      let compression
      if (img.kind !== 'url' && img.bytes.length > options.serpapiUploadMaxBytes) {
        const compressed = await compressForUpload(img.bytes, {
          maxBytes: options.serpapiUploadMaxBytes,
          maxDimension: options.compressMaxDimension,
        })
        if (!compressed) {
          throw new Error(
            `图片 ${Math.round(img.bytes.length / 1024)}KB 超过 SerpApi 上传上限 ` +
              `${Math.round(options.serpapiUploadMaxBytes / 1024)}KB，且本机找不到 sharp 无法压缩`,
          )
        }
        uploadImg = { ...img, bytes: compressed.bytes, mime: compressed.mime }
        compression = {
          beforeKb: Math.round(img.bytes.length / 1024),
          afterKb: Math.round(compressed.bytes.length / 1024),
          width: compressed.width,
          height: compressed.height,
          quality: compressed.quality,
        }
      }
      const lens = await queryGoogleLens({
        img: uploadImg,
        apiKey: options.serpapiKey,
        maxResults,
        signal,
        userAgent: options.userAgent,
        timeoutMs: options.engineTimeoutMs,
      })
      return { name, patch: { lens, compression } }
    }
    if (name === 'animetrace') {
      const result = await queryAnimeTrace({
        bytes: img.bytes,
        mime: img.mime,
        token: options.animetraceToken,
        signal,
        userAgent: options.userAgent,
        timeoutMs: options.engineTimeoutMs,
      })
      return { name, patch: { guesses: result.guesses.slice(0, maxResults), raw: result } }
    }
    if (name === 'tracemoe') {
      const result = await queryTraceMoe({
        bytes: img.bytes,
        mime: img.mime,
        signal,
        userAgent: options.userAgent,
        timeoutMs: options.engineTimeoutMs,
      })
      return { name, patch: { matches: result.matches, quota: result.quota, quotaUsed: result.quotaUsed } }
    }
    if (name === 'baidu') {
      const result = await baidu.query({ img, signal })
      return {
        name,
        patch: { baidu: { guess: result.guess, text: result.text, sources: result.links.slice(0, maxResults) }, reason: result.reason },
      }
    }
    throw new Error(`未知引擎：${name}`)
  }
}

function mergeEngineResult(value, result, { maxResults }) {
  const { name, patch } = result
  if (name === 'lens') {
    value.lens = patch.lens
    value.engines.push('lens')
    if (patch.compression) {
      const c = patch.compression
      value.notes.push(
        `已压缩后上传 Lens：${c.beforeKb}KB → ${c.afterKb}KB（${c.width}x${c.height}, q${c.quality}）`,
      )
    }
    return
  }
  if (name === 'animetrace') {
    if (patch.guesses.length) {
      value.guesses = patch.guesses
      value.engines.push('animetrace')
      if (patch.guesses.every((g) => g.confidence === 'low')) value.notes.push('AnimeTrace 给出的候选置信度偏低')
    } else {
      value.notes.push('AnimeTrace 没有返回角色候选')
    }
    return
  }
  if (name === 'tracemoe') {
    if (patch.quota) value.notes.push(`trace.moe 今日额度 ${patch.quotaUsed}/${patch.quota}`)
    const best = patch.matches[0]
    if (best && best.similarity >= 0.8) {
      value.anime = {
        title: best.title,
        episode: best.episode,
        at: best.at,
        similarity: best.similarity,
        anilist_url: best.anilist_url,
        engine: 'tracemoe',
      }
      value.engines.push('tracemoe')
    } else if (best) {
      value.notes.push(`trace.moe 最高相似度仅 ${best.similarity}，未作为结论`)
    } else {
      value.notes.push('trace.moe 没有匹配到番剧')
    }
    return
  }
  if (name === 'baidu') {
    value.baidu = patch.baidu
    value.engines.push('baidu')
    if (result.reason) value.notes.push(result.reason)
  }
}

async function enrichSources(value, { signal, options, maxResults }) {
  const links = []
  const guesses = value.guesses || []
  const top = guesses.find((g) => g.confidence === 'high')
  if (top?.name) {
    const character = await lookupCharacter(top.name, { signal, userAgent: options.userAgent }).catch(() => undefined)
    if (character?.url) pushLink(links, `AniList 角色：${character.name || top.name}`, character.url)
  }
  const workTitles = [
    ...new Set([
      ...guesses.filter((g) => g.confidence === 'high').map((g) => g.work),
      value.anime?.title,
    ].filter(Boolean)),
  ]
  let resolvedWork = false
  for (const title of workTitles.slice(0, 3)) {
    if (resolvedWork) break
    const anime = await lookupAnime(title, { signal, userAgent: options.userAgent }).catch(() => undefined)
    if (anime?.url) {
      pushLink(links, `AniList 作品：${anime.title || title}`, anime.url)
      if (!value.anime) value.anime = { title: anime.title || title, anilist_url: anime.url, engine: 'anilist' }
      resolvedWork = true
    }
  }
  if (!resolvedWork && workTitles.length) {
    const head = String(workTitles[0]).split(/[：:｜|\s]/).filter(Boolean)[0]
    if (head && head !== workTitles[0]) {
      const anime = await lookupAnime(head, { signal, userAgent: options.userAgent }).catch(() => undefined)
      if (anime?.url) {
        pushLink(links, `AniList 作品：${anime.title || head}`, anime.url)
        if (!value.anime) value.anime = { title: anime.title || head, anilist_url: anime.url, engine: 'anilist' }
      }
    }
  }
  if (value.anime?.anilist_url && !links.some((l) => l.url === value.anime.anilist_url)) {
    pushLink(links, `AniList 番剧：${value.anime.title || ''}`.trim(), value.anime.anilist_url)
  }
  for (const match of [...(value.lens?.exact_matches || []), ...(value.lens?.visual_matches || [])]) {
    if (!match.link || /google\.com\/goto/.test(match.link)) continue
    pushLink(links, `${match.source || 'Lens'}：${match.title || ''}`.trim(), match.link)
    if (links.length >= maxResults * 2) break
  }
  for (const item of value.lens?.organic || []) {
    if (!item.link || /google\.com\/goto/.test(item.link)) continue
    pushLink(links, `Lens 网页：${item.title || ''}`.trim(), item.link)
    if (links.length >= maxResults * 2) break
  }
  for (const source of value.baidu?.sources || []) {
    pushLink(links, source.title || '百度来源页', source.url)
    if (links.length >= maxResults * 2) break
  }
  if (!links.length) {
    const query = top?.name ? [top.name, top.work].filter(Boolean).join(' ') : value.baidu?.guess || value.lens?.knowledge_title
    if (query) pushLink(links, `百度文字搜索：${query}`, `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`)
  }
  return links.slice(0, maxResults * 2)
}

function summarize(value) {
  const guesses = value.guesses || []
  const high = guesses.find((g) => g.confidence === 'high')
  const parts = []
  if (value.lens?.knowledge_title) parts.push(`Google Lens 识别为 ${value.lens.knowledge_title}`)
  if (high) parts.push(`可能是 ${high.name}${high.work ? `（${high.work}）` : ''}`)
  else if (!value.lens?.knowledge_title && guesses.length) {
    parts.push(`未识别出明确角色，仅有低置信候选（如 ${guesses[0].name}）`)
  }
  if (value.anime?.title) {
    const ep = value.anime.episode ? `第 ${value.anime.episode} 集 ` : ''
    const at = value.anime.at ? `${value.anime.at} ` : ''
    const sim = Number.isFinite(value.anime.similarity) ? `相似度 ${value.anime.similarity}` : ''
    parts.push(`${animeLabel(value)} ${value.anime.title} ${ep}${at}${sim}`.replace(/\s+/g, ' ').trim())
  }
  if (!parts.length && value.lens) {
    const exact = value.lens.exact_matches?.length || 0
    const visual = value.lens.visual_matches?.length || 0
    const organic = value.lens.organic?.length || 0
    if (exact) parts.push(`Google Lens 找到 ${exact} 处同图出处`)
    else if (visual) parts.push(`Google Lens 找到 ${visual} 条相似图/来源页（未给出明确命名）`)
    else if (organic) parts.push(`Google Lens 找到 ${organic} 条相关网页`)
  }
  if (value.baidu?.guess) parts.push(`百度识图认为图中可能是 ${value.baidu.guess}`)
  if (!parts.length) return '未能识别：可换更清晰的整图重试，或改用关键词检索。'
  return parts.join('；')
}

function render(args, value) {
  const lines = []
  lines.push(value.ok ? `以图搜图：${value.message}` : `以图搜图未得到结论：${value.message}`)
  if (value.guesses?.length) {
    lines.push('角色候选：')
    for (const g of value.guesses.slice(0, 6)) {
      const work = g.work ? `｜${g.work}` : ''
      const conf = g.confidence === 'low' ? '（置信度低）' : ''
      lines.push(`- ${g.name}${work}${conf}`)
    }
  }
  if (value.lens?.knowledge_title) {
    const desc = value.lens.knowledge_description ? `：${value.lens.knowledge_description}` : ''
    lines.push(`Google Lens：${value.lens.knowledge_title}${desc}`)
  }
  if (value.lens?.text) lines.push(`图中文字：${value.lens.text.slice(0, 300)}`)
  if (value.lens?.exact_matches?.length) {
    lines.push('同图出处：')
    for (const m of value.lens.exact_matches.slice(0, 5)) lines.push(`- ${m.title || ''}${m.source ? `（${m.source}）` : ''}${m.link ? `：${m.link}` : ''}`)
  }
  if (value.anime?.title) {
    const ep = value.anime.episode ? ` 第 ${value.anime.episode} 集` : ''
    const at = value.anime.at ? ` @ ${value.anime.at}` : ''
    const sim = Number.isFinite(value.anime.similarity) ? `（相似度 ${value.anime.similarity}）` : ''
    lines.push(`${animeLabel(value)}：${value.anime.title}${ep}${at}${sim}`)
  }
  if (value.links?.length) {
    lines.push('出处页：')
    for (const l of value.links.slice(0, 10)) lines.push(`- ${l.label}：${l.url}`)
  }
  if (value.notes?.length) lines.push(`说明：${value.notes.join('；')}`)
  return [{ type: 'text', text: lines.join('\n') }]
}

export function apply(ctx, config) {
  const options = normalizeOptions(config)
  const cache = createCache({ ttlHours: options.cacheTtlHours })
  void cache.prune()

  let browser
  const baidu = createBaiduRunner(() => browser)
  ctx.effect(() => () => {
    void baidu.dispose()
  })

  ctx.inject(['browser'], (bctx) => {
    browser = bctx.browser
    return () => {
      browser = undefined
    }
  })

  const tool = {
    name: TOOL_NAME,
    description: DESCRIPTION,
    parameters: PARAMETERS,
    timeoutMs: options.timeoutMs + 15000,
    output: {
      schema: OUTPUT_SCHEMA,
      render(args, value) {
        return render(args, value)
      },
    },

    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {}
      if (typeof input.image !== 'string' || !input.image.trim()) {
        throw new Error('image 参数必填：请给出本地图片绝对路径或 http(s) 图片地址')
      }
      const intent = ['auto', 'character', 'anime'].includes(input.intent) ? input.intent : 'auto'
      const engine = ENGINES.includes(input.engine) ? input.engine : 'auto'
      const maxResults = clamp(input.max_results, 1, 12, 6)

      const composed = composeSignal(exec?.signal, options.timeoutMs)
      const signal = composed.signal
      try {
        const img = await loadImage(input.image, {
          resolvePath: createPathResolver(ctx, exec),
          maxBytes: options.maxImageBytes,
          userAgent: options.userAgent,
          timeoutMs: Math.min(options.timeoutMs, 30000),
          signal,
        })

        const lensKey = options.serpapiKey ? 'lens' : 'nolens'
        // v2：输出结构变化时递增，避免旧缓存掩盖新逻辑
        const cacheKey = `v2|${img.sha256.slice(0, 32)}|${intent}|${engine}|${lensKey}`
        const cached = await cache.get(cacheKey)
        if (cached) return { ...cached, cached: true }

        const value = {
          ok: false,
          message: '',
          image_kind: img.kind,
          image_sha256: img.sha256.slice(0, 16),
          engines: [],
          notes: [],
        }

        const runEngine = createEngineRunner({ img, options, maxResults, signal, baidu })
        const enabled = {
          animetrace: options.enableAnimeTrace,
          tracemoe: options.enableTraceMoe,
          lens: Boolean(options.serpapiKey),
          baidu: options.enableBaiduFallback,
        }

        const runWave = async (names) => {
          const usable = names.filter((name) => {
            if (name === 'baidu') {
              if (!baidu.available()) {
                value.notes.push('百度兜底不可用：未检测到浏览器服务')
                return false
              }
              if (img.bytes.length > options.maxBaiduBytes) {
                value.notes.push(`百度兜底跳过：图片 ${img.bytes.length} 字节超过浏览器上传上限`)
                return false
              }
            }
            if (name === 'lens' && !options.serpapiKey) return false
            return true
          })
          if (!usable.length) return []
          const settled = await Promise.allSettled(usable.map((name) => runEngine(name)))
          const results = []
          settled.forEach((entry, index) => {
            const name = usable[index]
            if (entry.status === 'fulfilled') results.push(entry.value)
            else value.notes.push(`${name} 失败：${entry.reason?.message || String(entry.reason)}`)
          })
          return results
        }

        const mergeAll = (results) => {
          const ordered = ENGINES.map((name) => results.find((r) => r.name === name)).filter(Boolean)
          for (const result of ordered) mergeEngineResult(value, result, { maxResults })
        }

        if (engine !== 'auto') {
          mergeAll(await runWave([engine]))
        } else {
          const freeWave = ['animetrace', 'tracemoe'].filter((name) => enabled[name])
          const preResults = await runWave(freeWave)
          mergeAll(preResults)

          const hasHighGuess = (value.guesses || []).some((g) => g.confidence === 'high')
          const animeStrong = Number.isFinite(value.anime?.similarity) && value.anime.similarity >= 0.9
          const confident = hasHighGuess || animeStrong

          const needLens = Boolean(options.serpapiKey) && (!confident || options.lensPolicy === 'always')
          const needBaidu = Boolean(options.enableBaiduFallback) && !confident
          if (needLens || needBaidu) {
            const secondWave = [needLens ? 'lens' : undefined, needBaidu ? 'baidu' : undefined].filter(Boolean)
            const rest = await runWave(secondWave)
            mergeAll(rest)
          }
        }

        value.links = await enrichSources(value, { signal, options, maxResults })
        const hasHighGuess = (value.guesses || []).some((g) => g.confidence === 'high')
        value.ok = Boolean(hasHighGuess || value.anime || lensHasResult(value.lens) || value.baidu?.guess)
        value.message = summarize(value)
        if (value.ok) await cache.set(cacheKey, value)
        return value
      } finally {
        composed.dispose()
      }
    },
  }

  ctx.inject(['tools'], (tctx) => {
    tctx.effect(() => tctx.tools.register(tool))
  })
}
