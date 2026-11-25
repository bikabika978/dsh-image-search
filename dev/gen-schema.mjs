// 生成 schema/output.json —— image_search 返回值的机器可读契约。
// 单一来源是 index.js 里的 OUTPUT_SCHEMA，避免文档与实现漂移。
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { OUTPUT_SCHEMA } from '../index.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const document = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'image_search output',
  description: 'dsh-image-search 工具的成功返回值结构（失败时抛错，不返回该结构）。',
  ...OUTPUT_SCHEMA,
}

mkdirSync(path.join(root, 'schema'), { recursive: true })
writeFileSync(path.join(root, 'schema', 'output.json'), `${JSON.stringify(document, null, 2)}\n`, 'utf8')
console.log('已写入 schema/output.json')
