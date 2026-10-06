import { marketState, zonedParts } from './market-clock.js';

const zones = { US: 'America/New_York', HK: 'Asia/Hong_Kong' };
const names = { US: '美国市场', HK: '香港市场', CRYPTO: '加密货币' };
const phases = {
  'opening-focus': '🔥 开盘重点窗口', 'closing-focus': '🔥 收盘重点窗口',
  premarket: '盘前交易', 'after-hours': '盘后交易', regular: '常规交易',
  lunch: '午间休市', closed: '非主要时段'
};
const el = id => document.getElementById(id);
const clock = date => date.toLocaleTimeString('zh-CN', {hour12: false});
const remaining = (target, now) => {
  if (!target) return '—';
  const seconds = Math.max(0, Math.ceil((target - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${days ? `${days} 天 ` : ''}${hours} 小时 ${minutes} 分`;
};
const zoneClock = (now, zone) => {
  const p = zonedParts(now, zone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')}`;
};
const sessionDisplay = (id, state, now) => {
  if (!state) return {phase: '24/7', next: '全天交易'};
  const p = zonedParts(now, zones[id]);
  const minute = p.hour * 60 + p.minute;
  const day = state.tradingDay ? (state.halfDay ? '半日市' : '交易日') : '休市日';
  if (state.tradingDay && id === 'US' && minute >= 4 * 60 && minute < 9 * 60 + 30) {
    const focus = minute >= 8 * 60 ? ' · 重点关注' : '';
    return {phase: `盘前交易中${focus}`, next: `${day} · 盘前进行中 · 距正式开盘 ${remaining(new Date(now.getTime() + (9 * 60 + 30 - minute) * 60_000 - p.second * 1000), now)}`};
  }
  if (state.tradingDay && id === 'HK' && minute >= 9 * 60 && minute < 9 * 60 + 30) {
    return {phase: '开市前竞价中', next: `${day} · 盘前进行中 · 距正式开盘 ${remaining(new Date(now.getTime() + (9 * 60 + 30 - minute) * 60_000 - p.second * 1000), now)}`};
  }
  const next = state.nextWithdrawal;
  const nextLabel = id === 'US' ? '美股盘前开始（04:00）' : '港股开市前竞价（09:00）';
  return {phase: phases[state.phase], next: `${day} · 距下次${nextLabel} ${remaining(next, now)}`};
};
const timeline = (id, state, now) => {
  const local = id === 'CRYPTO' ? {hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds()} : zonedParts(now, zones[id]);
  const minute = local.hour * 60 + local.minute + local.second / 60;
  const segments = id === 'US' ? [
    [0, 240, 'quiet', '非主要时段'], [240, 570, 'pre', '盘前 04:00–09:30'],
    [570, state?.halfDay ? 780 : 960, 'regular', `常规交易 09:30–${state?.halfDay ? '13:00' : '16:00'}`],
    [state?.halfDay ? 780 : 960, 1200, 'after', '盘后'], [1200, 1440, 'quiet', '非主要时段']
  ] : id === 'HK' ? [
    [0, 540, 'quiet', '非主要时段'], [540, 570, 'pre', '竞价 09:00–09:30'],
    [570, 720, 'regular', '上午 09:30–12:00'],
    ...(state?.halfDay ? [] : [[720, 780, 'quiet', '午休 12:00–13:00'], [780, 960, 'regular', '下午 13:00–16:00']]),
    [state?.halfDay ? 720 : 960, state?.halfDay ? 730 : 970, 'after', '收市竞价'],
    [state?.halfDay ? 730 : 970, 1440, 'quiet', '非主要时段']
  ] : [[0, 1440, 'regular', '24 小时交易']];
  const ticks = id === 'US' ? [[0, '00'], [240, '04'], [570, '09:30'], [state?.halfDay ? 780 : 960, state?.halfDay ? '13' : '16'], [1200, '20'], [1440, '24']]
    : id === 'HK' ? [[0, '00'], [540, '09'], [720, '12'], ...(state?.halfDay ? [] : [[780, '13']]), [state?.halfDay ? 730 : 970, state?.halfDay ? '12:10' : '16:10'], [1440, '24']]
    : [[0, '00'], [720, '12'], [1440, '24']];
  const muted = state && !state.tradingDay ? ' timeline-closed' : '';
  return `<div class="timeline${muted}" role="img" aria-label="${names[id]} 24 小时时间轴；当前位置 ${id === 'CRYPTO' ? clock(now) : zoneClock(now, zones[id])}${state && !state.tradingDay ? '，休市日' : ''}">
    <div class="timeline-track">${segments.map(([from, to, type, label]) => `<span class="timeline-segment ${type}" style="left:${from / 14.4}%;width:${(to - from) / 14.4}%" title="${label}"></span>`).join('')}<span class="timeline-marker" style="left:${minute / 14.4}%"></span></div>
    <div class="timeline-ticks">${ticks.map(([at, label]) => `<span style="left:${at / 14.4}%">${label}</span>`).join('')}</div>
    <div class="timeline-caption">${state && !state.tradingDay ? '今日休市 · 色段仅示意常规交易日' : id === 'US' ? '盘前 · 常规 · 盘后' : id === 'HK' ? '竞价 · 上午 · 午休 · 下午' : '全天候交易'}</div>
  </div>`;
};

function render() {
  const now = new Date();
  const states = { US: marketState('US', now), HK: marketState('HK', now) };
  el('clock-local').textContent = `${clock(now)} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  ['US', 'HK', 'CRYPTO'].forEach(id => {
    const state = states[id];
    const display = sessionDisplay(id, state, now);
    const phase = display.phase;
    const detail = display.next;
    el(`market-${id}`).innerHTML = `<section class="clock-group" aria-labelledby="heading-${id}"><div class="clock-group-head"><h2 id="heading-${id}">${names[id]}</h2><span class="muted">${id === 'CRYPTO' ? '全天候' : zones[id]}</span></div><div class="clock-status"><strong class="metric">${id === 'CRYPTO' ? clock(now) : zoneClock(now, zones[id])}</strong><span class="clock-phase">${phase}</span></div><p class="muted clock-next">${detail}</p>${timeline(id, state, now)}</section>`;
  });
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
render();
setInterval(() => { if (!document.hidden) render(); }, 1000);
