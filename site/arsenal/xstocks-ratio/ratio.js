const ENDPOINTS = ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'];
const $ = id => document.getElementById(id);
const SIZE = 20;
let assets = [], page = 0, generation = 0, searchTimer;
export function formatUnits(value, decimals = 18) {
  if (!decimals) return value.toString();
  const text = value.toString().padStart(decimals + 1, '0');
  const fraction = text.slice(-decimals).replace(/0+$/, '');
  return text.slice(0, -decimals) + (fraction ? '.' + fraction : '');
}
async function batch(endpoint, calls, signal) {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(calls.map((call, id) => ({ jsonrpc: '2.0', id, ...call }))),
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]), credentials: 'omit',
  });
  if (!response.ok) throw new Error('RPC 请求失败');
  const values = await response.json();
  if (!Array.isArray(values)) throw new Error('RPC 返回格式异常');
  return calls.map((_, id) => {
    const item = values.find(value => value.id === id);
    return item && !item.error && /^0x[0-9a-f]+$/i.test(item.result) ? item.result : null;
  });
}
const call = (to, data, block) => ({ method: 'eth_call', params: [{ to, data }, block] });
function filtered() {
  const term = $('search').value.trim().toLowerCase();
  return assets.filter(row => (row.symbol + ' ' + row.name).toLowerCase().includes(term));
}
function cell(text, className) {
  const td = document.createElement('td'); td.textContent = text;
  if (className) td.className = className;
  return td;
}
function tokenCell(symbol, address) {
  const td = cell(''); const a = document.createElement('a');
  a.textContent = symbol; a.href = 'https://web3.okx.com/explorer/xlayer/address/' + address;
  a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = address; td.append(a); return td;
}
let controller;
async function refresh() {
  controller?.abort(); controller = new AbortController();
  const signal = controller.signal, current = ++generation;
  const list = filtered(), totalPages = Math.max(1, Math.ceil(list.length / SIZE));
  page = Math.min(page, totalPages - 1);
  const visible = list.slice(page * SIZE, (page + 1) * SIZE);
  $('rows').replaceChildren(); $('record').textContent = '';
  $('page').textContent = `${page + 1} / ${totalPages} · ${list.length} 个资产`;
  $('prev').disabled = page === 0; $('next').disabled = page + 1 >= totalPages;
  $('refresh').disabled = true;
  const elements = visible.map(row => {
    const tr = document.createElement('tr'); const name = cell(row.symbol);
    const small = document.createElement('small'); small.textContent = row.name.replace(/ xStock$/, ''); name.append(small);
    const ratio = cell('—', 'ratio-number'), status = cell('查询中');
    tr.append(name, tokenCell('w' + row.symbol, row.wrapper), tokenCell(row.symbol, row.address), ratio, status);
    $('rows').append(tr); return { ratio, status };
  });
  if (!visible.length) { $('status').textContent = '没有匹配的股票。'; $('refresh').disabled = false; return; }
  $('status').textContent = `正在查询本页 ${visible.length} 个资产…`;
  let done = 0, success = 0;
  try {
    let endpoint, block;
    for (const url of ENDPOINTS) {
      try {
        const [chain, head] = await batch(url, [{method:'eth_chainId',params:[]},{method:'eth_blockNumber',params:[]}], signal);
        if (!chain || !head || BigInt(chain) !== 196n) throw new Error('网络不匹配');
        endpoint = url; block = head; break;
      } catch (error) { if (signal.aborted) throw error; }
    }
    if (!endpoint) throw new Error('公共 RPC 暂不可用，请稍后刷新。');
    // Small sequential batches avoid overwhelming the shared public RPC.
    for (let offset = 0; offset < visible.length; offset += 1) {
      const group = visible.slice(offset, offset + 1);
      const calls = group.flatMap(row => [
        call(row.wrapper, '0x07a2d13a' + (10n ** 18n).toString(16).padStart(64, '0'), block),
        call(row.wrapper, '0x38d52e0f', block), call(row.wrapper, '0x313ce567', block), call(row.address, '0x313ce567', block),
      ]);
      let values;
      try { values = await batch(endpoint, calls, signal); }
      catch (error) {
        if (signal.aborted) throw error;
        try { values = await batch(ENDPOINTS.find(url => url !== endpoint), calls, signal); }
        catch { values = calls.map(() => null); }
      }
      if (current !== generation) return;
      group.forEach((row, index) => {
        const [amount, underlying, wd, ad] = values.slice(index * 4, index * 4 + 4);
        const element = elements[offset + index];
        if (amount && underlying && wd && ad && BigInt(wd) === 18n && BigInt(ad) === 18n && BigInt(amount) > 0n && '0x' + underlying.slice(-40).toLowerCase() === row.address.toLowerCase()) {
          element.ratio.textContent = formatUnits(BigInt(amount));
          element.ratio.title = `1 w${row.symbol} = ${formatUnits(BigInt(amount))} ${row.symbol}`;
          element.status.textContent = '已查询'; success++;
        } else { element.ratio.textContent = '—'; element.status.textContent = '查询失败'; }
        done++;
      });
      $('status').textContent = `已查询 ${done} / ${visible.length}，成功 ${success} 个`;
      await new Promise(resolve => setTimeout(resolve, 220));
      if (signal.aborted) return;
    }
    $('record').textContent = `查询时间：${new Date().toLocaleString('zh-CN', {timeZoneName:'short'})} · 区块：${BigInt(block)} · 比例单位：底层代币 / 1 包装代币`;
    $('status').textContent = `本页 ${success} 个查询成功${success < visible.length ? `，${visible.length - success} 个失败，可刷新重试` : ''}`;
  } catch (error) {
    if (current !== generation || signal.aborted) return;
    $('status').textContent = error.message;
    elements.forEach(element => { if (element.status.textContent === '查询中') element.status.textContent = '查询失败'; });
  } finally { if (current === generation) $('refresh').disabled = false; }
}
if (typeof document !== 'undefined') {
  $('refresh').addEventListener('click', refresh);
  $('prev').addEventListener('click', () => { page--; refresh(); });
  $('next').addEventListener('click', () => { page++; refresh(); });
  $('search').addEventListener('input', () => {
    controller?.abort(); generation++; clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { page = 0; refresh(); }, 350);
  });
  fetch('./assets.json').then(response => { if (!response.ok) throw new Error('加载列表失败'); return response.json(); })
    .then(data => { assets = data.assets; refresh(); })
    .catch(() => { $('status').textContent = '股票列表加载失败，请刷新页面。'; $('refresh').disabled = true; });
}
