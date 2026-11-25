# 安全说明

## 密钥不要进仓库

这个插件会用到以下凭据，**都不要提交到 Git**：

| 凭据 | 来源 | 配置方式 |
|---|---|---|
| `serpapiKey` | https://serpapi.com/manage-api-key | 环境变量 `SERPAPI_KEY`，或本机 profile 的 `cordis.patch.yml` 覆盖 |
| `animetraceToken`（可选） | https://www.animetrace.com | 环境变量 `ANIMETRACE_TOKEN`，或 profile 覆盖 |

仓库里的 `cordis.patch.yml` 只包含占位符。如果你误提交了密钥：

1. 立刻去对应平台**吊销/重置**该密钥（这是最重要的一步，Git 历史里删不掉泄露）
2. 用 `git filter-repo` 或 BFG 清理历史
3. 如果已经 push，考虑把仓库设为私有并评估影响

## 数据流向

使用本插件时，图片字节会被发送到以下第三方服务（这是以图搜图功能的固有代价）：

- `api.animetrace.com`（角色识别）
- `api.trace.moe`（番剧识别）
- `serpapi.com`（Google Lens 代理）
- 百度识图（通过本机浏览器，仅在启用兜底时）
- `graphql.anilist.co`（出处页查询，只发标题文本，不发图片）

涉密、内部或隐私图片请不要使用云端链路。

## 报告漏洞

请通过仓库的 Private Security Advisory 或邮件联系维护者，不要在公开 issue 里贴密钥或完整利用细节。
