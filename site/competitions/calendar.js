(async () => {
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data;
  try {
    const response = await fetch('/competitions/data.json');
    if (!response.ok) throw new Error('load');
    data = await response.json();
  } catch {
    $('competition-list').innerHTML = '<p class="calendar-empty">活动数据暂时无法加载，请刷新重试。也可先查看 <a class="text-link" href="https://web3.okx.com/boost/x-trade">OKX 官方交易赛列表 ↗</a>。</p>';
    return;
  }
  let zone = $('timezone').value, view = 'list', selectedDay = '';
  const parts = date => new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(date));
  const dayKey = date => {const p = Object.fromEntries(parts(date).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`;};
  const currentMonth = () => dayKey(new Date()).slice(0,7);
  let month = currentMonth();
  const dateText = date => new Intl.DateTimeFormat('zh-CN',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(date));
  const state = (d, at = Date.now()) => at < Date.parse(d.start) ? 'upcoming' : at < Date.parse(d.end) ? 'active' : 'ended';
  const labels = {upcoming:'即将开始',active:'进行中',ended:'已结束'};
  const countdown = d => {
    const s=state(d); if(s==='ended') return '交易期已结束';
    const minutes=Math.max(1,Math.ceil((Date.parse(s==='upcoming'?d.start:d.end)-Date.now())/60000));
    const days=Math.floor(minutes/1440), hours=Math.floor(minutes%1440/60), mins=minutes%60;
    return `${s==='upcoming'?'距开始':'距结束'} ${days?days+'天 ':''}${hours}小时 ${mins}分`;
  };
  for (const [id,key] of [['platform','platform'],['chain','chain']]) {
    [...new Set(data.map(d=>d[key]))].forEach(value=> {const opt=document.createElement('option');opt.value=value;opt.textContent=value;$(id).append(opt);});
  }
  const matches = d => {
    if(['platform','chain','kind'].some(k=>$(k).value && $(k).value!==d[k])) return false;
    const s=state(d), wanted=$('status').value;
    if(wanted==='open' ? s==='ended' : wanted && wanted!==s) return false;
    const query=$('search').value.trim().toLowerCase();
    return !query || [d.title,d.platform,d.chain,d.assets].join(' ').toLowerCase().includes(query);
  };
  // Compare zoned calendar days. An exact midnight deadline does not cover that new day.
  const covers = (d,day) => dayKey(d.start)<=day && dayKey(Date.parse(d.end)-1)>=day;
  function renderMonth(filtered) {
    const [year,m]=month.split('-').map(Number), total=new Date(Date.UTC(year,m,0)).getUTCDate();
    const offset=(new Date(Date.UTC(year,m-1,1)).getUTCDay()+6)%7;
    $('month-title').textContent=`${year} 年 ${m} 月`;
    let grid=['一','二','三','四','五','六','日'].map(d=>`<span class="weekday">周${d}</span>`).join('');
    grid+=Array.from({length:offset},()=>'<span class="calendar-blank" aria-hidden="true"></span>').join('');
    for(let n=1;n<=total;n++) {
      const day=`${month}-${String(n).padStart(2,'0')}`, live=filtered.filter(d=>covers(d,day));
      const starts=filtered.filter(d=>dayKey(d.start)===day).length, ends=filtered.filter(d=>dayKey(d.end)===day).length;
      grid+=`<button type="button" data-day="${day}" class="calendar-day ${day===dayKey(new Date())?'is-today':''} ${day===selectedDay?'is-selected':''}" aria-pressed="${day===selectedDay}" aria-label="${day}，${live.length} 场活动，${starts} 场开始，${ends} 场结束"><span>${n}</span><small>${live.length?live.length+' 场':''}</small><em>${starts?starts+' 开始 ':''}${ends?ends+' 结束':''}</em></button>`;
    }
    $('month-grid').innerHTML=grid;
  }
  function render() {
    const filtered=data.filter(matches);
    const rows=filtered.filter(d=>!selectedDay||covers(d,selectedDay)).sort((a,b)=>Date.parse(a.end)-Date.parse(b.end));
    const active=data.filter(d=>state(d)==='active').length, upcoming=data.filter(d=>state(d)==='upcoming').length;
    $('calendar-stats').innerHTML=`<div><strong>${active}</strong><span>进行中赛程</span></div><div><strong>${upcoming}</strong><span>即将开始赛程</span></div><div><strong>${new Set(data.map(d=>d.platform)).size}</strong><span>收录平台</span></div><div><strong>${new Set(data.map(d=>d.source)).size} / ${data.length}</strong><span>活动 / 分轮赛程</span></div>`;
    $('result-count').textContent=`${selectedDay?selectedDay+' · ':''}显示 ${rows.length} 个赛程 · 按结束时间排序`;
    $('clear-day').hidden=!selectedDay;
    $('competition-list').innerHTML=rows.length ? rows.map(d=>`<article class="competition-card" id="${escape(d.id)}"><div class="competition-date"><span class="tag ${state(d)==='active'?'tag-green':''}">${labels[state(d)]}</span><strong>${escape(dateText(d.end).split(' ')[0])}</strong><span>结束 ${escape(dateText(d.end).split(' ')[1]||'')}</span><small>${countdown(d)}</small></div><div class="competition-body"><div class="tags"><span class="tag">${escape(d.platform)}</span><span class="tag">${escape(d.chain)}</span><span class="tag">${escape(d.kind)}</span></div><div class="competition-title"><h2>${escape(d.title)}</h2><strong>${escape(d.reward)}</strong></div><p class="competition-assets">${escape(d.assets)}</p><p class="meta"><time datetime="${d.start}">${dateText(d.start)}</time> → <time datetime="${d.end}">${dateText(d.end)}</time></p><div class="lp-note"><span>LP 观察方向 · 池子待核实</span><p>${escape(d.lp)}</p></div><details><summary>计分规则与参与条件</summary><p>${escape(d.rules)}</p><p>${escape(d.entry)}</p><p class="meta">${escape(d.note)}</p></details><div class="competition-links"><a class="text-link" href="${escape(d.url)}" target="_blank" rel="noopener noreferrer">官方活动 ↗</a><a class="text-link" href="${escape(d.source)}" target="_blank" rel="noopener noreferrer">规则来源 ↗</a><span class="meta">核实于 ${escape(d.verified)}</span></div></div></article>`).join('') : '<p class="calendar-empty">没有符合条件的赛程。试试其他筛选条件或月份。</p>';
    if(view==='month') renderMonth(filtered);
  }
  ['platform','chain','status','kind'].forEach(id=>$(id).addEventListener('change',render));
  $('search').addEventListener('input',render);
  $('timezone').addEventListener('change',()=>{zone=$('timezone').value;selectedDay='';render();});
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    view=button.dataset.view;selectedDay='';$('month-view').hidden=view!=='month';
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();
  }));
  function shiftMonth(step) { const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+step,1));month=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;selectedDay='';render(); }
  $('prev-month').addEventListener('click',()=>shiftMonth(-1));
  $('next-month').addEventListener('click',()=>shiftMonth(1));
  $('today').addEventListener('click',()=>{month=currentMonth();selectedDay='';render();});
  $('clear-day').addEventListener('click',()=>{selectedDay='';render();});
  $('month-grid').addEventListener('click',event=>{const button=event.target.closest('[data-day]');if(button){selectedDay=selectedDay===button.dataset.day?'':button.dataset.day;render();}});
  render();setInterval(render,60000);
})();
