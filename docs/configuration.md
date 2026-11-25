# 配置与 API Key

插件开箱即用，**不配 Key 也能跑**（AnimeTrace + trace.moe 免费打底）。这个页面只讲两件事：怎么拿到 Key、怎么确认它真的生效了喵。

## 1. 拿 Key（只有 Lens 需要）

| Key | 必需吗 | 去哪拿 | 免费额度 |
|---|---|---|---|
| `SERPAPI_KEY` | 否，但没有就没有 Lens | [注册](https://serpapi.com/users/sign_up) → [管理页复制](https://serpapi.com/manage-api-key) | 250 次/月 |
| `ANIMETRACE_TOKEN` | 否 | [animetrace.com](https://www.animetrace.com) | 匿名有限，配 token 可放宽 |

SerpApi 注册只需要邮箱，**不需要信用卡**，也不会自动扣费。额度用完只是当月停用，不会产生账单。

## 2. 填进去（三选一）

| 方式 | 适合 | 生效条件 |
|---|---|---|
| **环境变量**（推荐） | 不想让 Key 进任何文件 | **重启 DSH** |
| profile 覆盖 | 想和其它配置放一起 | 重启 DSH（或等热重载） |
| 设置界面 | 图形化填表 | 保存后生效（能看到这个插件的设置项时） |

### 环境变量

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

### profile 覆盖

在 `~/.dsh/profiles/<你的 profile>/cordis.patch.yml` 里追加：

```yaml
- id: image-search
  name: dsh-image-search
  config:
    serpapiKey: '你的key'
    # 注意：覆盖会替换整个 config，建议把下面「全部配置项」里的键一起抄全
```

## 3. 确认生效

- 让 AI 跑一次 `image_search`，看返回的 `engines` 里有没有 `lens`（或 `notes` 里有没有 `lens 失败：...`）
- 或者故意把 Key 改错一位：能报 `401 Invalid API key` 就说明**读到了**，改回来即可

## 4. 配了却没生效？

| 症状 | 原因 |
|---|---|
| 结果里完全没有 Lens | 没重启 DSH，或 Key 没被读到 |
| `401 Invalid API key` | Key 复制错、带了空格或换行 |
| `429` | 当月 250 次用完了，下月重置 |
| 设置界面看不到这个插件 | 当前 DSH 版本可能还没投影这个 schema，改用环境变量 |

## 全部配置项

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

## 关于 sharp

压缩依赖 [sharp](https://github.com/lovell/sharp)，已声明为 `optionalDependencies`：正常安装会一起装上；如果安装被跳过或失败，插件会退回在 DSH profile 的 pnpm 仓库里查找，再找不到就不压缩，并在 `notes` 里说明原因。
