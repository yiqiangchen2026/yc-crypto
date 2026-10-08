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

- `CLOUDFLARE_API_TOKEN`：Cloudflare Pages 发布凭据；账号范围限定为托管该网站的账号。后台工作流优先使用 `CLOUDFLARE_WORKERS_API_TOKEN`，未配置时复用此 Token。后台凭据使用同一账号的 Workers Scripts Edit、D1 Edit、Queues Edit、Workers KV Storage Read 和 Account Settings Read；不需要 OKX 或 TG 密钥。

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

`/monitor/` 是监控入口，下设 `/monitor/stocks/` 股票价差和 `/monitor/volume/` 交易量监控，原 `/volume/` 页面保留兼容。两个页面复用全站主题及 `site/monitor/monitor.css`。页面读取 Cloudflare Worker 的缓存，不直接请求行情或暴露 Bot Token；后台接收新快照后计算提醒去重、写入KV并向频道发送信号。

采集计划由公开仓库的 `.github/workflows/collect-volume.yml` 执行，标准GitHub-hosted Ubuntu runner免费，每5分钟计划一次，避开整点。GitHub调度为best effort，忙时可能延迟或漏跑，公开仓库60天无活动还可能自动停用schedule；因此页面显示采集时间，12分钟未更新则标记过期。若改成私有仓库，需要重新评估Actions分钟额度。本流程不上传artifact、不缓存行情文件，也不因每轮采集重新部署Pages。

`node scripts/collect-volume.mjs` 通过 DEX Screener公共API请求RH 白名单全部16个股票代币，精确匹配股票合约与USDG合约，合并去重后的池子。每轮16请求、两个并发，使用原生5m、1h、6h、24h窗口，不估算15m成交额。原Cloudflare定时采集因共享出口限流不再启用；私有collector仅保留用于管理员手动诊断。

- `monitor/config.mjs`：白名单、USDG合约、阈值。
- `monitor/core.mjs`：行情解析、放量检测、提醒去重。
- `monitor/worker.mjs`：快照接收、缓存、TG推送、公开只读接口。
- `monitor/wrangler.jsonc`：现有账号、KV和频道ID；Cron为空。
- `monitor/collector.mjs`：私有备用采集服务，不持有Bot密钥或KV。
- `site/volume/config.json`：公开只读快照URL。
- `npm run test:monitor`：风险边界及接口隔离测试；`npm run deploy:monitor`：发布后台。
- 页面仍走原Pages自动部署；两个监控后台的改动由 `.github/workflows/deploy-monitors.yml` 自动测试和发布。

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

## 市场时钟

`/market-clock/` 从 Onchain Desk 独立拆出本地时间与美国、香港、加密货币三张时钟卡片，保留实时钟、时段提示、24 小时时间轴和下次盘前倒计时，不包含交易对分组清单。浏览器每秒更新，无后端服务或行情请求。

- `site/market-clock/market-clock.js`：独立时段引擎，不依赖原项目的持仓、监控或 Telegram。
- `site/market-clock/clock.js` / `clock.css`：时钟卡片，复用全站深浅色主题。

沿用原时段、夏令时、节假日和半日市逻辑。港股节假日覆盖 2026–2027 年，港股半日市覆盖 2026 年；跨年需维护日历，临时停市不自动识别。原项目的页面暂保留。

## 股票价差监控

页面 `/monitor/stocks/` 每分钟读取独立 `yc-stock-monitor` Worker 的 `/snapshot` 市场快照，不包含调频、手动扫描或启停按钮。后台仍每 3 分钟扫描 39 个 X Layer 股票交易对，$500 复核；2% 折价、两次且至少 180 秒确认、90 分钟冷却与 1.8% 重置门槛保持不变。9 分钟未更新时标记过期。该后台在本仓库 `stock-monitor/` 维护，GitHub 自动发布；Onchain Desk 停止股票调度并通过服务绑定读取新后台，其旧公开地址保留兼容代理。

股票价差与交易量放量通知共用「YC 链上信号」频道，统一标题、指标区、UTC 采集时间、链与口径说明以及独立页面链接。股票公开接口只返回允许的市场字段，私有钱包和内部状态仍受原鉴权保护。

