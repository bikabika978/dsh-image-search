# dsh-image-search · 以图搜图

给 AI 一个反查图片的能力：**这是什么角色、出自哪部作品/哪一集、图片来源页面在哪**。

- 工具名：`image_search`
- 适用：[DeepSeek Harness (DSH)](https://github.com/deepseek-ai) 插件体系
- 许可证：MIT

## 引擎

| 引擎 | 作用 | 额度 | Key |
|---|---|---|---|
| Google Lens (SerpApi) | 通用最强：梗图/实物/真人/画师溯源，返回来源页 | 免费 250 次/月 | `serpapiKey` |
| AnimeTrace | 二次元插画/头像/表情包 → 角色名 + 作品名 + 位置框 | 匿名有限，容易 429；注册免费 token 可放宽 | 可选 |
| trace.moe | 番剧截图 → 番剧 + 集数 + 时间点 + AniList 页面 | 免费 100 次/天 | 不需要 |
| Baidu 识图 | 兜底：通用图 → 「图中可能是 X」+ 图片来源页 | 免费，走真实浏览器，偶尔需人工过验证 | 不需要 |
| AniList | 作品/角色出处页 | 免费 | 不需要 |

`engine: auto` 时：**AnimeTrace 与 trace.moe 并行**（免费、快），拿到高置信就结束；否则并行上 **Lens**（配了 Key）和 **百度**兜底。

Lens 的本地图片走两步：`POST /image` 拿 `image_id` → 再查 Lens。图片超过 `serpapiUploadMaxBytes` 时先用 **sharp** 压到上限内（纯 Node，不用浏览器）。

## 安装

把本目录装进 DSH profile：

```
plugin_manager action=install_bundle target=<本目录绝对路径>
```

前提：DSH profile 里要有 `dsh-builtin-browser`（百度兜底用）。没有也能跑，只是少了兜底引擎。

## 配置

**推荐用环境变量**，这样密钥不会进任何文件：

```bash
# Windows（PowerShell，设置后重启 DSH）
setx SERPAPI_KEY "你的key"
setx ANIMETRACE_TOKEN "你的token"   # 可选

# macOS / Linux
export SERPAPI_KEY="你的key"
```

或者在 profile 的 `cordis.patch.yml` 里覆盖整行配置（**注意：覆盖会替换整个 config，必须写全所有键**）。

仓库里的 [`cordis.patch.yml`](./cordis.patch.yml) 只包含占位符，不含任何密钥。

| 键 | 默认 | 说明 |
|---|---|---|
| `serpapiKey` | `''` | Google Lens 的 Key；留空则跳过 Lens（可用环境变量 `SERPAPI_KEY`） |
| `lensPolicy` | `auto` | `auto`=免费引擎认不出才用 Lens；`always`=每次都先用 |
| `serpapiUploadMaxBytes` | `500000` | SerpApi 上传上限，超过先用 sharp 压缩 |
| `compressMaxDimension` | `1600` | 压缩时最长边上限（像素） |
| `animetraceToken` | `''` | AnimeTrace token（可用 `ANIMETRACE_TOKEN`） |
| `enableAnimeTrace` | `true` | 关掉可省额度 |
| `enableTraceMoe` | `true` | trace.moe 开关 |
| `enableBaiduFallback` | `true` | 百度兜底开关（需要 `dsh-builtin-browser`） |
| `maxImageBytes` | `8388608` | 图片大小上限 |
| `maxBaiduBytes` | `4194304` | 超过这个大小的图不走浏览器上传 |
| `cacheTtlHours` | `24` | 同一张图的结果缓存时长 |
| `timeoutMs` | `60000` | 单次调用总超时 |
| `engineTimeoutMs` | `12000` | 单引擎超时 |

### 关于 sharp

压缩依赖 [sharp](https://github.com/lovell/sharp)。插件**不强制安装**：优先按常规依赖解析，其次在 DSH profile 的 pnpm 仓库里查找；都找不到就不压缩，并在 `notes` 里说明原因。想让大图也能走 Lens，可以在 profile 里装 sharp。

## 用法

```js
image_search({ image: 'C:\\Users\\me\\Desktop\\a.png' })
image_search({ image: 'https://example.com/a.jpg', intent: 'anime' })
image_search({ image: 'a.png', engine: 'baidu' })
```

返回：`guesses[]`（角色候选）、`anime`（番剧/作品页）、`lens`（Lens 识别与来源页）、`baidu`（兜底结果）、`links[]`（出处页）、`notes[]`（额度/失败原因）。

## 行为说明

- **缓存**：按图片内容 sha256 缓存，同一张图重复问不再消耗额度。
- **隐私**：图片会被上传到 AnimeTrace / trace.moe / SerpApi / 百度，这是以图搜图的固有代价；详见 [SECURITY.md](./SECURITY.md)。
- **百度兜底**：通过共享浏览器操作识图页（URL 粘贴或本地文件注入），页面会出现在浏览器窗口里，遇到验证码可由人接手。
- **额度耗尽**：引擎报 429 时会在 `notes` 里如实说明，不会编造结果。
- **低置信不冒充结论**：所有候选置信度偏低时返回「未识别出明确角色」，只保留候选。

## 开发

```bash
# 离线冒烟测试（不需要 Key，走免费引擎）
node dev/smoke-test.mjs <图片路径>

# Lens 冒烟测试（消耗 1 次 SerpApi 额度）
node dev/smoke-test-lens.mjs <图片路径>
```

`dev/samples/` 里不放任何图片素材（版权原因），自测时自己指定路径。

## 致谢

- [SerpApi](https://serpapi.com/) — Google Lens API
- [AnimeTrace](https://www.animetrace.com/) — 二次元角色识别
- [trace.moe](https://trace.moe/) — 番剧场景检索
- [AniList](https://anilist.co/) — 出处页数据

## 许可证

[MIT](./LICENSE) © 2026 dsh-image-search contributors

本项目仅调用上述第三方服务的公开接口；各服务受其自身服务条款约束，使用者需自备 Key，作者不对识别结果与第三方服务的可用性提供担保。
