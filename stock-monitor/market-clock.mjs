const MINUTE = 60_000;
const DAY = 86_400_000;

const MARKET_SPECS = {
  HK: {
    id: "HK", name: "港股", flag: "🇭🇰", timeZone: "Asia/Hong_Kong",
    withdrawalDeadline: [9, 0], openingFocus: [9, 0], regularOpen: [9, 30], openingFocusEnd: [10, 0],
    closingFocus: [15, 30], close: [16, 10], lunch: [[12, 0], [13, 0]]
  },
  US: {
    id: "US", name: "美股", flag: "🇺🇸", timeZone: "America/New_York",
    withdrawalDeadline: [4, 0], premarket: [4, 0], openingFocus: [8, 0], regularOpen: [9, 30], openingFocusEnd: [10, 30],
    closingFocus: [15, 30], regularClose: [16, 0], close: [16, 30], afterHoursEnd: [20, 0]
  }
};

const DEFAULT_SYMBOL_MARKETS = {
  // Hong Kong listed underlyings currently seen in the X Layer campaign.
  SHEINX: "HK", MEITX: "HK", TCENTX: "HK", HKEXCX: "HK", KUAIX: "HK",
  MIXUX: "HK", XIAOX: "HK", POPMTX: "HK",
  // U.S. listed underlyings currently seen in the campaign and common xStocks.
  ICEX: "US", MCDX: "US", COINX: "US", BMNRX: "US", SLVX: "US", KOX: "US", SPCXX: "US",
  "BRK.BX": "US", CRCLX: "US", MSTRX: "US", SKHYX: "US", MUX: "US", GMEX: "US",
  SNDKX: "US", PLTRX: "US", DELLX: "US", IBMX: "US", IWMX: "US", MRVLX: "US",
  TSMX: "US", ASMLX: "US", AMDX: "US", HOODX: "US",
  AAPLX: "US", ABBVX: "US", ABTX: "US", ACNX: "US", AMZNX: "US", APPX: "US",
  AVGOX: "US", BACX: "US", BRKBX: "US", CMCSAX: "US", CRMX: "US", CRWDX: "US",
  CSCOX: "US", CVXX: "US", DFDVX: "US", DHRX: "US", DISX: "US", GOOGLX: "US",
  HDX: "US", INTCX: "US", JNJX: "US", JPMX: "US", LINX: "US", LLYX: "US",
  MAX: "US", METAX: "US", MRKX: "US", MSFTX: "US", NFLXX: "US", NVDAX: "US",
  ORCLX: "US", PEPX: "US", PFEZX: "US", QQQX: "US", SPYX: "US", SPYYX: "US",
  TMOX: "US", TSLAX: "US", UNHX: "US", VIX: "US", WMTX: "US"
};

const HK_HOLIDAYS = new Set([
  "2026-01-01", "2026-02-17", "2026-02-18", "2026-02-19", "2026-04-03",
  "2026-04-06", "2026-04-07", "2026-05-01", "2026-05-25", "2026-06-19",
  "2026-07-01", "2026-10-01", "2026-10-19", "2026-12-25",
  "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-26", "2027-03-29",
  "2027-04-05", "2027-05-13", "2027-06-09", "2027-07-01", "2027-09-16",
  "2027-10-01", "2027-10-08", "2027-12-27"
]);

// Published exchange calendars; unknown future half-days are deliberately not inferred.
const HK_HALF_DAYS = new Set(["2026-02-16", "2026-12-24", "2026-12-31"]);
const US_HALF_DAYS = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

const formatterCache = new Map();

function formatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
      weekday: "short"
    }));
  }
  return formatterCache.get(timeZone);
}

function zonedParts(date, timeZone) {
  const values = Object.fromEntries(formatter(timeZone).formatToParts(date)
    .filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
    weekday: values.weekday
  };
}

function dateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function localDateTime(timeZone, parts, clock) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, clock[0], clock[1], 0);
  let instant = desired;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = zonedParts(new Date(instant), timeZone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    instant += desired - represented;
  }
  return new Date(instant);
}