## 两个监控后台自动部署

推送 `main` 的 `monitor/**`、`stock-monitor/**`、包配置或部署工作流修改，会触发 `Deploy monitor Workers`。流程先测试两个监控，再发布交易量 Worker 的内部股票通知入口、发布股票 Worker，最后验证两个公开快照。网站继续由 `Deploy to Cloudflare Pages` 发布；无需每轮行情重发网站。

- `yc-volume-monitor`：现有 KV 与采集流程保持不变；`StockNotifier` 是仅服务绑定可调用的通知入口，固定向现有「YC 链上信号」频道发送，无公开通知 HTTP 接口。TG Secret 仍只在此 Worker。
- `yc-stock-monitor`：SQLite 型 Durable Object `MonitorState` 保存股票/USDG 状态，专用单并发 `yc-stock-scan` Queue，每分钟 Cron 唤醒、每 3 分钟投递任务，过期任务和成功执行过的时间槽跳过。无公开手动扫描或配置接口。
- `stock-monitor/core.mjs`：移植的 39 对股票折价引擎；`market-clock.mjs` 保留行情时效和市场日历判断。
- `stock-monitor/storage.mjs`：行情、乘数与确认/冷却状态，使用 Durable Object 避免 D1 账户额度故障及 KV 每日写入限制；`/health` 提供不含凭据的受控执行状态。
- OKX 三项行情凭据使用 Worker 加密 Secrets。2026-10-07 公共监控切换至 `yc-public-monitor`，私人监控使用 `yc-private-monitor`。公共 Worker 已移除个人 `xlayer-wallet-history` 的 `HISTORY_DB` 绑定与共享限速表访问；股票/USDG 仍由专用单并发队列串行执行，请求间隔保持至少 1.25 秒。
- 迁移数据只复制 `xstock-discount-monitor-v1`，包含乘数、连续确认、冷却及待汇总状态；不提交状态备份或密钥到 GitHub。先暂停旧调度并等待旧任务排空，再复制最终状态并启用新调度。回滚时先暂停新后台，再将其最新状态迁回旧后台；不可直接启用旧冻结状态，否则可能重复提醒。

新后台首次资源配置使用 Wrangler 引导；后续代码发布走 GitHub。Secrets 在 Cloudflare 保留，自动部署不会把它们上传到 GitHub。`SCAN_ENABLED` 是生产调度开关；迁移准备版本设为 false，完成切换后设为 true。

### 2026-10-06 切换记录

旧 Onchain Desk 股票调度和旧频道推送已停用，独立股票状态从最终冻结快照迁移，保留 39 个乘数及 24 个交易对的确认/冷却记录。新配置开启 `SCAN_ENABLED=true`，网站改为读取独立 `/snapshot`；旧 `/api/public/xstocks` 继续代理新快照。初次新资源引导使用本机 Wrangler；后续自动部署在本仓库执行。

后台部署专用 Token 已配置在本仓库 `CLOUDFLARE_WORKERS_API_TOKEN` 加密 Secret，网站继续使用原 `CLOUDFLARE_API_TOKEN`。2026-10-06 后台自动部署已完成成功验证：https://github.com/yiqiangchen2026/yc-crypto/actions/runs/37446299315 。

2026-10-06 重新核对时，新 Worker 已自然写入 `lastCronAt` 并完成扫描，说明此前的短期观测未能证明持续故障。Onchain Desk 的临时容错生产者绑定和调度代码已移除，股票定时投递不再依赖旧 Worker。每分钟唤醒、每 3 分钟投递的生产频率保持不变。新 Cron 从何时开始生效及先前延迟的具体平台原因未由现有记录确认，不能把推测写成根因。

### 2026-10-07 D1 配额故障恢复

