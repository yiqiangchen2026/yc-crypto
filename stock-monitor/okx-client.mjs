const OKX_API = "https://web3.okx.com";
const OKX_MIN_INTERVAL_MS = 1250;
const OKX_MAX_ATTEMPTS = 5;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function base64(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function readLimited(response, maxBytes = 2_000_000) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel("response too large");
      throw new Error(`OKX 响应超过 ${maxBytes} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export function createOkxClient(env) {
  let lastRequestAt = 0;
  return async function okx(path, { params, payload } = {}) {
    const method = payload === undefined ? "GET" : "POST";
    const query = params ? `?${new URLSearchParams(params)}` : "";
    const requestPath = path + query;
    const body = payload === undefined ? "" : JSON.stringify(payload);
    for (let attempt = 1; attempt <= OKX_MAX_ATTEMPTS; attempt += 1) {
      const waitForSlot = OKX_MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
      if (waitForSlot > 0) await sleep(waitForSlot);
      if (env.STATE_STORAGE === 'd1' && env.HISTORY_DB) {
        const slot = await env.HISTORY_DB.prepare(`INSERT INTO api_request_slots(key,next_at) VALUES('okx',?)
          ON CONFLICT(key) DO UPDATE SET next_at=MAX(api_request_slots.next_at+1250,excluded.next_at)
          RETURNING next_at`).bind(Date.now()).first();
        const delay = slot.next_at - Date.now();
        if (delay > 0) await sleep(delay);
      }
      const timestamp = new Date().toISOString();
      const key = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(env.OKX_SECRET_KEY),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const signature = base64(await crypto.subtle.sign(
        "HMAC", key, new TextEncoder().encode(`${timestamp}${method}${requestPath}${body}`)
      ));
      lastRequestAt = Date.now();
      const response = await fetch(OKX_API + requestPath, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "xlayer-wallet-report/3.0",
          "OK-ACCESS-KEY": env.OKX_API_KEY,
          "OK-ACCESS-SIGN": signature,
          "OK-ACCESS-PASSPHRASE": env.OKX_PASSPHRASE,
          "OK-ACCESS-TIMESTAMP": timestamp
        },
        signal: AbortSignal.timeout(15000),
        body: body || undefined
      });
      const responseText = await readLimited(response);
      let result = null;
      try { result = responseText ? JSON.parse(responseText) : null; } catch { /* HTML WAF response */ }
      const isRateLimited = response.status === 429 || String(result?.code) === "1015" || /error code:\s*1015/i.test(responseText);
      const retryable = isRateLimited || response.status >= 500;
      if (retryable && attempt < OKX_MAX_ATTEMPTS) {
        const retryAfterSeconds = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : 1500 * (2 ** (attempt - 1));
        console.warn(JSON.stringify({ event: "okx_retry", path, status: response.status, attempt, delay }));
        await sleep(delay);
        continue;
      }
      if (!response.ok) throw new Error(`OKX ${path} HTTP ${response.status}: ${responseText.slice(0, 200)}`);
      if (!result) throw new Error(`OKX ${path} 返回了非 JSON 响应`);
      if (String(result.code) !== "0") throw new Error(`OKX ${path} ${result.code}: ${result.msg}`);
      return result.data;
    }
    throw new Error(`OKX ${path} 重试耗尽`);
  };
}

