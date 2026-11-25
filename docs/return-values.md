# 返回结构

`image_search` 成功时返回一个 JSON 对象，失败时抛错（不会返回半成品）。**未触发的引擎字段会直接省略**，不是空对象喵。

机器可读版本见 [`schema/output.json`](../schema/output.json)，由 `node dev/gen-schema.mjs` 从代码里的 `OUTPUT_SCHEMA` 生成。

## 命中角色 + Lens

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

## 只有低置信候选（`ok: false`）

候选仍然返回，方便上层自行判断：

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

## 字段说明

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
| `cached` | boolean | 仅缓存命中时出现，表示本次没有发起请求 |