账户 D1 每日读取额度耗尽导致股票/USDG 状态查询失败。暂停两个旧扫描后，冻结并迁移 6 个状态键及股票执行记录至免费 SQLite 型 Durable Object `MonitorState`，固定对象名 `public-monitors-v1`。保留 39 个乘数和 25 个交易对的信号状态，以及 USDG 的确认/冷却状态。一次性引导版本通过内部构造器初始化，验证成功后发布不含迁移数据的正式版本并重新开启调度。没有公开迁移/写入接口。

生产 `STATE_STORAGE=durable-object`，不绑定 D1；旧 D1 保留作为冻结备份，旧快照不得直接回滚启用。`durable-storage.mjs` 保存状态与执行记录；`durable-object.mjs` 为内部 RPC 包装，只有短暂存储调用，不持有定时器或外部请求。新对象未完成迁移时拒绝读写，避免在空状态下重复提醒。后续部署须保留对象名、类名和 `monitor-state-v1` SQLite migration；不能重建命名空间。31 项监控测试通过，包括完全禁止 D1 访问的股票/USDG 测试。Durable Objects 仍受免费额度约束，并非无限额度。

## USDG-USDC 候选价差（2026-10-07 迁移）

`/monitor/usdg/` 为第三个监控模块，页面每分钟读取 `yc-stock-monitor` 的 `/usdg/snapshot`，9 分钟未更新标记过期。USDG 模块在 `usdg-monitor/` 独立维护，复用撸毛站股票后台的 OKX 加密凭据、Durable Object、单并发 Queue 和频道通知服务，不再由 Onchain Desk 自动扫描或推送。股票在 UTC 分钟 `minute % 3 === 0` 扫描；USDG 在 `minute % 3 === 1` 扫描。两者各每 3 分钟，排队可能延迟；USDG 使用独立状态和健康记录，不覆盖股票状态。

保留原逻辑：5,000 USDC → USDG、0.01% 毛差门槛、两轮候选确认、PendleSwap 0.01% 滑点预览复核且最低到账超过本金、10 分钟冷却和回落重新武装。毛差按 1:1 计算，不代表净利润。候选初筛与 Pendle 复核报价在页面明确区分；未复核不显示最低到账。

`USDG_SCAN_ENABLED` 控制自动扫描和频道推送。`/usdg/health` 公开受控执行状态；`/usdg/snapshot` 仅输出报价白名单字段。没有公开手动扫描、配置或通知接口。频道推送通过现有服务绑定 `StockNotifier.sendUsdg`，固定目的频道，Bot 密钥仍仅在交易量后台。

切换：先部署新模块且保持关闭；旧 Onchain Desk 新增 `USDG_SCAN_ENABLED=false`，同时拦截旧排队扫描；等待旧 USDG 状态稳定，再复制 `usdg-usdc-quote-alert-v2` 和最后成功报价至新 D1，之后启用新调度。本次最终旧状态 `active=false`，没有待确认或冷却时间戳；按原值迁移，未人为添加或重置。旧监控中心改为读取新后台 `/usdg/health` 和 `/usdg/snapshot` 并链接新页面。Onchain Desk 的手动 `/usdg` 查询保留；本机 2 秒高速监控已于 2026-10-07 按要求移除并重新部署本地服务。回滚前先停新调度，等任务排空，将新状态迁回旧库后才开启旧调度，避免重复提醒。

`npm run test:monitor` 包含 USDG 规则、迁移、调度、去重、异常保留旧报价及通知边界测试。USDG 修改已纳入 GitHub 后台自动测试、部署工作流，前端继续使用原 Cloudflare Pages 自动部署。

2026-10-08：修正 RH 采集写入旧 workers.dev 域名导致的 DNS 失败，移除 RH 监控中的 Trust Wallet 活动描述。新增 `/monitor/xlayer-volume/`，精确匹配 OKX Q3 Earnings 页面四个合约，使用现有 OKX API 凭据，每五分钟批量查询一次 price-info，在既有 Durable Object 串行扫描器内运行。独立保存历史、冷却和成功提醒；共用交易量通知开关。OKX 数据为代币汇总，未筛选比赛配对及路由；4h 窗口用于前3h小时放量基准，其他门槛沿用 RH。接口 `/xlayer-volume/snapshot` 不暴露内部冷却状态。
