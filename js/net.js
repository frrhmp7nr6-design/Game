import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Paste your Supabase Project URL and Anon Key here:
const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const ROOM_CHANNEL = 'isowalk-act1-server';

export const remotePlayers = new Map();
export let netStatus = 'offline';

let channel = null;
let myId = `surv-${Math.random().toString(36).slice(2, 9)}`;
let lastPosSent = 0;

export function initNetwork(player, callbacks) {
  const netBadge = document.getElementById('net-status');
  const updateBadge = () => {
    if (!netBadge) return;
    const count = remotePlayers.size + 1;
    netBadge.textContent =
      netStatus === 'online' ? `🟢 ${count} ONLINE` : '⚪ SOLO MODE';
    netBadge.style.color = netStatus === 'online' ? '#4ade80' : '#94a3b8';
  };

  if (!SUPABASE_URL.startsWith('http') || SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
    netStatus = 'offline';
    updateBadge();
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  channel = supabase.channel(ROOM_CHANNEL, {
    config: {
      presence: { key: myId },
      broadcast: { self: false }
    }
  });

  // 1. Presence sync (join / leave)
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    const activeIds = new Set(Object.keys(state));
    for (const id of remotePlayers.keys()) {
      if (!activeIds.has(id)) remotePlayers.delete(id);
    }
    updateBadge();
  });

  // 2. Player movement, aim & health updates
  channel.on('broadcast', { event: 'pos' }, ({ payload }) => {
    if (!payload || payload.id === myId) return;
    const existing = remotePlayers.get(payload.id) || {};
    remotePlayers.set(payload.id, {
      ...existing,
      ...payload,
      lastSeen: performance.now()
    });
    updateBadge();
  });

  // 3. Shared world events (doors, loot, zombie kills, convoy progress)
  channel.on('broadcast', { event: 'world' }, ({ payload }) => {
    if (!payload) return;
    if (payload.kind === 'door' && callbacks.onRemoteDoor) {
      callbacks.onRemoteDoor(payload);
    } else if (payload.kind === 'loot' && callbacks.onRemoteLoot) {
      callbacks.onRemoteLoot(payload);
    } else if (payload.kind === 'zkill' && callbacks.onRemoteZombieKill) {
      callbacks.onRemoteZombieKill(payload);
    } else if (payload.kind === 'convoy' && callbacks.onRemoteConvoy) {
      callbacks.onRemoteConvoy(payload);
    }
  });

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      netStatus = 'online';
      await channel.track({
        id: myId,
        archetype: player.archetype,
        joinedAt: Date.now()
      });
      updateBadge();
    }
  });
}

export function broadcastPlayerState(player) {
  if (!channel || netStatus !== 'online' || !player.started) return;
  const now = performance.now();
  if (now - lastPosSent < 65) return; // ~15 updates/sec
  lastPosSent = now;

  channel.send({
    type: 'broadcast',
    event: 'pos',
    payload: {
      id: myId,
      x: Number(player.x.toFixed(2)),
      y: Number(player.y.toFixed(2)),
      angle: Number(player.angle.toFixed(2)),
      hp: Math.ceil(player.hp),
      maxHp: player.maxHp,
      archetype: player.archetype,
      weapon: player.equippedWeapon,
      isSprinting: player.isSprinting
    }
  });
}

export function broadcastWorldEvent(payload) {
  if (!channel || netStatus !== 'online') return;
  channel.send({
    type: 'broadcast',
    event: 'world',
    payload: { ...payload, sender: myId }
  });
}