function shiftedDateParts(parts, days) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + days * DAY);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function nthWeekday(year, month, weekday, occurrence) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const day = 1 + ((weekday - first.getUTCDay() + 7) % 7) + 7 * (occurrence - 1);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastWeekday(year, month, weekday) {
  const last = new Date(Date.UTC(year, month, 0));
  const day = last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function observedDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function usHolidays(year) {
  const goodFriday = new Date(easterSunday(year).getTime() - 2 * DAY).toISOString().slice(0, 10);
  return new Set([
    observedDate(year, 1, 1), nthWeekday(year, 1, 1, 3), nthWeekday(year, 2, 1, 3),
    goodFriday, lastWeekday(year, 5, 1), observedDate(year, 6, 19),
    observedDate(year, 7, 4), nthWeekday(year, 9, 1, 1), nthWeekday(year, 11, 4, 4),
    observedDate(year, 12, 25)
  ]);
}

function isTradingDay(market, parts) {
  const utcWeekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  if (utcWeekday === 0 || utcWeekday === 6) return false;
  const key = dateKey(parts);
  return market.id === "HK" ? !HK_HOLIDAYS.has(key) : !usHolidays(parts.year).has(key);
}

function nextOpeningFocus(market, now, startOffset = 0) {
  const local = zonedParts(now, market.timeZone);
  for (let offset = startOffset; offset < 15; offset += 1) {
    const candidate = shiftedDateParts(local, offset);
    if (!isTradingDay(market, candidate)) continue;
    const open = localDateTime(market.timeZone, candidate, market.openingFocus);
    if (open.getTime() > now.getTime()) return open;
  }
  return null;
}

function nextRegularOpen(market, now) {
  const local = zonedParts(now, market.timeZone);
  for (let offset = 0; offset < 15; offset += 1) {
    const candidate = shiftedDateParts(local, offset);
    if (!isTradingDay(market, candidate)) continue;
    const open = localDateTime(market.timeZone, candidate, market.regularOpen);
    if (open > now) return open;
  }
  return null;
}

function regularOpening(marketId, at = new Date()) {
  const market = MARKET_SPECS[marketId];
  if (!market) return null;
  const now = new Date(at);
  const local = zonedParts(now, market.timeZone);
  const todayOpen = localDateTime(market.timeZone, local, market.regularOpen);
  const todayClose = localDateTime(market.timeZone, local, market.regularClose || market.close);
  const open = isTradingDay(market, local) && now >= todayOpen && now < todayClose;
  return { market, open, nextOpen: nextRegularOpen(market, now) };
}

function nextWithdrawalDeadline(market, now, startOffset = 0) {
  const local = zonedParts(now, market.timeZone);
  for (let offset = startOffset; offset < 15; offset += 1) {
    const candidate = shiftedDateParts(local, offset);
    if (!isTradingDay(market, candidate)) continue;
    const deadline = localDateTime(market.timeZone, candidate, market.withdrawalDeadline);
    if (deadline.getTime() > now.getTime()) return deadline;
  }
  return null;
}

function marketState(marketId, at = new Date()) {
  const market = MARKET_SPECS[marketId];
  if (!market) return null;
  const now = new Date(at);
  const local = zonedParts(now, market.timeZone);
  const halfDay = (marketId === "HK" ? HK_HALF_DAYS : US_HALF_DAYS).has(dateKey(local));
  const openingFocus = localDateTime(market.timeZone, local, market.openingFocus);
  const withdrawalDeadline = localDateTime(market.timeZone, local, market.withdrawalDeadline);
  const regularOpen = localDateTime(market.timeZone, local, market.regularOpen);
  const openingFocusEnd = localDateTime(market.timeZone, local, market.openingFocusEnd);
  const closingFocus = localDateTime(market.timeZone, local, halfDay ? (marketId === "HK" ? [11, 30] : [12, 30]) : market.closingFocus);
  const close = localDateTime(market.timeZone, local, halfDay ? (marketId === "HK" ? [12, 10] : [13, 30]) : market.close);
  const tradingDay = isTradingDay(market, local);
  let status = "closed";
  let phase = "closed";
  let nextFocus = nextOpeningFocus(market, now);
  let nextWithdrawal = nextWithdrawalDeadline(market, now);
  if (tradingDay && now >= openingFocus && now < close) {
    status = "open";
    phase = now < regularOpen ? "opening-focus" : now < openingFocusEnd ? "opening-focus" : now < closingFocus ? "regular" : "closing-focus";
    if (market.lunch && !halfDay) {
      const lunchStart = localDateTime(market.timeZone, local, market.lunch[0]);
      const lunchEnd = localDateTime(market.timeZone, local, market.lunch[1]);
      if (now >= lunchStart && now < lunchEnd) { status = "lunch"; phase = "lunch"; }
    }
    if (market.regularClose) {
      const regularClose = localDateTime(market.timeZone, local, halfDay ? [13, 0] : market.regularClose);
      if (now >= regularClose) { status = "after"; phase = "closing-focus"; }
    }
    nextFocus = nextOpeningFocus(market, now, 1);
    nextWithdrawal = nextWithdrawalDeadline(market, now, 1);
  } else if (tradingDay && market.premarket) {
    const premarket = localDateTime(market.timeZone, local, market.premarket);
    const afterHoursEnd = localDateTime(market.timeZone, local, market.afterHoursEnd);
    if (now >= premarket && now < openingFocus) { status = "pre"; phase = "premarket"; }
    else if (now >= close && now < afterHoursEnd) { status = "after"; phase = "after-hours"; }
  }
  return {
    market, status, phase, nextFocus, nextWithdrawal, tradingDay, halfDay,
    withdrawalDeadline: tradingDay ? withdrawalDeadline : null,
    focusStart: tradingDay ? openingFocus : null,
    focusEnd: tradingDay ? openingFocusEnd : null,
    close: tradingDay && now < close ? close : null,
    closingFocus: tradingDay && now < closingFocus ? closingFocus : null
  };
}

function marketMap(env = {}) {
  const result = { ...DEFAULT_SYMBOL_MARKETS };
  if (!env.MARKET_SYMBOL_MAP) return result;
  try {
    const custom = JSON.parse(env.MARKET_SYMBOL_MAP);
    for (const [symbol, market] of Object.entries(custom || {})) {
      if (MARKET_SPECS[String(market).toUpperCase()]) result[String(symbol).toUpperCase()] = String(market).toUpperCase();
    }
  } catch { /* An invalid optional override must not break reports. */ }
  return result;
}

function marketForSymbol(symbol, env = {}) {
  return marketMap(env)[String(symbol || "").replace(/^w/i, "").toUpperCase()] || null;
}

function heldMarketSummary(current, env = {}) {
  const markets = new Map();
  for (const pool of current?.pools || []) {
    const mainPositions = (pool.positions || []).filter(position => position.role === "main");
    for (const position of mainPositions) {
      const stock = (position.tokens || []).find(token => token.stock && marketForSymbol(token.symbol, env));
      if (!stock) continue;
      const marketId = marketForSymbol(stock.symbol, env);
      if (!markets.has(marketId)) markets.set(marketId, { marketId, totalValue: 0, pools: [] });
      const summary = markets.get(marketId);
      summary.totalValue += Number(position.value || 0);
      summary.pools.push({
        name: pool.name, id: position.id, value: Number(position.value || 0),
        stockShare: Number(position.stockShare || 0), status: position.status
      });
    }
  }
  return [...markets.values()].sort((a, b) => b.totalValue - a.totalValue);
}

function duration(ms) {
  const minutes = Math.max(0, Math.round(ms / MINUTE));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} 小时 ${remainder} 分钟` : `${hours} 小时`;
}

function stateLabel(state, now = new Date()) {
  if (state.phase === "opening-focus") return "🔥 开盘重点窗口";
  if (state.phase === "closing-focus") return "🔥 收盘重点窗口";
  if (state.phase === "premarket") return `盘前交易，距重点窗口 ${duration(state.nextFocus - now)}`;
  if (state.phase === "after-hours") return "盘后交易（非主要时段）";
  if (state.status === "open") return `常规交易${state.closingFocus ? `，距收盘重点窗口 ${duration(state.closingFocus - now)}` : ""}`;
  if (state.status === "lunch") return "午间休市（不单独提醒复市）";
  return state.nextFocus ? `非主要时段，距开盘重点窗口 ${duration(state.nextFocus - now)}` : "非主要时段";
}

function marketClockMessage(holdings, at = new Date()) {
  const now = new Date(at);
  const lines = ["🕒 持仓相关市场时钟"];
  if (!holdings?.length) return `${lines[0]}\n\n暂无可识别市场的 LP 主仓；未知代币不会被猜测映射。`;
  for (const holding of holdings) {
    const state = marketState(holding.marketId, now);
    if (!state) continue;
    lines.push("", `${state.market.flag} ${state.market.name}：${stateLabel(state, now)}`,
      `关联主仓：${holding.pools.length} 个｜合计 ${holding.totalValue.toLocaleString("en-US", { style: "currency", currency: "USD" })}`);
  }
  const next = holdings.map(holding => ({ holding, state: marketState(holding.marketId, now) }))
    .filter(item => item.state?.nextFocus).sort((a, b) => a.state.nextFocus - b.state.nextFocus)[0];
  if (next) lines.push("", "⚠️ 下一次开盘重点窗口", `${next.state.market.flag} ${next.state.market.name}将在 ${duration(next.state.nextFocus - now)}后进入重点窗口`);
  return lines.join("\n");
}

export {
  MARKET_SPECS, duration, heldMarketSummary, marketClockMessage, marketForSymbol,
  marketState, regularOpening, stateLabel, zonedParts
};
