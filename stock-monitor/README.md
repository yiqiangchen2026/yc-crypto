# 股票与 USDG 扫描运行方式

## 2026-10-18 MonitorState批量RPC优化

当前扫描在Queue Worker执行，DO只负责短状态读写和16分钟租约，三分钟股票/USDG及五分钟X Layer成交量频率保持不变。2026-10-08下文的DO整轮扫描方式为历史，已于10月14日迁出。

`getMany(keys)`按输入顺序返回原始字符串或null（最多32键）；`putMany`使用一次DO Storage成组写入，`putManyFenced`在原ScanLease.write检查和串行边界内写入，过期owner整组拒绝。旧单键方法、namespace、幂等槽及通知冷却状态兼容保留。

公开GET只在本次请求内预读所需键，不跨请求缓存、不在Queue长扫描中缓存通知设置：健康5→1、股票快照4→1、USDG健康/快照2→1，X Layer快照仍1。通知设置三键3→1；USDG成功后的快照/运行状态2→1原子写入。读取相同存储键数量没有直接减少存储行计费，优化目标是DO Compute Requests。首次初始化缺失的通知设置可能额外写一次。

验证：npm run test:monitor（47项）；wrangler deploy --dry-run --config stock-monitor/wrangler.jsonc。真实本地SQLite DO验证五条公开GET各一次RPC、隐私剔除、批量写入与过期owner拒绝；本地workerd仅支持兼容日期2026-08-06，生产配置仍2026-10-06，生产发布后另核接口与自然扫描。未改通知路由/开关、扫描频率和原数据。

批量能力随同一Worker原子发布，旧请求仍可用旧方法；不需要数据迁移。回退代码时保留原namespace及原数据。整体百分比受页面访问/扫描/告警活动影响，应比较发布前后同等窗口，不能将单请求80%减少当成全账户实测降幅。

## 历史记录


2026-10-08 队列额度优化：生产 STATE_STORAGE=durable-object 时，自然 Cron 直接调用既有 MonitorState 的 scan RPC，每种扫描仍每三分钟运行，USDG 保持一分钟偏移。SerialScan 在完整扫描与网络等待期间串行执行，原有去重、失败记录、告警确认与冷却状态继续使用同一存储。scan 内部使用本实例 get/put/recordScan 方法，避免自调用 RPC。

yc-stock-scan 已移除生产者绑定，保留消费者处理旧消息；旧消息也进入同一串行执行器，原有成功槽去重和六分钟过期检查保持不变。D1 旧环境保留原调度兼容路径。

验证命令：npm run test:monitor；npx wrangler deploy --dry-run --config stock-monitor/wrangler.jsonc。

2026-10-08 通知改为公开 / 私有：股票价差默认私有，Robinhood Chain 和 X Layer 放量默认公开。沿用原三个持久化布尔值（true=公开，false=私有），保留已有选择。公开仅投递到「YC 链上信号」，私有仅通过账户内 Service Binding 投递到「YC 链上中枢」Bot 的固定授权私聊；失败不回退到另一目标。Bot 的 `/notifications` 或 `/menu` →「频道通知设置」可切换，仅授权私聊用户可更改。采集、冷却及重试继续运行；USDG 与交易量定时汇总不受这些设置影响。

待处理：股票参考行情需区分港股竞价/连续交易/收盘、价格源延迟与行情时间差。计算修复前保持股票价差通知关闭。
