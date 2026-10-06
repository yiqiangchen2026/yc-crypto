import { marketForSymbol, marketState } from "./market-clock.mjs";

const CHAIN_INDEX = "196";
const STATE_KEY = "xstock-discount-monitor-v1";
const MULTIPLIER_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PRICE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LIVE_REFERENCE_AGE_MS = 15 * 60 * 1000;
// 1 batched Yahoo reference request + 1 batch market request + 4 quotes + up to 4 alerts.
const MAX_QUOTE_CANDIDATES = 4;
const TOP_GAPS_LIMIT = 5;
const XSTOCKS_API = "https://api.backed.fi/api/v2/public/assets";
const YAHOO_SPARK_API = "https://query1.finance.yahoo.com/v7/finance/spark";
const HKD_USD_SYMBOL = "HKD=X";

const STABLECOINS = {
  USDG: { address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", decimals: 6 },
  USDC: { address: "0xb6ceceab302e2e4948951ee7843fc24e92933061", decimals: 6 }
};

const rows = [
  ["HKEXCx", "USDG", "0xdfc060b4de44fb88998b695aa59169643ded10ea", "0388.HK"],
  ["KUAIx", "USDG", "0x096369b9b197bcbf669a3bc827aa119d80d891e4", "1024.HK"],
  ["MEITx", "USDG", "0xad1b65c8556957cf23d1b5e9accdc449b415fa97", "3690.HK"],
  ["MIXUx", "USDG", "0x8fa39ff32b316e2296630aa05bdd6a4a2e4b7598", "2097.HK"],
  ["POPMTx", "USDC", "0x4ebf5fd25b02022afad96e2fa25da54a246fded0", "9992.HK"],
  ["SHEINx", "USDG", "0xff637d2d435d6745df3faf61272b1216e7e8b727", "0625.HK"],
  ["TCENTx", "USDG", "0x41333df9e7639188bbfca5522dc4844398af9f9e", "0700.HK"],
  ["XIAOx", "USDC", "0x076cf393e701839fc7a5832d2c68aafa235682ae", "1810.HK"],
  ["AAPLx", "USDG", "0x943bf64d566c32a2bcd41ac92fb63c111cc9de8f", "AAPL"],
  ["AMDx", "USDG", "0xee7ccb0d37a12862e7f92f6c92a93d9c2d304266", "AMD"],
  ["AMZNx", "USDG", "0x910cabde3eba7fc1ce64fd14bd680b9f60fa0f90", "AMZN"],
  ["ASMLx", "USDC", "0x9147b03c16b18fc4f686f610f189f91ddf4347b4", "ASML"],
  ["AVGOx", "USDC", "0xe89572bfe500ac7e8ecd8dc8119d274214e06f14", "AVGO"],
  ["BRK.Bx", "USDG", "0xc3a8d2e18d33e0800f84cb4ca6529d18fad225df", "BRK-B"],
  ["DELLx", "USDC", "0x04db4384013664baa627c1a3fa4ff0c50f37cfd3", "DELL"],
  ["GMEx", "USDC", "0x459d3ae62b86cc6125e06260dddfd3afed24a877", "GME"],
  ["GOOGLx", "USDC", "0xf8c5308f80e459bb53d9ebe689854d9cbb2caa6f", "GOOGL"],
  ["HOODx", "USDC", "0x59801175a9b2248f9bf4ba7f82e17045c4672ec8", "HOOD"],
  ["IBMx", "USDG", "0xbf69d85055642a9c6450bdfde3c49baac50f8286", "IBM"],
  ["ICEx", "USDG", "0xbdff6dd4cec5eeaff1e21d65863431e79755ea13", "ICE"],
  ["INTCx", "USDC", "0x33aa35b0271fffe2048cc093ab7fe60931786719", "INTC"],
  ["IWMx", "USDC", "0x25d218f19b706c8680aa26fb64e676cf84b58f65", "IWM"],
  ["KOx", "USDG", "0xe4784b45415aac58b289f9373314261c788c91e8", "KO"],
  ["MCDx", "USDG", "0xc6639026a3a862cd4fcbae3f67cb2d25a2959d37", "MCD"],
  ["METAx", "USDG", "0xe840946ffebcd66b7c4e95095effafadfa0d0e56", "META"],
  ["MRVLx", "USDC", "0xb4ee60b6b817ca7386422ef1a0f45eaddea13275", "MRVL"],
  ["MSFTx", "USDG", "0x166fbe68274b6a47e025f4ba17388c539f1fa1d0", "MSFT"],
  ["MUx", "USDG", "0xe2047ee3bddb5c99ae428ab83df63f8730698e30", "MU"],
  ["NVDAx", "USDG", "0xa8ddb5cd96b5222afe198316e9a57caa642850d5", "NVDA"],
  ["ORCLx", "USDC", "0x1349456830ddc3d8599e4d6a63698883eca67ada", "ORCL"],
  ["PLTRx", "USDC", "0x4a2df09536f62341c9f946427d16414c04e21342", "PLTR"],
  ["QQQx", "USDC", "0x4c1ae29c159838fc1b224636e28e086eb69101f7", "QQQ"],
  ["SKHYx", "USDG", "0x6215a58ed045d71f2561aaabe54f4c885c522998", "SKHY"],
  ["SLVx", "USDC", "0xb842eacb35fd9c1beda53749072ef22823f2ca8c", "SLV"],
  ["SNDKx", "USDG", "0x75e82e2884ea10f72fca777449b73377f4646219", "SNDK"],
  ["SPCXx", "USDG", "0x8e2eed8b8b5e13ea7bf38e50d7821d2c57309072", "SPCX"],
  ["SPYx", "USDG", "0xe7e553cd128f0011777323a0b44a7b96ea1cb540", "SPY"],
  ["TSLAx", "USDC", "0xc3fdbe3a68ee5de461d30415a8165cf9aefe1171", "TSLA"],
  ["TSMx", "USDC", "0x27d62249488fc66ecbb92c8da3f56f700b8e8501", "TSM"]
];

const XSTOCKS = rows.map(([symbol, stable, address, yahoo]) => ({
  symbol, stable, address, yahoo, decimals: 18, pair: `${symbol}-${stable}`
}));

const finite = value => Number.isFinite(Number(value));
const number = value => finite(value) ? Number(value) : 0;
const configuredNumber = (value, fallback) => finite(value) ? Number(value) : fallback;
const percent = value => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
const dollars = value => `$${number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const yahooRaw = value => value && typeof value === "object" ? value.raw : value;
const YAHOO_PRICE_FIELDS = [
  ["overnight", "overnightMarketPrice", "overnightMarketTime"],
  ["pre", "preMarketPrice", "preMarketTime"],
  ["regular", "regularMarketPrice", "regularMarketTime"],
  ["post", "postMarketPrice", "postMarketTime"]
];

function selectYahooPrice(meta = {}) {
  return YAHOO_PRICE_FIELDS.map(([session, priceField, timeField]) => ({
    session, price: number(yahooRaw(meta[priceField])), time: number(yahooRaw(meta[timeField])) * 1000
  })).filter(item => item.price > 0 && item.time > 0)
    .sort((a, b) => b.time - a.time)[0] || null;
}

function yahooReferenceIsFresh(reference, symbol, now) {
  const time = number(reference?.referenceTime);
  if (!(time > 0) || time > now + 5 * 60 * 1000 || now - time > MAX_PRICE_AGE_MS) return false;
  const state = marketState(marketForSymbol(symbol), new Date(now));
  return state?.status !== "open" || now - time <= MAX_LIVE_REFERENCE_AGE_MS;
}

function multiplierIsFresh(item, now) {
  if (!(number(item?.value) > 0) || now - number(item?.updatedAt) >= MULTIPLIER_TTL_MS) return false;
  const transitionDue = number(item?.newValue) > 0 && number(item?.activationDateTime) > 0 &&
    number(item.activationDateTime) <= now;
  return !transitionDue;
}

async function readSmallJson(response, maxBytes = 100_000) {
  if (!response.body) throw new Error(`HTTP ${response.status}: empty response`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel("response too large");
      throw new Error(`response exceeds ${maxBytes} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
  return JSON.parse(text);
}

