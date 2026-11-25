/**
 * 上传前压缩：用 profile 里已有的 sharp（vision-router 的依赖）做缩放 + JPEG 重编码。
 * 纯 Node、毫秒级、不需要浏览器。sharp 找不到时返回 null，由调用方降级处理。
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import os from 'node:os'

let cached
let cachedFrom = ''

function candidateBases() {
  const bases = []
  if (process.env.DSH_PROFILE_DIR) bases.push(process.env.DSH_PROFILE_DIR)
  const profile = process.env.DSH_PROFILE || 'desktop'
  bases.push(path.join(os.homedir(), '.dsh', 'profiles', profile))
  bases.push(process.cwd())
  return [...new Set(bases.filter(Boolean))]
}

/** 解析 sharp；优先正常解析，其次 pnpm 虚拟仓库路径。失败缓存为 null。 */
export function loadSharp() {
  if (cached !== undefined) return cached
  for (const base of candidateBases()) {
    const req = createRequire(path.join(base, 'noop.cjs'))
    const tries = [
      () => req.resolve('sharp') && req('sharp'),
      () => req(path.join(base, 'node_modules', '.pnpm', 'node_modules', 'sharp')),
    ]
    for (const attempt of tries) {
      try {
        const mod = attempt()
        if (mod && typeof mod === 'function') {
          cached = mod
          cachedFrom = base
          return cached
        }
      } catch {
        /* 换下一个候选 */
      }
    }
  }
  cached = null
  return cached
}

export function sharpAvailable() {
  return Boolean(loadSharp())
}

/**
 * 把图片压到 maxBytes 以内。
 * @returns {Promise<{bytes:Uint8Array, mime:string, width:number, height:number, quality:number}|null>}
 */
export async function compressForUpload(bytes, { maxBytes = 480 * 1024, maxDimension = 1600 } = {}) {
  const sharp = loadSharp()
  if (!sharp) return null
  const input = Buffer.from(bytes)

  const plans = [
    { dimension: maxDimension, quality: 82 },
    { dimension: maxDimension, quality: 72 },
    { dimension: maxDimension, quality: 62 },
    { dimension: 1200, quality: 62 },
    { dimension: 1000, quality: 55 },
    { dimension: 800, quality: 50 },
  ]

  for (const plan of plans) {
    try {
      const out = await sharp(input)
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize({ width: plan.dimension, height: plan.dimension, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: plan.quality, mozjpeg: true })
        .toBuffer()
      if (out.length <= maxBytes) {
        const meta = await sharp(out).metadata().catch(() => ({}))
        return {
          bytes: new Uint8Array(out),
          mime: 'image/jpeg',
          width: meta.width || 0,
          height: meta.height || 0,
          quality: plan.quality,
        }
      }
    } catch {
      /* 这一档失败就继续降档 */
    }
  }
  return null
}
