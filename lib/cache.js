/** 内存 + 磁盘结果缓存：按内容哈希去重，避免同一张图重复消耗免费额度。 */
import { mkdir, readFile, writeFile, readdir, unlink, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export function createCache({ ttlHours = 24, dir } = {}) {
  const root = dir || path.join(tmpdir(), 'dsh-image-search-cache')
  const ttlMs = Math.max(0, ttlHours) * 3600 * 1000
  const memory = new Map()
  let ready = false

  async function ensureDir() {
    if (ready) return
    await mkdir(root, { recursive: true }).catch(() => {})
    ready = true
  }

  function fileOf(key) {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160)
    return path.join(root, `${safe}.json`)
  }

  return {
    dir: root,
    async get(key) {
      const hit = memory.get(key)
      if (hit && Date.now() - hit.at < ttlMs) return hit.value
      if (!(ttlMs > 0)) return undefined
      await ensureDir()
      const file = fileOf(key)
      try {
        const info = await stat(file)
        if (Date.now() - info.mtimeMs > ttlMs) return undefined
        const value = JSON.parse(await readFile(file, 'utf8'))
        memory.set(key, { at: info.mtimeMs, value })
        return value
      } catch {
        return undefined
      }
    },
    async set(key, value) {
      memory.set(key, { at: Date.now(), value })
      if (!(ttlMs > 0)) return
      await ensureDir()
      await writeFile(fileOf(key), JSON.stringify(value), 'utf8').catch(() => {})
    },
    /** 清掉过期文件，避免临时目录无限增长。 */
    async prune(maxAgeHours = 24 * 14) {
      await ensureDir()
      const files = await readdir(root).catch(() => [])
      const limit = Date.now() - maxAgeHours * 3600 * 1000
      for (const name of files) {
        if (!name.endsWith('.json')) continue
        const file = path.join(root, name)
        const info = await stat(file).catch(() => undefined)
        if (info && info.mtimeMs < limit) await unlink(file).catch(() => {})
      }
    },
  }
}
