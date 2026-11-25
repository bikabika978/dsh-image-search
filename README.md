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

## 返回结构

下面是字段示意（取自真实运行、已裁剪合并；未触发的引擎字段会直接省略，不是空对象）。

命中角色 + Lens 时：

```json
{
  "ok": true,
  "message": "可能是 レム（Re:ゼロから始める異世界生活）；作品 Re:Zero kara Hajimeru Isekai Seikatsu",
  "image_kind": "path",
  "image_sha256": "5eaeb2340a770998",
  "guesses": [
    {
      "name": "レム",
      "work": "Re:ゼロから始める異世界生活",
      "confidence": "high",
      "engine": "animetrace",
      "box": [0.366, 0.15, 0.742, 0.428]
    }
  ],
  "anime": {
    "title": "Re:Zero kara Hajimeru Isekai Seikatsu",
    "anilist_url": "https://anilist.co/anime/21355",
    "engine": "anilist"
  },
  "lens": {
    "knowledge_title": "",
    "visual_matches": [
      {
        "title": "rem (re:zero kara hajimeru isekai seikatsu) drawn by ssosso",
        "source": "Danbooru",
        "link": "https://danbooru.donmai.us/posts/12525208",
        "thumbnail": "https://cdn.donmai.us/...jpg"
      },
      {
        "title": "Rem (Re:Zero) - Re:Zero Kara Hajimeru Isekai Seikatsu",
        "source": "Zerochan",
        "link": "https://www.zerochan.net/2770624",
        "thumbnail": "https://static.zerochan.net/...jpg"
      }
    ],
    "exact_matches": [],
    "organic": []
  },
  "links": [
    { "label": "AniList 角色：Rem", "url": "https://anilist.co/character/88575" },
    { "label": "AniList 作品：Re:Zero kara Hajimeru Isekai Seikatsu", "url": "https://anilist.co/anime/21355" },
    { "label": "Danbooru：rem (re:zero ...) drawn by ssosso", "url": "https://danbooru.donmai.us/posts/12525208" }
  ],
  "engines": ["animetrace", "lens"],
  "notes": ["已压缩后上传 Lens：884KB → 161KB（1200x1567, q82）"]
}
```

前三层都没结论、走百度兜底时（只列出该场景相关的字段）：

```json
{
  "ok": true,
  "message": "百度识图认为图中可能是 初音未来",
  "image_kind": "url",
  "image_sha256": "85b170d3a2c40e19",
  "baidu": {
    "guess": "初音未来",
    "text": "图中可能是初音未来 相关商品 ... 图片来源 ...",
    "sources": [
      { "title": "【MIKU】世界第一公主殿下 初音未来特辑（4） - 哔哩哔哩", "url": "http://www.bilibili.com/read/cv11995807" },
      { "title": "布洛妮娅゜扎伊切克的动态 - 哔哩哔哩", "url": "http://www.bilibili.com/opus/971605792310427653" }
    ]
  },
  "links": [
    { "label": "哔哩哔哩：【MIKU】世界第一公主殿下 ...", "url": "http://www.bilibili.com/read/cv11995807" }
  ],
  "engines": ["baidu"],
  "notes": ["AnimeTrace 给出的候选置信度偏低", "trace.moe 没有匹配到番剧"]
}
```

字段说明：

| 字段 | 类型 | 含义 |
|---|---|---|
| `ok` | boolean | 是否得到可用结论。**只有低置信候选时是 `false`**，候选仍会返回 |
| `message` | string | 一句话结论，可直接展示给用户 |
| `image_kind` / `image_sha256` | string | 输入是 `path` 还是 `url`；内容哈希（缓存键，仅取前 16 位） |
| `guesses[]` | array | 角色候选：`name` 角色名、`work` 作品名、`confidence` `high`/`low`、`engine`、`box` 归一化位置框 |
| `anime` | object | 番剧/作品：trace.moe 会给 `episode`/`at`/`similarity`；只有 AniList 解析时是作品页 |
| `lens` | object | `knowledge_title`/`knowledge_description` 识别结论、`text` 图中文字、`visual_matches[]`/`exact_matches[]` 来源页、`organic[]` 相关网页 |
| `baidu` | object | 兜底：`guess` 推测主体、`text` 页面摘要、`sources[]` 图片来源页 |
| `links[]` | array | 汇总后的出处页（AniList + Lens/百度的来源页，已去重） |
| `engines` | array | 本次实际跑过的引擎（按固定顺序，与完成先后无关） |
| `notes[]` | array | 额度、超时、降级、压缩等说明——**失败原因都写在这里**，不会编造结论 |

## 行为说明

- **缓存**：按图片内容 sha256 缓存，同一张图重复问不再消耗额度。
- **隐私**：图片会被上传到 AnimeTrace / trace.moe / SerpApi / 百度，这是以图搜图的固有代价；详见 [SECURITY.md](./SECURITY.md)。
- **百度兜底**：通过共享浏览器操作识图页（URL 粘贴或本地文件注入），页面会出现在浏览器窗口里，遇到验证码可由人接手。
- **额度耗尽**：引擎报 429 时会在 `notes` 里如实说明，不会编造结果。
- **低置信不冒充结论**：所有候选置信度偏低时返回「未识别出明确角色」，只保留候选。

## 开发

仓库自带两张 CC0 测试图（`dev/assets/`，由项目用 sharp 从内联 SVG 生成，无任何第三方素材），所以**不传参数就能跑**：

```bash
# 离线冒烟测试（不需要 Key，走免费引擎）——验证链路是否跑通
node dev/smoke-test.mjs

# Lens 冒烟测试（消耗 1 次 SerpApi 额度）——验证 Key 和上传链路
node dev/smoke-test-lens.mjs
```

默认图是抽象几何图形，**任何引擎都认不出内容**——验证的是「链路通、结构对」，不是「认得准」。想看识别效果就传自己的图：

```bash
node dev/smoke-test.mjs "D:/素材/某张动漫角色图.jpg"
```

`dev/samples/` 留给本地图片（不会提交），`dev/assets/` 是仓库自带素材。

## 致谢

- [SerpApi](https://serpapi.com/) — Google Lens API
- [AnimeTrace](https://www.animetrace.com/) — 二次元角色识别
- [trace.moe](https://trace.moe/) — 番剧场景检索
- [AniList](https://anilist.co/) — 出处页数据

## 许可证

[MIT](./LICENSE) © 2026 dsh-image-search contributors

本项目仅调用上述第三方服务的公开接口；各服务受其自身服务条款约束，使用者需自备 Key，作者不对识别结果与第三方服务的可用性提供担保。
