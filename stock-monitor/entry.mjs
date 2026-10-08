export { default } from './worker.mjs';
export { MonitorState } from './durable-object.mjs';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { channelSettings, setChannelNotification } from './channel-settings.mjs';
// Only authenticated Bot code can reach this account-local service entrypoint.
export class ChannelControls extends WorkerEntrypoint {
  async getSettings() { return channelSettings(this.env); }
  async setNotification(type, enabled) { return setChannelNotification(this.env, type, enabled); }
}
