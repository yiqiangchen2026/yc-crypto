import { monitorStore } from './storage.mjs';
const types = ['stocks', 'volume'];
export async function channelSettings(env) {
  const store = monitorStore(env);
  const values = await Promise.all(types.map(type => store.get(`channel-notifications-${type}-v1`, 'json')));
  return Object.fromEntries(types.map((type, i) => [type, typeof values[i] === 'boolean' ? values[i] :
    type === 'stocks' ? env.XSTOCK_PUBLIC_ALERTS_ENABLED === 'true' : true]));
}
export async function setChannelNotification(env, type, enabled) {
  if (!types.includes(type) || typeof enabled !== 'boolean') throw Error('Invalid notification setting');
  await monitorStore(env).put(`channel-notifications-${type}-v1`, JSON.stringify(enabled));
  return channelSettings(env);
}
