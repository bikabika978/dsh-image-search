# 贡献指南

感谢你愿意帮忙喵。

## 开始之前

- **不要提交密钥**。`cordis.patch.yml` 只放占位符，Key 走环境变量或本机 profile 覆盖。
- **不要为了让测试变绿而伪造结果**。识别不出来就说识别不出来，这个项目靠"诚实"立足。
- 有行为改动时，请在 PR 描述里说明对 `notes[]` 或 `ok` 的影响。

## 本地开发

```bash
# 语法检查
node --check index.js
for f in lib/*.js; do node --check "$f"; done

# 离线冒烟（不需要任何 Key）
node dev/smoke-test.mjs

# Lens 冒烟（需要 SERPAPI_KEY，会消耗 1 次额度）
node dev/smoke-test-lens.mjs

# 重新生成输出 schema
node dev/gen-schema.mjs
```

## 代码结构

| 文件 | 职责 |
|---|---|
| `index.js` | 工具定义、引擎调度、结果合并、渲染 |
| `lib/animetrace.js` | 二次元角色识别 |
| `lib/tracemoe.js` | 番剧截图识别 |
| `lib/serpapi.js` | Google Lens（两步上传 + 解析） |
| `lib/anilist.js` | 出处页解析（带 7 天内存缓存） |
| `lib/image.js` | 读图、格式嗅探、内容哈希 |
| `lib/compress.js` | 上传前压缩（sharp，可选依赖） |
| `lib/cache.js` | 结果缓存 |
| `lib/config-schema.js` | 运行时解析 schemastery，用于声明 `Config` |

## 新增一个引擎

1. 在 `lib/` 下写一个 `queryXxx({ img, signal, ... })`，返回纯数据
2. 在 `index.js` 的 `ENGINES` 与 `createEngineRunner` 里接上
3. 在 `mergeEngineResult` 里定义它的补丁如何影响 `value`
4. 补 README 的引擎表、参数、返回结构
5. 跑一遍冒烟测试，确认失败路径也会写进 `notes[]`

**不要新增页面自动化引擎**到公开版本里；这类实现请放在本地扩展（`lib/engines.local.cjs`，已在 `.gitignore` 中）。

## 提交信息

参考 Conventional Commits：`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`。

## 许可证

提交即表示你同意以 [MIT](./LICENSE) 授权你的贡献。
