(() => {
  const xlayer=location.pathname.includes('xlayer-volume');
  const quoteLabel=xlayer?'全部配对':'USDG';
  const $=id=>document.getElementById(id);
  const fmt=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n):'—';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={normal:'平稳',rising:'开始放量',strong:'强放量',error:'数据异常',inconsistent:'窗口异常','no-pool':'未发现池'};
  const time=s=>new Date(s).toLocaleString('zh-CN',{hour12:false});
  let snapshot,filter='all',endpoint,busy=false;
  function spark(history=[]) {
    if(history.length<2) return '<p class="spark-note">趋势线采集中…</p>';
    const max=Math.max(1,...history.map(h=>h.v));
    const points=history.map((h,i)=>`${(i/(history.length-1)*300).toFixed(1)},${(44-h.v/max*40).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 300 46" preserveAspectRatio="none" role="img" aria-label="最近采样的滚动5分钟成交额"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg><p class="spark-note">滚动 5m 成交额 · 每 5m 采样 · 最多 6h</p>`;
  }
  function render() {
    if(!snapshot) return;
    const rows=snapshot.rows,now=Date.now();
    const stale=now-Date.parse(snapshot.scannedAt)>12*60000;
    const valid=rows.filter(r=>r.volume&&!['error','inconsistent'].includes(r.status)&&now-Date.parse(r.updatedAt)<=12*60000);
    const rising=r=>['rising','strong'].includes(r.status);
    $('pair-count').textContent=rows.length;
    $('rising-count').textContent=valid.filter(rising).length;
    $('total-5m').textContent=valid.length?fmt(valid.reduce((n,r)=>n+r.volume.m5,0)):'—';
    $('total-24h').textContent=valid.length?fmt(valid.reduce((n,r)=>n+r.volume.h24,0)):'—';
    $('health').textContent=stale?'● 数据已过期':valid.length===rows.length?'● 监控运行中':`● 部分数据异常 (${valid.length}/${rows.length})`;
    $('updated').textContent=`采集：${time(snapshot.scannedAt)} · 本地时间`;
    $('notice').textContent=stale?'数据已超过 12 分钟未更新，暂勿依据放量状态操作。':valid.length<rows.length?'部分交易对数据异常，旧值已标注且不计入概览；其余交易对继续监控。':(xlayer?'每 5 分钟计划采集成交量、每 15 分钟刷新池信息；全站共用缓存。':'每 5 分钟计划采集，GitHub 调度可能延迟；全站共用缓存，刷新页面不会触发行情扫描。');
    $('tg-status').textContent=snapshot.notification==='ok'?'TG 提醒已送达':snapshot.notification==='error'?'TG 发送失败，下一轮重试':snapshot.notification==='disabled'?'TG 放量通知已关闭':snapshot.notification==='settings-unavailable'?'TG 通知设置读取失败':'TG 等待首次提醒';
    const key=$('sort').value;
    const rank={strong:3,rising:2,normal:1};
    const selected=rows.filter(r=>(filter!=='rising'||rising(r)&&!stale)&&r.symbol.toLowerCase().includes($('search').value.trim().toLowerCase())).sort((a,b)=>key==='signal'?(rank[b.status]||0)-(rank[a.status]||0)||(b.volume?.m5||0)-(a.volume?.m5||0):(b.volume?.[key]||0)-(a.volume?.[key]||0));
    $('pairs').innerHTML=selected.map(r=>{
      const isStale=stale||now-Date.parse(r.updatedAt)>12*60000;
      const status=isStale?'error':r.status;
      const hourly=r.reason==='1h'&&['rising','strong'].includes(status);
      const pools=(r.pools||[]).slice().sort((a,b)=>xlayer?(b.liquidity||0)-(a.liquidity||0):b.volume.m5-a.volume.m5);
      return `<article class="pair-card is-${esc(status)}"><div class="pair-heading"><h2>${esc(r.symbol)}<small> / ${quoteLabel}</small></h2><span class="signal">${isStale?'数据过期':(hourly?'小时':'')+(labels[status]||'未知')}</span></div><div class="pair-main"><div><span>${hourly?'1 小时':'5 分钟'}成交额${r.stale||isStale?'（旧值）':''}</span><strong>${fmt(hourly?r.volume?.h1:r.volume?.m5)}</strong></div><div class="pair-multiple">${r.volume?Number(r.multiple).toFixed(1)+'×':'—'}<small>${r.reason==='1h'?`1h / 前${xlayer?'3':'5'}h均值`:r.reason==='5m'?'5m / 前55m均值':'最大放量倍数'}</small></div></div>${spark(r.history)}<div class="pair-metrics"><div><span>${hourly?'5 分钟':'1 小时'}</span>${fmt(hourly?r.volume?.m5:r.volume?.h1)}</div><div><span>24 小时</span>${fmt(r.volume?.h24)}</div><div><span>已知池流动性</span>${fmt(r.liquidity)}</div><div><span>5m 交易笔数</span>${r.trades5m??'—'}</div></div>${xlayer?'<p class="meta">OKX 代币汇总 · 来源时间 '+time(r.sourceAt)+'</p>':''}${xlayer?`<details class="pool-list" open><summary>${pools.length} 个已收录池 · 查看配对与地址</summary>${pools.map(p=>`<div class="pool-item"><a href="https://web3.okx.com/explorer/x-layer/address/${encodeURIComponent(p.id)}" target="_blank" rel="noopener noreferrer">${esc(p.pair)} · ${esc(p.dex)} ↗</a><span>池流动性 ${fmt(p.liquidity)} · LP 费率 ${esc(p.fee||'未知')}</span><span>${esc(p.id)}</span></div>`).join('')||'<p>来源未返回池子，不能据此认定没有池。</p>'}<p class="meta">${r.poolsSource==='okx'?'OKX 流动性前 5 池 · 更新 '+time(r.poolsUpdatedAt):'官方页面核验的池地址 · 核验日期 2026-10-08；实时池流动性暂不可用'}${r.poolsStatus==='unavailable'?' · 池接口暂不可用，保留已核验信息':''}。成交量为代币汇总，未拆分到各池。</p></details>`:`<details class="pool-list"><summary>${pools.length} 个 USDG 池 · 展开查看</summary>${pools.map(p=>`<div class="pool-item"><a href="https://dexscreener.com/robinhood/${encodeURIComponent(p.id)}" target="_blank" rel="noopener noreferrer">${esc(p.dex)} ↗</a><span>5m ${fmt(p.volume.m5)} · 24h ${fmt(p.volume.h24)} · 流动性 ${fmt(p.liquidity)}</span><span>${esc(p.id)}</span></div>`).join('')}</details>`}<p class="pair-footnote">${r.updatedAt?'更新 '+time(r.updatedAt):'等待有效数据'}${r.unknownLiquidity?' · '+r.unknownLiquidity+' 个池缺少流动性估值':''}${r.coverageLimited?' · 源列表达到100个池，可能漏收录':''}</p></article>`;
    }).join('')||'<div class="empty-pairs">目前没有匹配的交易对。</div>';
    $('events').innerHTML=(snapshot.events||[]).slice(0,12).map(e=>`<div class="alert-event"><span><strong>${esc(e.symbol)} / ${quoteLabel}</strong> · ${labels[e.level]} · ${Number(e.multiple).toFixed(1)}× · 5m ${fmt(e.volume5m)}</span><time>${time(e.at)}</time></div>`).join('')||'<p class="meta">尚无已成功发送的提醒。监控会在达到条件时通知频道。</p>';
  }
  async function refresh() {
    if(busy) return;busy=true;$('refresh').disabled=true;
    try {
      if(!endpoint){const c=await fetch(xlayer?'/monitor/xlayer-volume/config.json':'/volume/config.json').then(r=>r.json());endpoint=c.endpoint;if(!endpoint)throw Error('not-configured');}
      const response=await fetch(endpoint,{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('unavailable');
      const data=await response.json();if(!Array.isArray(data.rows)||!data.scannedAt)throw Error('invalid');
      snapshot=data;render();
    }catch {
      if(snapshot)render();
      $('health').textContent='● 暂时无法连接';
      $('notice').textContent=snapshot?'刷新失败；保留上次数据，请检查采集时间。':'监控后端尚未就绪或数据暂不可用。这里不会以示例交易量替代真实数据，请稍后刷新。';
    }finally{busy=false;$('refresh').disabled=false;}
  }
  document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',x===b));render();}));
  $('sort').addEventListener('change',render);$('search').addEventListener('input',render);$('refresh').addEventListener('click',refresh);
  refresh();setInterval(()=>{if(!document.hidden)refresh();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
