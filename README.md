# dsh-image-search · 以图搜图

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

> 给 AI 装一双会顺藤摸瓜的眼睛喵。

一张图丢进去，它告诉你：**这是谁、出自哪部作品哪一集、原图从哪儿来**。

- 工具名：`image_search`
- 适用：[DeepSeek Harness (DSH)](https://github.com/deepseek-ai) 插件体系
- 零 Key 也能用：AnimeTrace + trace.moe 免费打底
- 许可证：MIT

> **隐私提示喵**：使用时会把你给的图片上传到 AnimeTrace / trace.moe / SerpApi。涉密、内部或隐私图片请不要使用云端链路，详见 [SECURITY.md](./SECURITY.md)。

## 目录

- [这是什么](#这是什么) · [三分钟上手](#三分钟上手) · [设计取舍](#为什么长这样设计取舍)
- [工作原理](#工作原理) · [引擎](#引擎) · [工具参数](#工具参数)
- [返回结构](#返回结构) · [配置](#配置) · [限制](#已知限制)
- [排查](#排查) · [常见问题](#常见问题faq) · [开发](#开发)

## 这是什么

在聊天里发一张图，问「这是谁」「哪部番」「哪来的」，AI 会自己调这个工具。

**适合**

- 认二次元角色、查出自哪部作品
- 番剧截图找集数（trace.moe 能精确到秒）
- 追一张图的原始出处（Danbooru / Pixiv / 作品官网）
- 配合 Lens 认梗图、实物、真人

**不适合**

- 批量爬图、图库去重（那是另一个品类的工具）
- 涉密或隐私图片（云端链路，没有本地识别）
- 离线环境（所有引擎都在线）

## 三分钟上手

**1. 装进 DSH profile**

```
plugin_manager action=install_bundle target=<本目录绝对路径>
```

**2.（可选，但强烈建议）配 Google Lens Key**，免费 250 次/月：

```powershell
setx SERPAPI_KEY "你的key"
```

**3. 重启 DSH**（Host 插件是进程级加载）。

**4. 用起来**

```js
image_search({ image: 'D:/素材/a.png' })
```

没有 Key 也能跑，只是少了 Lens 这一层——对梗图、真人、实拍的覆盖会明显变弱喵。

## 为什么长这样（设计取舍）

- **免费优先**：先跑不要钱的引擎，认不出才动额度。省的是你的钱包，不是我的。
- **诚实优先**：候选都不可靠时明说「未识别」，只保留候选，不编一个像模像样的答案。宁可说不知道，也不瞎猜喵。
- **额度意识**：内容哈希缓存 + 并行调度 + 分级降级，同一张图重复问不花钱。
- **公开版只走官方 HTTP 接口**：不驱动浏览器、不做页面自动化，行为可预测、也更好维护。

## 工作原理

```
图片（本地路径 / URL）
  ↓ 读字节 + sha256（命中缓存直接返回，不花额度）
  ↓
第一波：AnimeTrace ∥ trace.moe        ← 免费、快（约 3~5 秒）
  ↓ 拿到高置信？→ 是，结束
  ↓ 否
第二波：Google Lens                    ← 通用兜底（需 Key）
  ↓
出处页：AniList 角色/作品页 + Lens 返回的来源页
  ↓
结构化 JSON + 一句话结论
```

## 引擎

| 引擎 | 作用 | 额度 | Key |
|---|---|---|---|
| Google Lens (SerpApi) | 通用最强：梗图/实物/真人/画师溯源，返回来源页 | 免费 250 次/月 | `serpapiKey` |
| AnimeTrace | 二次元插画/头像 → 角色名 + 作品名 + 位置框 | 匿名有限，容易 429；注册免费 token 可放宽 | 可选 |
| trace.moe | 番剧截图 → 番剧 + 集数 + 时间点 + AniList 页面 | 免费 100 次/天 | 不需要 |
| AniList | 作品/角色出处页 | 免费 | 不需要 |

Lens 的本地图片走两步：`POST /image` 拿 `image_id` → 再查 Lens。图片超过 `serpapiUploadMaxBytes` 时先用 **sharp** 压到上限内（纯 Node，不用浏览器）。

## 工具参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `image` | string | 必填 | 本地绝对路径，或 `http(s)` 图片地址 |
| `intent` | string | `auto` | `auto` 均衡；`character` 只关心角色；`anime` 只关心番剧出处 |
| `engine` | string | `auto` | `auto` 自动降级；也可强制 `lens` / `animetrace` / `tracemoe` |
| `max_results` | integer | `6` | 最多返回多少条候选与出处链接（1–12） |

```js
image_search({ image: 'C:\\Users\\me\\Desktop\\a.png' })
image_search({ image: 'https://example.com/a.jpg', intent: 'anime' })
image_search({ image: 'a.png', engine: 'lens' })
```

## 返回结构

下面是字段示意（取自真实运行、已裁剪合并；**未触发的引擎字段会直接省略**，不是空对象）。

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

免费引擎都不可靠时（`ok` 为 `false`，候选仍然返回，方便上层自行判断）：

```json
{
  "ok": false,
  "message": "未识别出明确角色，仅有低置信候选（如 園田萌舞風）",
  "image_kind": "path",
  "image_sha256": "c0ffee1234567890",
  "guesses": [
    {
      "name": "園田萌舞風",
      "work": "てさぐれ！部活もの すぴんおふ プルプルんシャルムと遊ぼう",
      "confidence": "low",
      "engine": "animetrace",
      "box": [0.17, 0.068, 0.352, 0.296]
    }
  ],
  "engines": ["animetrace", "tracemoe"],
  "notes": [
    "AnimeTrace 给出的候选置信度偏低",
    "trace.moe 今日额度 7/100",
    "trace.moe 最高相似度仅 0.561，未作为结论"
  ]
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
| `links[]` | array | 汇总后的出处页（AniList + Lens 的来源页，已去重） |
| `engines` | array | 本次实际跑过的引擎（按固定顺序，与完成先后无关） |
| `notes[]` | array | 额度、超时、降级、压缩等说明——**失败原因都写在这里**，不会编造结论 |

机器可读的版本见 [`schema/output.json`](./schema/output.json)（`node dev/gen-schema.mjs` 重新生成）。

## 配置

### 1. 拿 Key（只有 Lens 需要）

| Key | 必需吗 | 去哪拿 | 免费额度 |
|---|---|---|---|
| `SERPAPI_KEY` | 否，但没有就没有 Lens | [注册](https://serpapi.com/users/sign_up) → [管理页复制](https://serpapi.com/manage-api-key) | 250 次/月 |
| `ANIMETRACE_TOKEN` | 否 | [animetrace.com](https://www.animetrace.com) | 匿名有限，配 token 可放宽 |

SerpApi 注册只需要邮箱，**不需要信用卡**，也不会自动扣费。额度用完只是当月停用，不会产生账单喵。

### 2. 填进去（三选一）

| 方式 | 适合 | 生效条件 |
|---|---|---|
| **环境变量**（推荐） | 不想让 Key 进任何文件 | **重启 DSH** |
| profile 覆盖 | 想和其它配置放一起 | 重启 DSH（或等热重载） |
| 设置界面 | 图形化填表 | 保存后生效（能看到这个插件的设置项时） |

**环境变量**

```powershell
# Windows（PowerShell）
setx SERPAPI_KEY "你的key"
setx ANIMETRACE_TOKEN "你的token"   # 可选
```

```bash
# macOS / Linux
export SERPAPI_KEY="你的key"
export ANIMETRACE_TOKEN="你的token"   # 可选
```

> ⚠️ `setx` / `export` 只影响**之后启动**的进程。DSH 已经在跑的话，必须**完全退出再打开**才能读到；从旧终端里启动的 DSH 也可能拿不到，建议用桌面图标启动。

**profile 覆盖**（在 `~/.dsh/profiles/<你的 profile>/cordis.patch.yml` 里追加）

```yaml
- id: image-search
  name: dsh-image-search
  config:
    serpapiKey: '你的key'
    # 注意：覆盖会替换整个 config，建议把下面「可选配置项」里的键一起抄全
```

### 3. 确认生效

- 让 AI 跑一次 `image_search`，看返回的 `engines` 里有没有 `lens`（或 `notes` 里有没有 `lens 失败：...`）
- 或者故意把 Key 改错一位：能报 `401 Invalid API key` 就说明**读到了**，改回来即可

### 4. 配了却没生效？

| 症状 | 原因 |
|---|---|
| 结果里完全没有 Lens | 没重启 DSH，或 Key 没被读到 |
| `401 Invalid API key` | Key 复制错、带了空格或换行 |
| `429` | 当月 250 次用完了，下月重置 |
| 设置界面看不到这个插件 | 当前 DSH 版本可能还没投影这个 schema，改用环境变量 |

### 可选配置项

插件声明的 `Config` schema 会用默认值补全缺省项，并在加载时拒绝类型错误的值（比如把 `timeoutMs` 写成字符串）。

| 键 | 默认 | 说明 |
|---|---|---|
| `serpapiKey` | `''` | Google Lens 的 Key；留空则跳过 Lens（可用环境变量 `SERPAPI_KEY`） |
| `lensPolicy` | `auto` | `auto`=免费引擎认不出才用 Lens；`always`=每次都先用 |
| `serpapiUploadMaxBytes` | `500000` | SerpApi 上传上限，超过先用 sharp 压缩 |
| `compressMaxDimension` | `1600` | 压缩时最长边上限（像素） |
| `animetraceToken` | `''` | AnimeTrace token（可用 `ANIMETRACE_TOKEN`） |
| `enableAnimeTrace` | `true` | 关掉可省额度 |
| `enableTraceMoe` | `true` | trace.moe 开关 |
| `maxImageBytes` | `8388608` | 图片大小上限 |
| `cacheTtlHours` | `24` | 同一张图的结果缓存时长 |
| `timeoutMs` | `60000` | 单次调用总超时 |
| `engineTimeoutMs` | `12000` | 单引擎超时 |

### 关于 sharp

压缩依赖 [sharp](https://github.com/lovell/sharp)，已声明为 `optionalDependencies`：正常安装会一起装上；如果安装被跳过或失败，插件会退回在 DSH profile 的 pnpm 仓库里查找，再找不到就不压缩，并在 `notes` 里说明原因。

## 已知限制

别期待它做不到的事喵：

- **梗图、真人、实拍、冷门画师**：免费三件套基本无能为力，需要 Lens（或代理直连 SauceNAO/ascii2d）。
- **AniList 只覆盖日本动画**：真人影视、游戏、国漫的出处页拿不到。
- **AnimeTrace 有训练分布**：主流日系角色很准，画风不符时只会给低置信候选。
- **额度是硬上限**：trace.moe 100 次/天、SerpApi 250 次/月，用尽后只能等下个周期或换 Key。
- **不做本地识别**：所有引擎都在线，断网就只剩缓存。

## 排查

| 现象 | 原因 / 处理 |
|---|---|
| 工具列表里没有 `image_search` | 装完没重启 DSH，重启一次 |
| `401 Invalid API key` | `SERPAPI_KEY` 贴错或带空格 |
| `429` / `请求过于频繁` | 额度用尽或触发限流；Lens 等下月，AnimeTrace 可注册免费 token |
| Lens 没出现在结果里 | `lensPolicy: auto` 时，免费引擎已高置信就跳过；要强制就传 `engine: "lens"` |
| `图片 XXXKB，上传上限约 500KB` | 本机没找到 sharp，装一下或先手动压缩 |
| 结果全是低置信候选 | 正常行为——这类图免费引擎确实认不出，加 Lens 或换清晰整图 |
| 第二次问同一张图很快 | 缓存命中，没发请求，也没花额度 |

## 常见问题（FAQ）

**没有 Key 能用吗？**
能。免费链路（AnimeTrace + trace.moe）对日系角色和番剧截图效果不错，只是覆盖不到梗图和真人。

**为什么它说「未识别」，却又给了候选？**
候选是引擎的真实输出，但置信度低。`ok: false` 表示「我不确定」，候选留给你自己判断——这是设计，不是 bug 喵。

**图片会被上传吗？**
会。以图搜图必须把图交给搜索引擎，没有本地替代方案。介意的话请勿使用。

**支持 GIF / 视频吗？**
GIF 会按静态图处理（取首帧）；视频不支持，先截一帧再传。

**为什么第二次问同一张特别快？**
按内容 sha256 缓存 24 小时，命中后不发请求、不花额度。

**能自己加引擎吗？**
可以。包目录里放一个 `lib/engines.local.cjs`（不入库）就能挂自定义引擎，协议见文件头注释。

## 开发

仓库自带两张 CC0 测试图（`dev/assets/`，由项目用 sharp 从内联 SVG 生成，无任何第三方素材），所以**不传参数就能跑**：

```bash
# 离线冒烟测试（不需要 Key，走免费引擎）——验证链路是否跑通
node dev/smoke-test.mjs

# Lens 冒烟测试（消耗 1 次 SerpApi 额度）——验证 Key 和上传链路
node dev/smoke-test-lens.mjs

# 重新生成 schema/output.json
node dev/gen-schema.mjs
```

默认图是抽象几何图形，**任何引擎都认不出内容**——验证的是「链路通、结构对」，不是「认得准」。想看识别效果就传自己的图：

```bash
node dev/smoke-test.mjs "D:/素材/某张动漫角色图.jpg"
```

`dev/samples/` 留给本地图片（不会提交），`dev/assets/` 是仓库自带素材。

## 贡献

欢迎 PR，但请先读 [CONTRIBUTING.md](./CONTRIBUTING.md)。简单说：别把 Key 提交上来，别为了让测试变绿而伪造结果，改行为请附一条 `notes` 说明喵。

## 致谢

- [SerpApi](https://serpapi.com/) — Google Lens API
- [AnimeTrace](https://www.animetrace.com/) — 二次元角色识别
- [trace.moe](https://trace.moe/) — 番剧场景检索
- [AniList](https://anilist.co/) — 出处页数据

## 许可证

[MIT](./LICENSE) © 2026 dsh-image-search contributors

本项目仅调用上述第三方服务的公开接口；各服务受其自身服务条款约束，使用者需自备 Key，作者不对识别结果与第三方服务的可用性提供担保。
