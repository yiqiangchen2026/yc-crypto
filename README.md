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
