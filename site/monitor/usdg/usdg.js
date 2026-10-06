(() => {
  const $=id=>document.getElementById(id);
  const number=n=>Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6}):'—';
  let endpoint,snapshot,busy=false;
  function render(){
    if(!snapshot)return;
    const q=snapshot.quote,stale=Date.now()-snapshot.updatedAt>540000;
    const verified=q.source==='PendleSwap',candidate=q.grossEdgeRate>=snapshot.threshold;
    $('health').textContent=!snapshot.enabled?'● 监控暂停':stale?'● 数据已过期':snapshot.error?'● 本轮扫描异常':'● 监控运行中';
    $('updated').textContent=`采集：${new Date(snapshot.updatedAt).toLocaleString('zh-CN',{hour12:false})} · 本地时间`;
    $('input').textContent=number(q.input);$('output').textContent=number(q.output);
    $('edge').textContent=(q.grossEdge>=0?'+':'')+number(q.grossEdge);
    $('rate').textContent=(q.grossEdgeRate>=0?'+':'')+(q.grossEdgeRate*100).toFixed(4)+'%';
    $('minimum').textContent=verified?number(q.minOutput):'未复核';
    $('threshold').textContent=(snapshot.threshold*100).toFixed(2)+'%';
    $('source').textContent=verified?'PendleSwap 复核':'OKX 候选初筛';
    const actionable=snapshot.enabled&&!stale&&!snapshot.error;
    $('signal').textContent=!actionable?'历史报价':verified&&candidate&&q.minOutput>q.input?'复核达到门槛':candidate?'候选观察':'未达门槛';
    $('quote-card').classList.toggle('is-rising',actionable&&verified&&candidate&&q.minOutput>q.input);
    $('notice').textContent=!snapshot.enabled?'自动扫描暂未启用，以下为历史快照。':stale?'超过 9 分钟未更新，以下为历史报价，请等待新快照。':snapshot.error?'本轮扫描失败，保留上次成功报价；请核对采集时间。':'提醒同步至 YC 链上信号。毛差不是净利润，操作前请刷新实际兑换报价。';
  }
  async function refresh(){
    if(busy)return;busy=true;
    try{
      if(!endpoint){const r=await fetch('/monitor/usdg/config.json');if(!r.ok)throw Error();endpoint=(await r.json()).endpoint;}
      const r=await fetch(endpoint,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();
      const data=await r.json();if(!Number.isFinite(data.updatedAt)||!Number.isFinite(data.quote?.grossEdgeRate)||!Number.isFinite(data.quote?.input)||!Number.isFinite(data.quote?.output)||!Number.isFinite(data.threshold))throw Error();
      snapshot=data;render();
    }catch{render();$('health').textContent='● 暂时无法连接';$('notice').textContent=snapshot?'连接失败，保留上次成功快照；请核对采集时间。':'暂时无法读取云端快照，等待自动重试。';$('signal').textContent='等待更新';$('quote-card').classList.remove('is-rising');}
    finally{busy=false;}
  }
  refresh();setInterval(()=>{if(!document.hidden)refresh();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
