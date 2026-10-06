export const STATE_KEY = "usdg-usdc-quote-alert-v2";
const CHAIN_INDEX = "196";
const USDC = "0xb6ceceab302e2e4948951ee7843fc24e92933061";
const USDG = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8";

function setting(value, fallback) {
  const parsed = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(parsed) ? parsed : fallback;
}

function amount(env) {
  const value = setting(env.USDG_QUOTE_USDC, 5000);
  if (!Number.isInteger(value) || value < 1 || value > 100000) throw new Error("USDG_QUOTE_USDC must be an integer from 1 to 100000");
  return value;
}

export async function fetchUsdgQuote(env, okx, now = Date.now()) {
  const input = amount(env);
  const data = await okx("/api/v6/dex/aggregator/quote", { params: {
    chainIndex: CHAIN_INDEX,
    amount: String(input * 1_000_000),
    fromTokenAddress: USDC,
    toTokenAddress: USDG,
    swapMode: "exactIn"
  } });
  const quote = Array.isArray(data) ? data[0] : data;
  const from = quote?.fromToken || {};
  const to = quote?.toToken || {};
  const outputUnits = Number(quote?.toTokenAmount);
  if (String(from.tokenContractAddress || "").toLowerCase() !== USDC ||
      String(to.tokenContractAddress || "").toLowerCase() !== USDG ||
      Number(from.decimal) !== 6 || Number(to.decimal) !== 6 ||
      !Number.isSafeInteger(outputUnits) || outputUnits <= 0) {
    throw new Error("USDG quote returned an unexpected token or amount");
  }
  const output = outputUnits / 1_000_000;
  return { checkedAt: now, input, output, grossEdge: output - input, grossEdgeRate: (output - input) / input };
}

export async function fetchPendleQuote(env, fetcher = fetch) {
  const input = amount(env);
  const params = new URLSearchParams({ receiver: "0x1111111111111111111111111111111111111111",
    slippage: "0.0001", tokensIn: USDC, tokensOut: USDG,
    amountsIn: String(input * 1_000_000), enableAggregator: "true" });
  const response = await fetcher(`https://api-v2.pendle.finance/core/v2/sdk/196/convert?${params}`, {
    headers: { "User-Agent": "Onchain-Desk/1.0", Accept: "application/json" },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("Pendle quote unavailable");
  return parsePendleQuote(await response.json(), input, Date.now());
}

export function parsePendleQuote(data, input, checkedAt) {
  if (data?.action !== "pendle-swap" || data.inputs?.length !== 1 ||
      data.inputs[0].token?.toLowerCase() !== USDC || Number(data.inputs[0].amount) !== input * 1_000_000)
    throw new Error("Pendle input mismatch");
  const valid = [];
  for (const route of data.routes || []) {
    const params = route.contractParamInfo?.contractCallParams;
    if (route.outputs?.length !== 1 || route.outputs[0].token?.toLowerCase() !== USDG ||
        route.tx?.to?.toLowerCase() !== "0x888888888889758f76e7103c6cbf23abbf58f946" ||
        route.contractParamInfo?.method !== "swapTokensToTokens" || params?.length !== 3 ||
        params[1]?.length !== 1 || params[2]?.length !== 1 || Number(params[2][0]) !== input * 1_000_000) continue;
    const swap = params[1][0], units = Number(route.outputs[0].amount), minimum = Number(swap.minOut);
    if (swap.tokenIn?.toLowerCase() !== USDC || swap.tokenOut?.toLowerCase() !== USDG ||
        !Number.isSafeInteger(units) || !Number.isSafeInteger(minimum) || minimum <= 0 || minimum > units) continue;
    const output = units / 1_000_000;
    valid.push({ checkedAt, input, output, minOutput: minimum / 1_000_000,
      grossEdge: output - input, grossEdgeRate: (output - input) / input, source: "PendleSwap", slippagePercent: 0.01 });
  }
  if (!valid.length) throw new Error("Pendle has no valid swap route");
  return valid.sort((a, b) => b.output - a.output)[0];
}

export function usdgQuoteMessage(quote, threshold) {
  const title = quote.grossEdgeRate >= threshold && quote.minOutput > quote.input ? "🔎 YC 链上信号｜USDG-USDC 候选价差" : "💵 YC 链上信号｜USDG-USDC 实时报价";
  const edge = `${quote.grossEdge >= 0 ? "+" : ""}${quote.grossEdge.toFixed(6)}`;
  return `${title}\n\nPendleSwap 复核预览：${quote.input.toLocaleString("en-US")} USDC → ${quote.output.toFixed(6)} USDG\n按 1:1 毛差：${edge} USDC（${(quote.grossEdgeRate * 100).toFixed(4)}%）\n0.01% 滑点最低到账：${quote.minOutput.toFixed(6)} USDG\n报价时间：${new Date(quote.checkedAt).toISOString()}\n\n兑换入口：https://app.pendle.finance/pendleswap\n操作：1. 连接钱包，选 X Layer；2. USDC → USDG，输入 ${quote.input.toLocaleString("en-US")}；3. 设置 0.01% 滑点并刷新报价，确认最低到账能覆盖本金、Gas 和充提成本；4. 按本次金额授权，再确认兑换；5. USDG 充入自己的 OKX X Layer 充值地址，按已确认的 1:1 路径换回 USDC。\n\nX Layer 代币合约（用于核对）：\nUSDC：${USDC}\nUSDG：${USDG}\n\n这是预览，不是锁价或净利润；仍有池子费用及其他成本。不要按美元估值涨幅判断利润；请核对实时最低到账。充值地址从自己的账户获取，勿转入上述代币合约。\n\nhttps://yc-crypto.pages.dev/monitor/usdg/`;
}

export async function runUsdgMonitor(env, okx, notify, now = Date.now(), pendleQuote = () => fetchPendleQuote(env)) {
  const threshold = setting(env.USDG_ALERT_EDGE, 0.0001);
  if (!(threshold > 0 && threshold < 0.01)) throw new Error("USDG_ALERT_EDGE must be between 0 and 0.01");
  const quote = await fetchUsdgQuote(env, okx, now);
  const previous = await env.STATE.get(STATE_KEY, "json") || {};
  const candidate = quote.grossEdgeRate >= threshold;
  if (!candidate) {
    if (previous.active || previous.confirmingAt !== undefined)
      await env.STATE.put(STATE_KEY, JSON.stringify({ ...previous, active: false, confirmingAt: undefined }));
    return quote;
  }
  if (previous.active || (previous.alertedAt !== undefined && now - previous.alertedAt < 600000)) return quote;
  // Require a candidate on another scheduled scan, then independently verify Pendle.
  if (previous.confirmingAt === undefined || now - previous.confirmingAt > 600000) {
    await env.STATE.put(STATE_KEY, JSON.stringify({ ...previous, confirmingAt: now }));
    return quote;
  }
  if (now - previous.confirmingAt < 8000) return quote;
  const verified = await pendleQuote();
  if (Date.now() - verified.checkedAt > 15000 || verified.grossEdgeRate < threshold || verified.minOutput <= verified.input) {
    await env.STATE.put(STATE_KEY, JSON.stringify({ ...previous, confirmingAt: undefined }));
    return verified;
  }
  await notify(usdgQuoteMessage(verified, threshold));
  await env.STATE.put(STATE_KEY, JSON.stringify({ active: true, alertedAt: now }));
  return verified;
}