async function publicJson(url, timeoutMs = 5_000) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "xlayer-xstock-monitor/1.0" },
    signal: AbortSignal.timeout(timeoutMs)
  });
  return readSmallJson(response);
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try { results[index] = await mapper(items[index], index); }
      catch (error) { results[index] = { error: String(error?.message || error) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function refreshMultipliers(state, now) {
  const current = state?.multipliers || {};
  const fresh = XSTOCKS.every(asset => multiplierIsFresh(current[asset.symbol], now));
  if (fresh) return { multipliers: current, refreshed: false, complete: true };
  const results = await mapConcurrent(XSTOCKS, 4, async asset => {
    const data = await publicJson(`${XSTOCKS_API}/${encodeURIComponent(asset.symbol)}/multiplier?network=XLayer`);
    const activation = number(data.activationDateTime);
    return {
      value: number(data.currentMultiplier), newValue: number(data.newMultiplier),
      updatedAt: now, activationDateTime: activation
    };
  });
  const multipliers = { ...current };
  results.forEach((result, index) => {
    if (!result?.error && result.value > 0) multipliers[XSTOCKS[index].symbol] = result;
  });
  return {
    multipliers, refreshed: true,
    complete: XSTOCKS.every(asset => number(multipliers[asset.symbol]?.value) > 0)
  };
}

async function referencePrices(multipliers) {
  const symbols = [...XSTOCKS.map(asset => asset.yahoo), HKD_USD_SYMBOL];
  const batches = [];
  for (let index = 0; index < symbols.length; index += 20) batches.push(symbols.slice(index, index + 20));
  const responses = await Promise.all(batches.map(async batch => {
    const url = new URL(YAHOO_SPARK_API);
    url.searchParams.set("symbols", batch.join(","));
    url.searchParams.set("range", "1d");
    // regularMarketPrice in metadata remains current; daily candles keep the payload bounded.
    url.searchParams.set("interval", "1d");
    return publicJson(url.toString());
  }));
  const results = responses.flatMap(data => data?.spark?.result || []);
  const rowsBySymbol = Object.fromEntries(results.flatMap(item => {
    const meta = item?.response?.[0]?.meta;
    return item?.symbol && meta ? [[item.symbol, meta]] : [];
  }));
  const hkdQuote = selectYahooPrice(rowsBySymbol[HKD_USD_SYMBOL]);
  const hkdPerUsd = number(hkdQuote?.price);
  if (!(hkdPerUsd > 0)) throw new Error("Yahoo HKD=X quote unavailable");
  return Object.fromEntries(XSTOCKS.flatMap(asset => {
    const meta = rowsBySymbol[asset.yahoo];
    const selected = selectYahooPrice(meta);
    const localPrice = number(selected?.price);
    const multiplier = number(multipliers[asset.symbol]?.value);
    if (!(localPrice > 0) || !(multiplier > 0)) return [];
    const currency = String(yahooRaw(meta?.currency) || "");
    const usdPrice = currency === "HKD" ? localPrice / hkdPerUsd : localPrice;
    if (!(usdPrice > 0) || !["HKD", "USD"].includes(currency)) return [];
    return [[asset.address, {
      referencePrice: usdPrice * multiplier,
      quote: localPrice, multiplier, currency, yahoo: asset.yahoo,
      referenceTime: selected.time, referenceSession: selected.session,
      hkdPerUsd: currency === "HKD" ? hkdPerUsd : undefined,
      source: "Yahoo"
    }]];
  }));
}

function marketGaps(prices, references, now) {
  return XSTOCKS.flatMap(asset => {
    const market = prices[asset.address];
    const reference = references[asset.address];
    if (!market || !reference || !(market.price > 0) || now - market.time > MAX_PRICE_AGE_MS ||
      !yahooReferenceIsFresh(reference, asset.symbol, now)) return [];
    const discount = 1 - market.price / reference.referencePrice;
    return [{ ...asset, ...reference, roughPrice: market.price, roughDiscount: discount, marketTime: market.time }];
  }).sort((a, b) => b.roughDiscount - a.roughDiscount);
}

function roughCandidates(prices, references, threshold, now) {
  return marketGaps(prices, references, now)
    .filter(item => item.roughDiscount >= threshold)
    .slice(0, MAX_QUOTE_CANDIDATES);
}

function parseMarketPrices(data) {
  const list = Array.isArray(data) ? data : data?.data || [];
  return Object.fromEntries(list.flatMap(item => {
    const address = String(item.tokenContractAddress || "").toLowerCase();
    const price = number(item.price);
    return address && price > 0 ? [[address, { price, time: number(item.time) }]] : [];
  }));
}

function quoteResult(candidate, data, amountUsd) {
  const quote = Array.isArray(data) ? data[0] : data;
  const outputUnits = number(quote?.toTokenAmount);
  const output = outputUnits / (10 ** candidate.decimals);
  if (!(output > 0)) throw new Error(`${candidate.pair}: quote returned no output`);
  const effectivePrice = amountUsd / output;
  return {
    ...candidate, amountUsd, output, effectivePrice,
    executableDiscount: 1 - effectivePrice / candidate.referencePrice,
    priceImpactPercent: number(quote?.priceImpactPercent),
    tradeFee: number(quote?.tradeFee),
    estimateGasFee: number(quote?.estimateGasFee)
  };
}

function alertMessage(item, streak, now = Date.now()) {
  const referenceAt = new Date(number(item.referenceTime)).toLocaleString("zh-CN", {
    timeZone: item.currency === "HKD" ? "Asia/Hong_Kong" : "America/New_York", hour12: false
  });
  const referenceLine = item.currency === "HKD"
    ? `Yahoo 基准（${item.yahoo} ${item.referenceSession || "regular"}）：HK$${number(item.quote).toFixed(2)} ÷ ${number(item.hkdPerUsd).toFixed(4)} × ${number(item.multiplier).toFixed(6)} = ${dollars(item.referencePrice)}`
    : `Yahoo 基准（${item.yahoo} ${item.referenceSession || "regular"}）：${dollars(item.quote)} × ${number(item.multiplier).toFixed(6)} = ${dollars(item.referencePrice)}`;
  return [
    `📉 YC 链上信号｜股票价差`,
    "",
    `${item.pair} · 可成交折价 ${percent(item.executableDiscount)}`,
    `投入：${dollars(item.amountUsd)} ${item.stable}`,
    `预计收到：${item.output.toFixed(6)} ${item.symbol}`,
    `有效买入价：${dollars(item.effectivePrice)}`,
    referenceLine,
    `Yahoo 行情时间：${referenceAt}`,
    `可成交折价：${percent(item.executableDiscount)}`,
    `粗略折价：${percent(item.roughDiscount)}`,
    `价格影响：${item.priceImpactPercent.toFixed(3)}%`,
    `连续确认：${streak} 次`,
    "",
    `采集时间 ${new Date(now).toISOString()}（UTC）`,
    "X Layer · 仅为报价信号；请核实实际路由、滑点和执行成本。",
    "https://yc-crypto.pages.dev/monitor/stocks/"
  ].join("\n");
}

function invalidationMessage(pair, now = Date.now()) {
  return `⚪ YC 链上信号｜股票价差失效\n\n${pair} · 折价已低于重置门槛\n\n采集时间 ${new Date(now).toISOString()}（UTC）\n\nX Layer · 请重新核对报价。\nhttps://yc-crypto.pages.dev/monitor/stocks/`;
}

function summaryMessage(updates, now = Date.now()) {
  return ["📋 YC 链上信号｜股票价差汇总", "", ...updates.map(item =>
    `${item.pair}｜可成交折价 ${percent(item.executableDiscount)}｜有效买入价 ${dollars(item.effectivePrice)}`
  ), "", `采集时间 ${new Date(now).toISOString()}（UTC）`, "", "X Layer · 报价变化汇总，请核实实际路由。", "https://yc-crypto.pages.dev/monitor/stocks/"].join("\n");
}

function xstockGapsMessage(state, env = {}) {
  const updatedAt = number(state?.updatedAt);
  if (!updatedAt || !Array.isArray(state?.topGaps)) {
    return "📉 xStocks 价差\n\n尚无完整扫描记录，请等待下一轮每三分钟扫描。";
  }
  const time = new Intl.DateTimeFormat("zh-CN", {
    timeZone: env.TIMEZONE || "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "medium"
  }).format(new Date(updatedAt));
  const lines = [
    "📉 xStocks 最近价差", "",
    `扫描：${time}`,
    `数据：参考价 ${number(state.referenceCount)}/39｜链上价 ${number(state.marketPriceCount)}/39`,
    `参考：Yahoo 市场价 × xStock multiplier（港股按 Yahoo HKD=X 换算美元）`,
    `口径：按粗略折价排序；候选以 ${dollars(state.amountUsd || 500)} 实际买入报价复核。`, ""
  ];
  state.topGaps.slice(0, TOP_GAPS_LIMIT).forEach((item, index) => {
    const executable = finite(item.executableDiscount)
      ? `｜可成交 ${percent(number(item.executableDiscount))}`
      : "｜未进入报价复核";
    lines.push(`${index + 1}. ${item.pair}｜Yahoo ${item.yahoo}｜粗略 ${percent(number(item.roughDiscount))}${executable}`);
    lines.push(`   链上 ${dollars(item.roughPrice)}｜参考 ${dollars(item.referencePrice)}`);
    if (finite(item.quote) && finite(item.multiplier)) {
      lines.push(`   原股 ${dollars(item.quote)}｜系数 ${number(item.multiplier).toFixed(6)}｜时段 ${item.referenceSession || "regular"}`);
    }
  });
  lines.push("", "正数表示 X Layer 较参考价便宜；负数表示更贵。可成交价差已包含当前路由和价格影响。 ");
  return lines.join("\n").trimEnd();
}

function nextSignalState(previous, confirmed, now, options, observed = confirmed) {
  const byPair = { ...(previous?.signals || {}) };
  const confirmedByPair = new Map(confirmed.map(item => [item.pair, item]));
  const observedByPair = new Map(observed.map(item => [item.pair, item]));
  const alerts = [];
  const invalidations = [];
  const pendingUpdates = { ...(previous?.pendingUpdates || {}) };
  const cooldownMs = options.alertCooldownMs;
  const confirmationMs = options.confirmationMs ?? 0;
  const resetThreshold = options.resetThreshold ?? options.alertThreshold ?? 0;
  const widening = options.wideningThreshold ?? 0.005;
  for (const asset of XSTOCKS) {
    const old = byPair[asset.pair] || {};
    const item = confirmedByPair.get(asset.pair);
    if (!item) {
      const observation = observedByPair.get(asset.pair);
      if (!observation) continue;
      const reset = number(observation.executableDiscount) < resetThreshold;
      if (reset && old.active) invalidations.push(asset.pair);
      byPair[asset.pair] = { ...old, streak: 0,
        active: reset ? false : old.active,
        armed: reset ? true : old.armed,
        lastBelowAt: reset ? now : old.lastBelowAt };
      delete byPair[asset.pair].confirmedSince;
      if (reset) delete pendingUpdates[asset.pair];
      continue;
    }
    const signal = { ...old, streak: number(old.streak) + 1, lastSeenAt: now,
      lastDiscount: item.executableDiscount };
    if (!number(old.streak)) signal.confirmedSince = now;
    const active = old.active ?? (number(old.lastAlertAt) > number(old.lastBelowAt));
    const armed = old.armed ?? !active;
    if (active && !Number.isFinite(old.lastAlertDiscount)) signal.lastAlertDiscount = number(old.lastDiscount);
    const confirmedFor = now - number(signal.confirmedSince || now);
    if (signal.streak >= options.confirmations && confirmedFor >= confirmationMs) {
      const lastPushedDiscount = signal.lastAlertDiscount;
      const hasAlerted = Number.isFinite(lastPushedDiscount);
      const widened = hasAlerted && item.executableDiscount - lastPushedDiscount >= widening - 1e-10;
      signal.active = true;
      const cooldownReady = !number(old.lastAlertAt) || now - number(old.lastAlertAt) >= cooldownMs;
      if ((armed || widened) && cooldownReady) {
        alerts.push({ ...item, streak: signal.streak });
        signal.lastAlertAt = now;
        signal.lastAlertDiscount = item.executableDiscount;
        signal.lastReportedDiscount = item.executableDiscount;
        signal.lastReportedPrice = item.effectivePrice;
        signal.armed = false;
        delete pendingUpdates[asset.pair];
      } else if (now - number(old.lastAlertAt) >= cooldownMs) {
        const discountChanged = Math.abs(item.executableDiscount - number(old.lastReportedDiscount ?? lastPushedDiscount)) >= 0.001;
        const priceChanged = item.effectivePrice > 0 && old.lastReportedPrice > 0 &&
          Math.abs(item.effectivePrice / old.lastReportedPrice - 1) >= 0.005;
        if (discountChanged || priceChanged) pendingUpdates[asset.pair] = item;
        else delete pendingUpdates[asset.pair];
      }
    }
    byPair[asset.pair] = signal;
  }
  const hour = Math.floor(now / 3_600_000);
  const summary = hour > number(previous?.lastSummaryHour ?? hour) ? Object.values(pendingUpdates) : [];
  if (summary.length) {
    for (const item of summary) {
      byPair[item.pair].lastReportedDiscount = item.executableDiscount;
      byPair[item.pair].lastReportedPrice = item.effectivePrice;
    }
  }
  return { signals: byPair, alerts, invalidations, summary,
    pendingUpdates: summary.length ? {} : pendingUpdates, lastSummaryHour: hour };
}

async function runXStockMonitor(env, okx, notify, now = Date.now()) {
  const previous = await env.STATE.get(STATE_KEY, "json") || {};
  const multiplierResult = await refreshMultipliers(previous, now);
  if (multiplierResult.refreshed) {
    await env.STATE.put(STATE_KEY, JSON.stringify({ ...previous, multipliers: multiplierResult.multipliers }));
    console.log(JSON.stringify({ event: "xstock_multipliers_refreshed", complete: multiplierResult.complete }));
    return { initialized: true, complete: multiplierResult.complete };
  }

  const amountUsd = configuredNumber(env.XSTOCK_QUOTE_USD, 500);
  const roughThreshold = configuredNumber(env.XSTOCK_ROUGH_DISCOUNT, 0.01);
  const alertThreshold = configuredNumber(env.XSTOCK_ALERT_DISCOUNT, 0.02);
  const resetThreshold = configuredNumber(env.XSTOCK_ALERT_RESET_DISCOUNT, 0.018);
  const confirmations = Math.max(1, Math.round(configuredNumber(env.XSTOCK_CONFIRMATIONS, 2)));
  const confirmationMs = configuredNumber(env.XSTOCK_CONFIRMATION_SECONDS, 180) * 1000;
  const alertCooldownMs = configuredNumber(env.XSTOCK_ALERT_COOLDOWN_MINUTES, 90) * 60_000;
  const [references, priceData] = await Promise.all([
    referencePrices(multiplierResult.multipliers),
    okx("/api/v6/dex/market/price", {
      payload: XSTOCKS.map(asset => ({ chainIndex: CHAIN_INDEX, tokenContractAddress: asset.address }))
    })
  ]);
  const prices = parseMarketPrices(priceData);
  const gaps = marketGaps(prices, references, now);
  const candidates = roughCandidates(prices, references, roughThreshold, now);
  const quoted = [];
  const confirmed = [];
  for (const candidate of candidates) {
    try {
      const stable = STABLECOINS[candidate.stable];
      const data = await okx("/api/v6/dex/aggregator/quote", {
        params: {
          chainIndex: CHAIN_INDEX,
          amount: String(Math.round(amountUsd * (10 ** stable.decimals))),
          fromTokenAddress: stable.address,
          toTokenAddress: candidate.address,
          swapMode: "exactIn"
        }
      });
      const result = quoteResult(candidate, data, amountUsd);
      quoted.push(result);
      if (result.executableDiscount >= alertThreshold) confirmed.push(result);
    } catch (error) {
      console.warn(JSON.stringify({ event: "xstock_quote_failed", pair: candidate.pair, error: String(error?.message || error) }));
    }
  }
  const signalBase = previous?.referenceSource === "yahoo" ? previous : {};
  const signalState = nextSignalState(signalBase, confirmed, now, {
    confirmations, confirmationMs, alertCooldownMs, alertThreshold, resetThreshold
  }, quoted);
  const quotedByPair = Object.fromEntries(quoted.map(item => [item.pair, item]));
  const priceRows = gaps.map(item => {
    const quote = quotedByPair[item.pair];
    return {
      pair: item.pair, symbol: item.symbol, stable: item.stable, yahoo: item.yahoo,
      roughPrice: item.roughPrice, referencePrice: item.referencePrice,
      roughDiscount: item.roughDiscount, marketTime: item.marketTime, referenceTime: item.referenceTime,
      quote: item.quote, multiplier: item.multiplier, currency: item.currency,
      referenceSession: item.referenceSession, hkdPerUsd: item.hkdPerUsd,
      ...(quote ? {
        amountUsd: quote.amountUsd, effectivePrice: quote.effectivePrice,
        executableDiscount: quote.executableDiscount, priceImpactPercent: quote.priceImpactPercent
      } : {})
    };
  });
  for (const item of signalState.alerts) await notify(alertMessage(item, item.streak, now));
  for (const pair of signalState.invalidations) await notify(invalidationMessage(pair, now));
  if (signalState.summary.length) await notify(summaryMessage(signalState.summary, now), { silent: true });
  await env.STATE.put(STATE_KEY, JSON.stringify({
    version: 3, referenceSource: "yahoo", multipliers: multiplierResult.multipliers, signals: signalState.signals,
    pendingUpdates: signalState.pendingUpdates, lastSummaryHour: signalState.lastSummaryHour,
    updatedAt: now, referenceCount: Object.keys(references).length, marketPriceCount: Object.keys(prices).length,
    candidateCount: candidates.length, amountUsd, topGaps: priceRows.slice(0, TOP_GAPS_LIMIT), priceRows
  }));
  console.log(JSON.stringify({
    event: "xstock_scan_completed", references: Object.keys(references).length,
    marketPrices: Object.keys(prices).length, candidates: candidates.length,
    confirmed: confirmed.length, alerts: signalState.alerts.length
  }));
  return { references: Object.keys(references).length, candidates, confirmed, alerts: signalState.alerts };
}

export {
  XSTOCKS, alertMessage, marketGaps, multiplierIsFresh, nextSignalState, parseMarketPrices, quoteResult,
  referencePrices, roughCandidates, runXStockMonitor, selectYahooPrice, xstockGapsMessage, yahooReferenceIsFresh
};
