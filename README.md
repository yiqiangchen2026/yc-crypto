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

`/volume/` 已集成到原站点，页面读取独立 Worker 缓存，不直接请求行情或暴露 Bot Token。后端为 `monitor/worker.mjs`，Cloudflare Cron 每5分钟扫描；每轮16次 DEX Screener 公共API请求，通过私有服务绑定分成4批，每批4个代币、两个并发，批次顺序执行、每批两组间隔2秒（每批独立CPU预算）。覆盖活动全部16个股票代币 / USDG，按活动合约匹配，合并去重后的池子。使用数据源原生5m、1h、6h和24h窗口，不估算15m成交额。

- `monitor/config.mjs`：白名单、USDG合约、阈值。
- `monitor/collector.mjs`：私有采集Worker，无公开URL、不持有TG密钥或KV。
- `monitor/core.mjs`：行情解析、放量检测、提醒去重。
- `monitor/wrangler.jsonc`：现有账号、KV绑定、定时任务与频道ID。
- `site/volume/config.json`：公开只读快照URL。
- `npm run test:monitor`：风险边界测试；`npm run deploy:monitor`：发布后端。
- 页面使用原 Pages 部署流程；Worker变更需要单独发布后端。

默认上量：5m至少$5,000 / 5笔且达到前55m每5m均值3倍；或1h至少$50,000 / 20笔且达到前5h每小时均值3倍。5倍标为强放量；已知池流动性合计至少$10,000。5m基准下限$500、1h基准下限$6,000。每对提醒冷却60分钟，连续两轮正常后重新武装；冷却后升级为强放量也可再提醒。通知失败不记录为送达，下轮重试；数据异常保留旧值并停止对该交易对发信号。页面标记超过12分钟未更新的数据。

流动性估值缺失的池子不计入流动性合计，但保留其完整成交额并标注；缺少成交额或笔数字段则视为异常。仅覆盖数据源索引到的池子，不保证覆盖所有链上池或活动专属流量；返回列表满100个时提示可能截断。趋势保存72个滚动5m采样点，最多6小时，不应当作互不重叠的窗口累加。最近40条成功通知保存在KV；公开API不返回内部去重状态或凭据。数据源缓存可能使检测滞后，公共API没有保证的可用性。

Telegram Bot必须成为指定频道管理员并拥有发布权限。Token用Cloudflare Secret保存，绝不写进前端、Git或工作流：

```sh
npx wrangler secret put TG_BOT_TOKEN --config monitor/wrangler.jsonc
```

管理员手动采集接口为 `POST /admin/scan`，需独立Cloudflare `ADMIN_TOKEN` Secret作为Bearer授权，不放入前端。KV中的5分钟租约避免通常情况下手动与定时扫描重叠；KV为最终一致存储，不提供严格分布式锁，避免同时从不同区域手动触发。初次切换数据源时清空历史趋势及旧通知，以免不同统计口径混用。

免费预算：后台288轮/天，加4批私有采集共约1,440次Worker调用/天，KV写入通常576次/天、最坏每轮发信号时864次/天，低于1,000次/天（额外手动扫描另计）；上游4,608请求/天、16请求/轮。页面访问使用60秒公共缓存，但仍需与同账号其他Worker/KV共用的免费额度一起评估。KV读取与Worker请求免费上限各100,000/天，CPU免费上限10ms；访问量或工作负载超过额度可能失败，并非无限免费。本实现不启用付费计划，也不自动升级。

官方额度与数据源：
https://developers.cloudflare.com/workers/platform/limits/
https://developers.cloudflare.com/kv/platform/limits/
https://docs.dexscreener.com/api/reference
