import { WorkerEntrypoint } from 'cloudflare:workers';
import worker from './worker.mjs';
import { sendStockSignal, sendUsdgSignal, sendVolumeSignal } from './stock-notifier.mjs';
export default worker;
// This entrypoint is reachable only through an account-local Service Binding.
// It has no public HTTP route and cannot select arbitrary bots or recipients.
export class StockNotifier extends WorkerEntrypoint {
  async send(text, options = {}) { return sendStockSignal(this.env, text, options); }
  async sendVolume(text, options = {}) { return sendVolumeSignal(this.env,text,fetch,options); }
  async sendUsdg(text) { return sendUsdgSignal(this.env, text); }
}
