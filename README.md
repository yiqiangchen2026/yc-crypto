# YC 撸毛站

精选项目 · 完整攻略 · 免费分享。

线上网站：https://yc-crypto.pages.dev/

这是一个无构建依赖的 HTML/CSS 静态网站。`site/` 是完整发布目录，网页内容和图片均在此目录维护。

## 本地开发

```sh
npm ci
npm run dev
```

打开 http://127.0.0.1:4317/ 。修改页面 HTML 和共享样式 `site/styles.css` 后刷新即可。

```sh
npm run check
```

检查内部链接、文章锚点及图片资产。

## 页面

- `site/index.html`：首页
- `site/projects/`：项目库
- `site/projects/okx-rwa/`：OKX RWA 策略与技巧
- `site/competitions/`：交易赛日历（日程 / 月历、筛选、时区切换）
- `site/competitions/data.json`：官方来源、UTC 赛程及 LP 观察说明
- `site/arsenal/`：武器库
- `site/arsenal/okx-lp-range/`：OKX LP 区间快捷设置图文教程
- `site/assets/`：教程配图
- `site/_headers`：Cloudflare 响应头

## 自动部署

GitHub Actions 工作流 `.github/workflows/deploy.yml` 会在 `main` 的网站内容变更时检查并部署到现有 Cloudflare Pages 项目 `yc-crypto`，保留原来的线上地址。也可以在 Actions 中手动运行。

首次启用需要在仓库 Settings → Secrets and variables → Actions 配置仓库 Secret：

- `CLOUDFLARE_API_TOKEN`：Cloudflare API Token，赋予所属账号的 `Account → Cloudflare Pages → Edit` 权限；账号范围限定为托管该网站的账号。

账号 ID 是公开部署标识，已写在工作流中。Token 必须保存在 Secret 中，不能提交到仓库。未配置 Token 时工作流会明确失败，不会发布。

现有项目采用 Direct Upload，无法原地改成 Cloudflare 原生 Git integration；这里使用 GitHub Actions + Wrangler 直接上传 `site/` 目录，无需打包 ZIP。

官方说明：https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/

## 从本机直接部署

完成 Wrangler 登录后：

```sh
npx wrangler login
npm run deploy
```

浏览器控制台登录与 Wrangler 授权独立。也可以通过环境变量 `CLOUDFLARE_API_TOKEN` 提供部署凭据。

## 内容维护

项目文章保留原帖来源和整理日期。修改教程时核对工具当前源码、版本和实际界面；不要将历史活动参数描述为当前官方规则。

本项目保留原有页面设计与 URL。公开发布内容包含 YC 提供的教程截图；仓库不包含部署凭据或本机授权文件。

## 交易赛日历维护

在 `site/competitions/data.json` 中追加赛程。开始 / 结束时间使用含 Z 的 UTC ISO 时间；多轮比赛分别建赛程，共用官方来源，不重复宣传总奖池。核实日期填写实际复核日期，未确认的链、合约和池子明确标注待核实。页面默认北京时间，可切换日本时间或 UTC，交易期结束自动归档；官方规则变化仍需人工复核。禁用 JavaScript 时的官方链接在日历 HTML 的 noscript 中同步维护。

## 交易量监控 / Telegram

`/volume/` 集成在原站点。页面读取 Cloudflare Worker 的缓存，不直接请求行情或暴露 Bot Token；后台接收新快照后计算提醒去重、写入KV并向频道发送信号。

采集计划由公开仓库的 `.github/workflows/collect-volume.yml` 执行，标准GitHub-hosted Ubuntu runner免费，每5分钟计划一次，避开整点。GitHub调度为best effort，忙时可能延迟或漏跑，公开仓库60天无活动还可能自动停用schedule；因此页面显示采集时间，12分钟未更新则标记过期。若改成私有仓库，需要重新评估Actions分钟额度。本流程不上传artifact、不缓存行情文件，也不因每轮采集重新部署Pages。

`node scripts/collect-volume.mjs` 通过 DEX Screener公共API请求活动全部16个股票代币，精确匹配活动合约与USDG合约，合并去重后的池子。每轮16请求、两个并发，使用原生5m、1h、6h、24h窗口，不估算15m成交额。原Cloudflare定时采集因共享出口限流不再启用；私有collector仅保留用于管理员手动诊断。

