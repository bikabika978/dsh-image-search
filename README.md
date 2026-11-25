# dsh-image-search · 以图搜图

[![npm](https://img.shields.io/npm/v/dsh-image-lens.svg)](https://www.npmjs.com/package/dsh-image-lens)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

> 给 AI 装一双会顺藤摸瓜的眼睛喵。

一张图丢进去，它告诉你：**这是谁、出自哪部作品哪一集、原图从哪儿来**。

- 工具名：`image_search`
- npm 包名：**`dsh-image-lens`**（`dsh-image-search` 已被其他插件占用）
- 适用：[DeepSeek Harness (DSH)](https://github.com/deepseek-ai) 插件体系
- 零 Key 也能用：AnimeTrace + trace.moe 免费打底
- 许可证：MIT

> **隐私提示**：使用时会把你给的图片上传到 AnimeTrace / trace.moe / SerpApi。涉密、内部或隐私图片请不要使用云端链路，详见 [SECURITY.md](./SECURITY.md)。

## 这是什么

在聊天里发一张图，问「这是谁」「哪部番」「哪来的」，AI 会自己调这个工具。

**适合**：认二次元角色、查作品；番剧截图找集数（精确到秒）；追一张图的原始出处；配合 Lens 认梗图/实物/真人。

**不适合**：批量爬图与图库去重；涉密或隐私图片；离线环境（所有引擎都在线）。

## 三分钟上手

**1. 装进 DSH profile**

从 GitHub 目录安装：

```
plugin_manager action=install_bundle target=<本目录绝对路径>
```

或者从 npm 安装：

```bash
dsh plugin add dsh-image-lens
```

**2.（可选，但推荐）配 Google Lens Key**，免费 250 次/月：

```powershell
setx SERPAPI_KEY "你的key"     # macOS/Linux: export SERPAPI_KEY="你的key"
```

**3. 重启 DSH**（Host 插件是进程级加载）。

**4. 用起来**

```js
image_search({ image: 'D:/素材/a.png' })
```

没有 Key 也能跑，只是少了 Lens 这一层——对梗图、真人、实拍的覆盖会明显变弱喵。

## 为什么长这样（设计取舍）

- **免费优先**：先跑不要钱的引擎，认不出才动额度。省的是你的钱包。
- **诚实优先**：候选都不可靠时明说「未识别」，只保留候选，不编一个像模像样的答案。
- **额度意识**：内容哈希缓存 + 并行调度 + 分级降级，同一张图重复问不花钱。
- **只走官方 HTTP 接口**：不驱动浏览器、不做页面自动化，行为可预测、也更好维护。

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

Lens 的本地图片走两步：`POST /image` 拿 `image_id` → 再查 Lens。超过上传上限时先用 **sharp** 压（纯 Node，不用浏览器）。

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

返回一个 JSON 对象，**未触发的引擎字段会直接省略**：

```
{ ok, message, image_kind, image_sha256, guesses[], anime, lens, links[], engines[], notes[] }
```

| 字段 | 说明 |
|---|---|
| `ok` / `message` | 是否得到可用结论；一句话结论。低置信时 `ok: false`，候选仍返回 |
| `guesses[]` | 角色候选：`name`、`work`、`confidence`（high/low）、`box` 归一化位置框 |
| `anime` | 番剧/作品：trace.moe 给 `episode`/`at`/`similarity`；AniList 给作品页 |
| `lens` | 识别结论、图中文字、`visual_matches[]`/`exact_matches[]` 来源页 |
| `links[]` | 汇总去重后的出处页（AniList + Lens 来源页） |
| `notes[]` | 额度、超时、降级、压缩说明——**失败原因都写在这里** |

完整示例（命中 / 只有低置信候选）见 [docs/return-values.md](docs/return-values.md)；机器可读版是 [schema/output.json](./schema/output.json)。

## 配置

**不配也能用。** 要配 Google Lens Key（免费 250 次/月）：

```powershell
setx SERPAPI_KEY "你的key"
# macOS / Linux: export SERPAPI_KEY="你的key"
```

> ⚠️ 环境变量只对**之后启动**的进程生效，DSH 必须完全退出再打开。

拿 Key 的网址、三种配置方式、确认生效和排错，见 [docs/configuration.md](docs/configuration.md)。

## 已知限制

- **梗图、真人、实拍、冷门画师**：免费三件套基本无能为力，需要 Lens（或代理直连 SauceNAO/ascii2d）。
- **AniList 只覆盖日本动画**：真人影视、游戏、国漫的出处页拿不到。
- **AnimeTrace 有训练分布**：主流日系角色很准，画风不符时只会给低置信候选。
- **额度是硬上限**：trace.moe 100 次/天、SerpApi 250 次/月，用尽后等下一个周期或换 Key。
- **不做本地识别**：所有引擎都在线，断网就只剩缓存。

## 排查

| 现象 | 原因 / 处理 |
|---|---|
| 工具列表里没有 `image_search` | 装完没重启 DSH |
| `401 Invalid API key` | Key 贴错或带空格 |
| `429` | 额度用尽或限流；Lens 等下月，AnimeTrace 可注册免费 token |
| Lens 没出现在结果里 | `lensPolicy: auto` 时免费引擎已高置信就跳过；要强制传 `engine: "lens"` |
| `图片 XXXKB，上传上限约 500KB` | 本机没找到 sharp，装一下或手动压缩 |
| 结果全是低置信候选 | 正常——这类图免费引擎确实认不出，加 Lens 或换清晰整图 |
| 第二次问同一张图很快 | 缓存命中，没发请求也没花额度 |

## 常见问题（FAQ）

**没有 Key 能用吗？** 能。免费链路对日系角色和番剧截图效果不错，只是覆盖不到梗图和真人。

**为什么说「未识别」却又给了候选？** 候选是引擎的真实输出但置信度低，`ok: false` 表示「我不确定」，候选留给你自己判断喵。

**图片会被上传吗？** 会。以图搜图必须把图交给搜索引擎，没有本地替代方案。

**支持 GIF / 视频吗？** GIF 按静态图处理（取首帧）；视频不支持，先截一帧再传。

## 开发

仓库自带两张 CC0 测试图（`dev/assets/`，由项目用 sharp 从内联 SVG 生成），所以**不传参数就能跑**：

```bash
node dev/smoke-test.mjs          # 离线冒烟（不需要 Key）
node dev/smoke-test-lens.mjs     # Lens 冒烟（消耗 1 次额度）
node dev/gen-schema.mjs          # 重新生成 schema/output.json
```

默认图是抽象几何图形，任何引擎都认不出内容——验证的是「链路通、结构对」，不是「认得准」。想看识别效果就传自己的图：

```bash
node dev/smoke-test.mjs "D:/素材/某张动漫角色图.jpg"
```

## 贡献

欢迎 PR，先读 [CONTRIBUTING.md](./CONTRIBUTING.md)。简单说：别提交 Key，别为了让测试变绿而伪造结果喵。

## 致谢

[SerpApi](https://serpapi.com/) · [AnimeTrace](https://www.animetrace.com/) · [trace.moe](https://trace.moe/) · [AniList](https://anilist.co/)

## 许可证

[MIT](./LICENSE) © 2026 dsh-image-search contributors

本项目仅调用上述第三方服务的公开接口；各服务受其自身服务条款约束，使用者需自备 Key，作者不对识别结果与第三方服务的可用性提供担保。
