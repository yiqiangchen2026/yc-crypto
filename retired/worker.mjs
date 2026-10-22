import {WorkerEntrypoint} from 'cloudflare:workers';
export class ChannelControls extends WorkerEntrypoint {}
// Historical state stays intact. No scans, notification sends, or transaction code.
export class MonitorState {
  constructor(ctx) { this.ctx = ctx; }
  async alarm() { await this.ctx.storage.deleteAlarm(); }
  async fetch() { return new Response('Legacy monitor retired', {status: 410}); }
}
export default { fetch() { return new Response('旧监控已下线', {
  status: 410, headers: {'content-type':'text/plain; charset=utf-8'}
}); } };
