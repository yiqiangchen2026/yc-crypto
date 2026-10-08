import { monitorStore } from './storage.mjs';
const types = ['stocks', 'volume', 'xlayerVolume'];
export async function channelSettings(env) {
  const store = monitorStore(env);
  const values = await Promise.all(types.map(type => store.get(`channel-notifications-${type}-v1`, 'json')));
  // Initialize the split setting once, preserving the old shared preference.
  if (typeof values[2] !== 'boolean') {
    values[2] = typeof values[1] === 'boolean' ? values[1] : true;
    await store.put('channel-notifications-xlayerVolume-v1', JSON.stringify(values[2]));
  }
  return Object.fromEntries(types.map((type, i) => [type, typeof values[i] === 'boolean' ? values[i] :
    type === 'stocks' ? env.XSTOCK_PUBLIC_ALERTS_ENABLED === 'true' : true]));
}
export async function setChannelNotification(env, type, enabled) {
  if (!types.includes(type) || typeof enabled !== 'boolean') throw Error('Invalid notification setting');
  await channelSettings(env);
  await monitorStore(env).put(`channel-notifications-${type}-v1`, JSON.stringify(enabled));
  return channelSettings(env);
}
