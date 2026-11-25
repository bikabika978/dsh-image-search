/** 解析 @deepseek-ai/schemastery（用于声明 Config schema）。解析不到时返回 null，配置原样透传。 */
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'

let cached

function candidateBases() {
  const bases = []
  if (process.env.DSH_PROFILE_DIR) bases.push(process.env.DSH_PROFILE_DIR)
  const profile = process.env.DSH_PROFILE || 'desktop'
  bases.push(path.join(homedir(), '.dsh', 'profiles', profile))
  bases.push(process.cwd())
  return [...new Set(bases.filter(Boolean))]
}

export function loadSchemastery() {
  if (cached !== undefined) return cached
  for (const base of candidateBases()) {
    const req = createRequire(path.join(base, 'noop.cjs'))
    const attempts = [
      () => req('@deepseek-ai/schemastery'),
      () => req(path.join(base, 'node_modules', '.pnpm', 'node_modules', '@deepseek-ai', 'schemastery')),
    ]
    for (const attempt of attempts) {
      try {
        const mod = attempt()
        if (mod && typeof mod.object === 'function') {
          cached = mod
          return cached
        }
      } catch {
        /* 下一个候选 */
      }
    }
  }
  cached = null
  return cached
}
