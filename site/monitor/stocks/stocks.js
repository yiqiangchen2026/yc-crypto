(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>Number.isFinite(n)?'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4}):'—';
  const pct=n=>Number.isFinite(n)?`${n>=0?'+':''}${(n*100).toFixed(2)}%`:'未复核';
  const time=n=>n?new Date(n).toLocaleString('zh-CN',{hour12:false}):'—';
  let endpoint,snapshot,busy=false;
  function render(){
    if(!snapshot)return;
    const stale=Date.now()-snapshot.updatedAt>9*60000,rows=snapshot.rows;
    $('health').textContent=stale?'● 数据已过期':rows.length===39?'● 监控运行中':`● 部分行情缺失 (${rows.length}/39)`;
    $('updated').textContent=`采集：${time(snapshot.updatedAt)} · 本地时间`;
    $('coverage').textContent=rows.length;
    $('quoted').textContent=rows.filter(r=>Number.isFinite(r.executableDiscount)).length;
    $('amount').textContent=money(snapshot.amountUsd);
    $('notice').textContent=stale?'扫描超过 9 分钟未更新，以下为历史报价，暂勿依据折价操作。':`参考行情 ${snapshot.referenceCount}/39 · 链上行情 ${snapshot.marketPriceCount}/39 · ${snapshot.notificationsEnabled?'提醒同步至 YC 链上信号':'频道提醒暂未启用'}。`;
    $('pairs').innerHTML=rows.map(r=>`<article class="pair-card ${!stale&&r.executableDiscount>=.02?'is-rising':''}"><div class="pair-heading"><h2>${esc(r.symbol)}<small> / ${esc(r.stable)}</small></h2><span class="signal">${stale?'历史报价':Number.isFinite(r.executableDiscount)?'已报价复核':'粗价观察'}</span></div><div class="pair-main"><div><span>粗略折价</span><strong class="stock-discount">${pct(r.roughDiscount)}</strong></div><div><span>可成交折价</span><strong class="stock-price">${pct(r.executableDiscount)}</strong></div></div><div class="pair-metrics"><div><span>链上粗价</span>${money(r.roughPrice)}</div><div><span>参考价</span>${money(r.referencePrice)}</div><div><span>$500 有效买入价</span>${money(r.effectivePrice)}</div><div><span>价格影响</span>${Number.isFinite(r.priceImpactPercent)?r.priceImpactPercent.toFixed(3)+'%':'—'}</div></div><p class="pair-footnote">Yahoo ${esc(r.yahoo)} · ${esc(r.referenceSession)}<br>原股 ${r.currency==='HKD'?'HK$':'$'}${esc(r.quote)} · multiplier ${esc(r.multiplier)}${r.currency==='HKD'?'<br>HKD/USD '+esc(r.hkdPerUsd):''}<br>参考行情 ${time(r.referenceTime)}<br>链上行情 ${time(r.marketTime)}</p></article>`).join('')||'<p class="empty-pairs">本轮暂无有效价格配对，等待下一轮扫描。</p>';
  }
  async function refresh(){
    if(busy)return;busy=true;
    try{
      if(!endpoint){const r=await fetch('/monitor/stocks/config.json');if(!r.ok)throw Error();endpoint=(await r.json()).endpoint;}
      const r=await fetch(endpoint,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();
      const data=await r.json();if(!Array.isArray(data.rows)||!Number.isFinite(data.updatedAt))throw Error();snapshot=data;render();
    }catch{render();$('health').textContent='● 暂时无法连接';$('notice').textContent=snapshot?'连接失败，保留上次快照；请核对采集时间。':'暂时无法读取云端快照，等待自动重试。';}
    finally{busy=false;}
  }
  refresh();setInterval(()=>{if(!document.hidden)refresh();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
