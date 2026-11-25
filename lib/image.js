/** 图片读取与基础校验：本地路径 / http(s) URL → 字节 + MIME + 内容哈希。 */
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** 通过文件头判断图片类型；判断不出返回空串。 */
export function sniffMime(bytes) {
  if (!bytes || bytes.length < 12) return ''
  const b = bytes
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp'
  return ''
}

function hashOf(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function withTimeout(signal, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`超时（${ms}ms）`)), ms)
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

/**
 * 读取一张图。
 * @param {string} input - 本地路径或 http(s) URL。
 * @param {object} opts
 * @param {(p: string) => string} opts.resolvePath - 把相对路径解析成绝对路径。
 * @returns {Promise<{kind:'url'|'path', url?:string, bytes:Uint8Array, mime:string, sha256:string, size:number}>}
 */
export async function loadImage(input, opts) {
  const { resolvePath, maxBytes, userAgent = DEFAULT_UA, timeoutMs = 45000, signal } = opts
  const raw = String(input || '').trim()
  if (!raw) throw new Error('image 参数为空：请给出本地绝对路径或 http(s) 图片地址')

  if (/^https?:\/\//i.test(raw)) {
    const t = withTimeout(signal, timeoutMs)
    try {
      const res = await fetch(raw, {
        headers: { 'user-agent': userAgent, accept: 'image/*,*/*;q=0.8' },
        redirect: 'follow',
        signal: t.signal,
      })
      if (!res.ok) throw new Error(`下载图片失败：HTTP ${res.status}`)
      const declared = Number(res.headers.get('content-length') || 0)
      if (declared && declared > maxBytes) throw new Error(`图片过大：${declared} 字节，超过上限 ${maxBytes}`)
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.length > maxBytes) throw new Error(`图片过大：${bytes.length} 字节，超过上限 ${maxBytes}`)
      const mime = sniffMime(bytes) || (res.headers.get('content-type') || '').split(';')[0] || 'image/jpeg'
      if (!mime.startsWith('image/')) throw new Error(`URL 返回的不是图片（content-type: ${mime || '未知'}）`)
      return { kind: 'url', url: raw, bytes, mime, sha256: hashOf(bytes), size: bytes.length }
    } finally {
      t.dispose()
    }
  }

  const resolved = resolvePath(raw)
  let info
  try {
    info = await stat(resolved)
  } catch {
    throw new Error(`找不到图片文件：${resolved}`)
  }
  if (!info.isFile()) throw new Error(`不是文件：${resolved}`)
  if (info.size > maxBytes) throw new Error(`图片过大：${info.size} 字节，超过上限 ${maxBytes}`)
  const bytes = new Uint8Array(await readFile(resolved))
  const mime = sniffMime(bytes)
  if (!mime) throw new Error(`无法识别的图片格式（支持 PNG/JPEG/GIF/WebP/BMP）：${path.basename(resolved)}`)
  return { kind: 'path', bytes, mime, sha256: hashOf(bytes), size: bytes.length }
}