- `monitor/config.mjs`：白名单、USDG合约、阈值。
- `monitor/core.mjs`：行情解析、放量检测、提醒去重。
- `monitor/worker.mjs`：快照接收、缓存、TG推送、公开只读接口。
- `monitor/wrangler.jsonc`：现有账号、KV和频道ID；Cron为空。
- `monitor/collector.mjs`：私有备用采集服务，不持有Bot密钥或KV。
- `site/volume/config.json`：公开只读快照URL。
- `npm run test:monitor`：风险边界及接口隔离测试；`npm run deploy:monitor`：发布后台。
- 页面仍走原Pages自动部署；后端改动需要单独发布。

默认上量：5m至少$15,000 / 10笔且达到前55m每5m均值3倍；或1h至少$100,000 / 30笔且达到前5h每小时均值3倍。满足上述任一条件且至少5倍，并且5m至少$50,000或1h至少$200,000，才标为强放量；已知池流动性至少$10,000。基准下限为5m $500、1h $6,000。无需连续两轮确认即可触发。通知附1h成交量/已知流动性，仅供观察、不作过滤；流动性缺失时标注不完整。每对提醒冷却60分钟，连续两轮正常后重新武装；冷却后升级为强放量也可再提醒。通知失败不记录为送达，下轮重试；数据异常保留旧值并停止对该交易对发信号。

定时榜单默认每6小时发送成交量Top 3，按过去1小时排序，并附5m / 1h / 24h成交量和已知流动性。首次完整快照即发送，之后从上次成功发送起计时；GitHub调度延迟会使发送顺延。只有全部16对数据完整且窗口正常才发送；失败下轮重试，不占用上量提醒的冷却时间或历史记录。Worker变量 `SUMMARY_INTERVAL_HOURS` 支持3或6，`SUMMARY_WINDOW` 支持h1或h24；其他间隔值关闭榜单。复用现有采集，每轮依然最多2次KV写入，不增加行情请求。

流动性估值缺失的池子不计入流动性合计，但保留完整成交额并标注；缺少成交额或笔数字段则视为异常。只覆盖数据源索引到的池，不保证所有链上池或活动专属流量；列表满100个时提示可能截断。趋势保存最近72个滚动5m采样点，不应直接累加；最近40条成功通知保存在KV。公开API不返回内部去重状态或凭据。

### 密钥位置

- Cloudflare `yc-volume-monitor` / `TG_BOT_TOKEN`：Bot API Key，加密Secret，仅后台发送TG时读取。前端和GitHub均无Bot Key。
- Cloudflare `INGEST_TOKEN` 与GitHub仓库Secret `VOLUME_INGEST_TOKEN`：相同的独立随机行情写入凭据；只能通过 `/admin/ingest` 上传快照，不能读取Bot Key。接收端校验白名单合约、时效和重复快照。GitHub工作流读取它时自动掩码；任何密钥都不写进Git。
- Cloudflare `ADMIN_TOKEN`：仅用于管理员手动扫描诊断，和行情写入密钥不同，不分发给GitHub。

Bot必须是频道管理员并拥有发布权限。轮换Bot Key只改Cloudflare Secret：

```sh
npx wrangler secret put TG_BOT_TOKEN --config monitor/wrangler.jsonc
```

行情写入密钥轮换时同步Cloudflare `INGEST_TOKEN` 与GitHub `VOLUME_INGEST_TOKEN`。切勿把密钥放到 `site/volume/config.json` 或网页。

免费预算：每天约288次计划采集；行情API约4,608请求/天。Cloudflare每次接收最多2次KV写入（采集租约与最终状态），完整计划约576写入/天，低于1,000次/天（手动触发另计）。页面响应缓存60秒，访客不触发行情扫描。Worker请求与KV读取各100,000/天，需要与同账号其他应用共用额度一起评估；CPU免费上限10ms。超额可能失败，本项目不启用付费计划，也不自动升级。

官方说明：
https://docs.github.com/en/billing/concepts/product-billing/github-actions
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
https://developers.cloudflare.com/workers/platform/limits/
https://developers.cloudflare.com/kv/platform/limits/
https://docs.dexscreener.com/api/reference
