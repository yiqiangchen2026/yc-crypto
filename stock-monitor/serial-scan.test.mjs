import test from 'node:test';
import assert from 'node:assert/strict';
import { SerialScan } from './serial-scan.mjs';
import worker from './worker.mjs';

test('stock and USDG runs stay serial across awaits and recover from a failed invocation', async () => {
  const seen = []; let release, active = 0, peak = 0;
  const scans = new SerialScan(async job => {
    active++; peak = Math.max(peak, active); seen.push(job.kind);
    try {
      if (job.kind === 'stock-scan') await new Promise(resolve => { release = resolve; });
      if (job.kind === 'fail') throw Error('failure');
      return job.kind;
    } finally { active--; }
  });
  const first = scans.run({ kind: 'stock-scan' }), next = scans.run({ kind: 'usdg-scan' });
  while (!release) await Promise.resolve();
  assert.deepEqual(seen, ['stock-scan']); release(); await Promise.all([first, next]);
  assert.equal(peak, 1); assert.deepEqual(seen, ['stock-scan', 'usdg-scan']);
  await assert.rejects(scans.run({ kind: 'fail' }), /failure/);
  assert.equal(await scans.run({ kind: 'next' }), 'next');
});

test('durable cron keeps three-minute cadence without Queue writes and drains legacy jobs through the same runner', async () => {
  const values = new Map(), calls = [], pending = [];
  const object = { scan: async job => calls.push(job), get: async key => values.get(key), put: async (k, v) => values.set(k, v) };
  const env = { STATE_STORAGE: 'durable-object', SCAN_ENABLED: 'true', USDG_SCAN_ENABLED: 'true',
    MONITOR_STATE: { idFromName: name => name, get: () => object },
    SCAN_QUEUE: { send: () => assert.fail('Queue write') } };
  const ctx = { waitUntil: task => pending.push(task) };
  for (const minute of [0, 1, 2, 3, 4, 5]) {
    await worker.scheduled({ scheduledTime: Date.parse(`2026-10-08T10:0${minute}:00Z`) }, env, ctx);
    await Promise.all(pending);
  }
  assert.deepEqual(calls.map(j => j.kind), ['stock-scan', 'usdg-scan', 'stock-scan', 'usdg-scan']);
  assert.ok(values.get('stock-cron-v1')); assert.ok(values.get('usdg-cron-v1'));
  let acked = false;
  await worker.queue({ messages: [{ body: calls[0], ack: () => { acked = true; } }] }, env);
  assert.equal(calls.length, 5); assert.ok(acked);
});
