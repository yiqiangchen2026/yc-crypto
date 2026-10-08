# 股票与 USDG 扫描运行方式

2026-10-08 队列额度优化：生产 STATE_STORAGE=durable-object 时，自然 Cron 直接调用既有 MonitorState 的 scan RPC，每种扫描仍每三分钟运行，USDG 保持一分钟偏移。SerialScan 在完整扫描与网络等待期间串行执行，原有去重、失败记录、告警确认与冷却状态继续使用同一存储。scan 内部使用本实例 get/put/recordScan 方法，避免自调用 RPC。

yc-stock-scan 已移除生产者绑定，保留消费者处理旧消息；旧消息也进入同一串行执行器，原有成功槽去重和六分钟过期检查保持不变。D1 旧环境保留原调度兼容路径。

验证命令：npm run test:monitor；npx wrangler deploy --dry-run --config stock-monitor/wrangler.jsonc。
