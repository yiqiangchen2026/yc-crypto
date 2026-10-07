const WRAPPER = '0x4c1ae29c159838fc1b224636e28e086eb69101f7';
const ASSET = '0xa753a7395cae905cd615da0b82a53e0560f250af';
const ENDPOINTS = ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'];
const $ = id => document.getElementById(id);
let snapshot;
export function formatUnits(value, decimals = 18) {
  const text = value.toString().padStart(decimals + 1, '0');
  const fraction = text.slice(-decimals).replace(/0+$/, '');
  return decimals ? text.slice(0, -decimals) + (fraction ? '.' + fraction : '') : text;
}
export function parseUnits(text) {
  if (!/^\d{1,30}(\.\d{1,18})?$/.test(text)) throw new Error('请输入非负数量，最多 18 位小数。');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
}
async function batch(endpoint, calls) {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(calls.map((call, id) => ({ jsonrpc: '2.0', id, ...call }))),
    signal: AbortSignal.timeout(12000), credentials: 'omit',
  });
  if (!response.ok) throw new Error('RPC 请求失败');
  const values = await response.json();
  if (!Array.isArray(values)) throw new Error('RPC 返回格式异常');
  return calls.map((_, id) => {
    const item = values.find(value => value.id === id);
    if (!item || item.error || !/^0x[0-9a-f]+$/i.test(item.result)) throw new Error('链上查询失败');
    return item.result;
  });
}
const call = (to, data, block) => ({ method: 'eth_call', params: [{ to, data }, block] });
async function read(endpoint) {
  const [chain, block] = await batch(endpoint, [
    { method: 'eth_chainId', params: [] }, { method: 'eth_blockNumber', params: [] },
  ]);
  if (BigInt(chain) !== 196n) throw new Error('RPC 网络不匹配');
  const [assets, underlying, wrapperDecimals, assetDecimals] = await batch(endpoint, [
    call(WRAPPER, '0x07a2d13a' + (10n ** 18n).toString(16).padStart(64, '0'), block),
    call(WRAPPER, '0x38d52e0f', block), call(WRAPPER, '0x313ce567', block), call(ASSET, '0x313ce567', block),
  ]);
  if ('0x' + underlying.slice(-40).toLowerCase() !== ASSET || BigInt(wrapperDecimals) !== 18n || BigInt(assetDecimals) !== 18n || BigInt(assets) <= 0n) throw new Error('合约资产或小数位不匹配');
  return { assets: BigInt(assets), block: BigInt(block), time: new Date() };
}
function convert() {
  if (!snapshot) return;
  try {
    const amount = parseUnits($('amount').value.trim());
    // Integer division rounds down to the underlying token's smallest unit.
    $('converted').textContent = '对应 ' + formatUnits(amount * snapshot.assets / (10n ** 18n)) + ' QQQx';
    $('amount').setAttribute('aria-invalid', 'false');
  } catch (error) {
    $('converted').textContent = error.message;
    $('amount').setAttribute('aria-invalid', 'true');
  }
}
async function refresh() {
  $('refresh').disabled = true;
  $('result').hidden = true;
  snapshot = undefined;
  $('status').textContent = '正在读取 X Layer 链上比例…';
  $('status').dataset.error = 'false';
  try {
    for (const endpoint of ENDPOINTS) {
      try { snapshot = await read(endpoint); break; } catch { /* Try the next official RPC. */ }
    }
    if (!snapshot) throw new Error('查询失败：X Layer 公共 RPC 暂时不可用，请稍后刷新。');
    $('ratio').textContent = formatUnits(snapshot.assets);
    const difference = snapshot.assets - 10n ** 18n;
    $('premium').textContent = '相对 1:1 ' + (difference < 0n ? '减少 ' : '增加 ') + formatUnits((difference < 0n ? -difference : difference) * 100n) + '%';
    $('record').textContent = '查询时间：' + snapshot.time.toLocaleString('zh-CN', { timeZoneName: 'short' }) + ' · 区块：' + snapshot.block;
    $('status').textContent = '查询成功 · 手动刷新获取最新比例';
    $('result').hidden = false;
    convert();
  } catch (error) {
    $('status').textContent = error.message;
    $('status').dataset.error = 'true';
  } finally { $('refresh').disabled = false; }
}
if (typeof document !== 'undefined') {
  $('refresh').addEventListener('click', refresh);
  $('amount').addEventListener('input', convert);
  refresh();
}
