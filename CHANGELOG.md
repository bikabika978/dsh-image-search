# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Planned

- 代理支持（`proxyUrl` + CONNECT 隧道），用于解锁更多引擎
- 可选视觉模型引擎（看图 → 关键词 → 再检索）

## [0.1.0] - 2026-11-25

首个公开版本喵。

### Added

- `image_search` 工具：本地路径 / URL → 角色、作品、番剧集数、图片来源页
- 引擎：Google Lens（SerpApi）、AnimeTrace、trace.moe、AniList 出处页
- 并行调度：免费引擎先跑，未命中才动用 Lens
- 内容哈希缓存（默认 24 小时），同图不重复消耗额度
- Lens 两步上传（`POST /image` → `image_id`），超限图片用 sharp 自动压缩
- 低置信保护：候选不可靠时返回 `ok: false`，只保留候选
- `Config` schema：默认值补全 + 类型校验
- `SERPAPI_KEY` / `ANIMETRACE_TOKEN` 环境变量支持
- 失败原因统一写入 `notes[]`，不编造结论
- CC0 测试图与离线冒烟测试
