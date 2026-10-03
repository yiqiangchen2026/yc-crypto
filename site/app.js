document.querySelectorAll('[data-checklist]').forEach(list=>{
  const key='yc-crypto:'+list.dataset.checklist;
  const inputs=[...list.querySelectorAll('input[type="checkbox"]')];
  const progress=document.querySelector('[data-progress]');
  function update(){if(progress)progress.textContent=`${inputs.filter(i=>i.checked).length} / ${inputs.length} 已检查`;}
  try{const saved=JSON.parse(localStorage.getItem(key)||'[]');inputs.forEach(i=>i.checked=Array.isArray(saved)&&saved.includes(i.value));}catch{}
  function save(){try{localStorage.setItem(key,JSON.stringify(inputs.filter(i=>i.checked).map(i=>i.value)));}catch{const n=document.querySelector('.storage-note');if(n)n.textContent='浏览器未允许保存，勾选仅在本次页面有效。';}update();}
  inputs.forEach(i=>i.addEventListener('change',save));
  document.querySelector('[data-reset]')?.addEventListener('click',()=>{inputs.forEach(i=>i.checked=false);save();});
  update();
});
