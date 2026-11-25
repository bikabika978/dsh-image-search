// 冒烟测试：用真实 Key 跑一次 Lens（会消耗额度）。用法：
//   node dsh-image-search/dev/smoke-test-lens.mjs [图片路径]
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { apply } from '../index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgDir = path.resolve(here, '..')
const cfgText = readFileSync(path.join(pkgDir, 'cordis.patch.yml'), 'utf8')
const key = /serpapiKey:\s*'([0-9a-f]+)'/.exec(cfgText)?.[1]
if (!key) throw new Error('cordis.patch.yml 里没有读到 serpapiKey')

const image = process.argv[2] || path.join(here, 'assets', 'cc0-shapes-640x480.png')
if (!process.argv[2]) {
  console.error('提示：未指定图片，使用 CC0 测试图。它会消耗 1 次额度，但只会得到无意义匹配；')
  console.error('      想验证识别效果请传一张真实图片：node dev/smoke-test-lens.mjs <图片路径>')
}

const reg = []
const ctx = {
  effect(fn) { fn(); return () => {} },
  inject(deps, cb) {
    if (deps.includes('tools')) {
      return cb({ effect(fn) { fn(); return () => {} }, tools: { register: (t) => { reg.push(t); return () => {} } } })
    }
    return () => {}
  },
}

apply(ctx, { serpapiKey: key, enableAnimeTrace: false, enableTraceMoe: false, enableBaiduFallback: false })

const value = await reg[0].execute({ image, engine: 'lens', max_results: 6 }, { signal: new AbortController().signal })
console.log('ok:', value.ok, '| engines:', (value.engines || []).join(','), '| 链接数:', (value.links || []).length)
if (value.notes?.length) console.log('notes:', value.notes.join(' | '))
console.log('--- rendered ---')
console.log(reg[0].output.render({}, value)[0].text)
