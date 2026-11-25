// 离线冒烟测试：用假 ctx 加载插件，直接调用 image_search 工具。
// 用法：node dsh-image-search/dev/smoke-test.mjs [图片路径]
// 不传路径时使用 dev/assets 里的 CC0 测试图（只验证链路，不会识别出内容）。
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply } from '../index.js'

const registered = []
const ctx = {
  effect(fn) {
    const dispose = fn()
    return () => dispose?.()
  },
  inject(deps, cb) {
    // 不提供 browser：验证百度兜底缺失时的降级
    if (deps.includes('tools')) {
      const d = cb({
        effect(fn) {
          const dispose = fn()
          return () => dispose?.()
        },
        tools: { register: (tool) => { registered.push(tool); return () => {} } },
      })
      return () => d?.()
    }
    return () => {}
  },
}

apply(ctx, { enableBaiduFallback: false, animetraceToken: '', cacheTtlHours: 0 })

const tool = registered.find((t) => t.name === 'image_search')
if (!tool) throw new Error('工具未注册')
console.log('tool registered:', tool.name, '| params required:', JSON.stringify(tool.parameters.required))

const image = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'cc0-shapes-640x480.png')
const value = await tool.execute({ image, intent: 'auto', engine: 'auto', max_results: 6 }, { signal: new AbortController().signal })
console.log('\n=== value ===')
console.log(JSON.stringify(value, null, 2))
console.log('\n=== rendered ===')
for (const block of tool.output.render({}, value)) console.log(block.text)
