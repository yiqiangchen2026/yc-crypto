export async function sendStockSignal(env, text, options = {}, fetcher = fetch) {
  if (typeof text !== 'string' || text.length > 3900 ||
      !/^[📉⚪📋]+ YC 链上信号｜股票价差/u.test(text) ||
      !text.endsWith('https://yc-crypto.pages.dev/monitor/stocks/')) {
    throw new Error('Invalid stock signal');
  }
  if (!env.TG_BOT_TOKEN || !env.TG_CHANNEL_ID) throw new Error('Signal destination unavailable');
  const response = await fetcher(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
    body: JSON.stringify({ chat_id: env.TG_CHANNEL_ID, text, disable_notification: options.silent === true,
      link_preview_options: { is_disabled: true } })
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error('Stock signal delivery failed');
  return { delivered: true };
}
