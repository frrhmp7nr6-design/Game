export const CHUNK_SIZE = 32;
export const WORLD_CHUNKS = 32;
export const MAP_SIZE = CHUNK_SIZE * WORLD_CHUNKS; // 1024
export const CENTER = 512;

const chunkCache = new Map();

export const openedDoors = new Set();
export const doorDamage = new Map();
export const lootedIds = new Set();
export const killedZombieIds = new Set();
export const droppedLoot = [];

function hash2d(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = (n ^ (n >> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

export function getZoneInfo(wx, wy) {
  const dist = Math.max(Math.abs(wx - CENTER), Math.abs(wy - CENTER));
  if (dist <= 64) return { ring: 0, name: 'Quarry Safe Hub', color: '#4ade80' };
  if (dist <= 210) return { ring: 1, name: 'Ring 1: Oakridge', color: '#38bdf8' };
  if (dist <= 370) return { ring: 2, name: 'Ring 2: Hwy 9 Midtown', color: '#f59e0b' };
  if (dist <= 503) return { ring: 3, name: 'Ring 3: Quarantine', color: '#ef4444' };
  return { ring: 4, name: 'Quarantine Wall', color: '#94a3b8' };
}

function stampBuilding(chunk, id, name, x1, y1, x2, y2, doorSpecs, defaultRevealed = false) {
  chunk.buildings.push({ id, name, x1, y1, x2, y2, defaultRevealed });
  for (let wy = y1; wy <= y2; wy++) {
    for (let wx = x1; wx <= x2; wx++) {
      const lx = wx - chunk.cx * CHUNK_SIZE;
      const ly = wy - chunk.cy * CHUNK_SIZE;
      if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_SIZE) continue;

      const isEdge = wx === x1 || wx === x2 || wy === y1 || wy === y2;
      const spec = doorSpecs.find((d) => d.x === wx && d.y === wy);
      if (spec) {
        chunk.tiles[ly * CHUNK_SIZE + lx] = 1;
        const doorKey = `${wx},${wy}`;
        const isOpen = openedDoors.has(doorKey);
        const maxHp = spec.state === 'barricaded' ? 90 : 60;
        chunk.doors.push({
          key: doorKey,
          x: wx,
          y: wy,
          buildingId: id,
          state: isOpen ? 'open' : spec.state,
          hp: doorDamage.has(doorKey) ? doorDamage.get(doorKey) : maxHp,
          maxHp
        });
      } else if (isEdge) {
        chunk.tiles[ly * CHUNK_SIZE + lx] = 2;
      } else {
        chunk.tiles[ly * CHUNK_SIZE + lx] = 1;
      }
    }
  }
}

function generateChunk(cx, cy) {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  const chunk = {
    cx,
    cy,
    tiles,
    buildings: [],
    doors: [],
    loot: [],
    zombies: []
  };

  const baseX = cx * CHUNK_SIZE;
  const baseY = cy * CHUNK_SIZE;

  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    const wy = baseY + ly;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = baseX + lx;
      const d = Math.max(Math.abs(wx - CENTER), Math.abs(wy - CENTER));

      if (d >= 504) {
        tiles[ly * CHUNK_SIZE + lx] = 2;
        continue;
      }

      if (d === 64) {
        const isGate =
          (Math.abs(wx - CENTER) <= 2 && (wy === 448 || wy === 576)) ||
          (Math.abs(wy - CENTER) <= 2 && (wx === 448 || wx === 576));
        tiles[ly * CHUNK_SIZE + lx] = isGate ? 3 : 2;
        continue;
      }

      if (d < 64) {
        tiles[ly * CHUNK_SIZE + lx] = 1;
        continue;
      }

      const onRingRoad = d >= 240 && d <= 245;
      const onCardinalRoad =
        (wx >= CENTER - 2 && wx <= CENTER + 2) || (wy >= CENTER - 2 && wy <= CENTER + 2);
      if (onRingRoad || onCardinalRoad) {
        tiles[ly * CHUNK_SIZE + lx] = 3;
        continue;
      }

      tiles[ly * CHUNK_SIZE + lx] = 0;
    }
  }

  if (cx >= 14 && cx <= 17 && cy >= 14 && cy <= 17) {
    stampBuilding(
      chunk,
      'quarry-garage',
      'Convoy Garage',
      496,
      496,
      506,
      505,
      [
        { x: 501, y: 505, state: 'unlocked' },
        { x: 506, y: 500, state: 'unlocked' }
      ],
      true
    );

    stampBuilding(
      chunk,
      'quarry-depot',
      'Quarry Depot',
      518,
      496,
      528,
      505,
      [{ x: 518, y: 500, state: 'unlocked' }],
      true
    );

    if (cx === 15 && cy === 15) {
      addChunkLoot(chunk, 'q-crowbar', 508.5, 508.5, {
        name: 'Crowbar',
        type: 'weapon',
        weaponId: 'crowbar',
        color: '#38bdf8'
      });
      addChunkLoot(chunk, 'q-beans', 509.5, 507.5, {
        name: 'Canned Beans',
        type: 'food',
        hunger: 35,
        hp: 5,
        color: '#f97316'
      });
      addChunkLoot(chunk, 'q-pick', 507.5, 509.5, {
        name: 'Lockpick Set',
        type: 'tool',
        toolId: 'lockpick',
        color: '#fbbf24'
      });
    }
    if (cx === 16 && cy === 15) {
      addChunkLoot(chunk, 'q-med', 522.5, 500.5, {
        name: 'First Aid Kit',
        type: 'med',
        hunger: 0,
        hp: 65,
        color: '#f8fafc'
      });
    }
    return chunk;
  }

  const midX = baseX + 16;
  const midY = baseY + 16;
  const zone = getZoneInfo(midX, midY);
  if (zone.ring === 4) return chunk;

  const seed = hash2d(cx, cy);
  const avoidsRoads =
    Math.abs(midX - CENTER) > 22 &&
    Math.abs(midY - CENTER) > 22 &&
    Math.abs(Math.max(Math.abs(midX - CENTER), Math.abs(midY - CENTER)) - 242) > 20;

  if (avoidsRoads && seed > 0.32) {
    const bw = 8 + Math.floor(hash2d(cx + 11, cy) * 6);
    const bh = 8 + Math.floor(hash2d(cx, cy + 17) * 6);
    const bx1 = baseX + 4 + Math.floor(hash2d(cx + 3, cy + 5) * (24 - bw));
    const by1 = baseY + 4 + Math.floor(hash2d(cx + 7, cy + 9) * (24 - bh));
    const bx2 = bx1 + bw;
    const by2 = by1 + bh;

    const doorRoll = hash2d(cx + 21, cy + 29);
    const doorState =
      zone.ring === 1
        ? doorRoll > 0.55
          ? 'locked'
          : 'unlocked'
        : zone.ring === 2
        ? doorRoll > 0.5
          ? 'barricaded'
          : 'locked'
        : 'barricaded';

    const bNames =
      zone.ring === 1
        ? ['Suburban House', 'Oakridge Home', 'Corner Store', 'Cul-de-Sac House']
        : zone.ring === 2
        ? ['Mega-Mart', 'Midtown Precinct', 'Hwy 9 Gas Station', 'Auto Garage']
        : ['St. Jude Wing', 'Quarantine Bunker', 'SWAT Armory', 'Military Outpost'];

    const bName = bNames[Math.floor(hash2d(cx * 3, cy * 7) * bNames.length)];
    const bId = `b-${cx}-${cy}`;

    stampBuilding(chunk, bId, bName, bx1, by1, bx2, by2, [
      { x: Math.floor((bx1 + bx2) / 2), y: by2, state: doorState }
    ]);

    const lx = Math.floor((bx1 + bx2) / 2) + 0.5;
    const ly = Math.floor((by1 + by2) / 2) + 0.5;
    const crateRoll = hash2d(cx + 51, cy + 59);

    // ~35% chance to spawn a high-value Heavy Supply Crate (+4 Convoy pts, slows carrier)
    const supplyItem =
      crateRoll > 0.65
        ? { name: 'Heavy Supply Crate', type: 'heavy', value: 4, color: '#fb923c' }
        : zone.ring === 1
        ? { name: 'Scrap Plating', type: 'convoy', value: 1, color: '#22d3ee' }
        : zone.ring === 2
        ? { name: 'Tanker Fuel Drum', type: 'convoy', value: 2, color: '#f59e0b' }
        : { name: 'Military Convoy Armor', type: 'convoy', value: 3, color: '#a855f7' };

    addChunkLoot(chunk, `loot-main-${cx}-${cy}`, lx, ly, supplyItem);

    const secRoll = hash2d(cx + 41, cy + 43);
    let secItem;
    if (secRoll < 0.25) {
      secItem =
        zone.ring >= 2
          ? { name: '9mm Pistol', type: 'weapon', weaponId: 'pistol', color: '#94a3b8' }
          : { name: 'Fire Axe', type: 'weapon', weaponId: 'axe', color: '#f43f5e' };
    } else if (secRoll < 0.5) {
      secItem = { name: 'Lockpick Set', type: 'tool', toolId: 'lockpick', color: '#fbbf24' };
    } else if (secRoll < 0.78) {
      secItem = { name: 'MRE Pack', type: 'food', hunger: 55, hp: 10, color: '#eab308' };
    } else {
      secItem = { name: 'Bandage', type: 'med', hunger: 0, hp: 40, color: '#f8fafc' };
    }
    addChunkLoot(chunk, `loot-sec-${cx}-${cy}`, bx1 + 2.5, by1 + 2.5, secItem);

    addChunkZombie(chunk, `z-in-${cx}-${cy}`, bx2 - 2.5, by1 + 2.5, zone.ring);
  }

  const outdoorCount = zone.ring === 1 ? 2 : zone.ring === 2 ? 3 : 4;
  for (let i = 0; i < outdoorCount; i++) {
    const zx = baseX + 3 + Math.floor(hash2d(cx + i * 13, cy + 5) * 26) + 0.5;
    const zy = baseY + 3 + Math.floor(hash2d(cx + 7, cy + i * 19) * 26) + 0.5;
    const tx = zx - baseX;
    const ty = zy - baseY;
    if (tiles[Math.floor(ty) * CHUNK_SIZE + Math.floor(tx)] !== 2) {
      addChunkZombie(chunk, `z-out-${cx}-${cy}-${i}`, zx, zy, zone.ring);
    }
  }

  return chunk;
}

function addChunkLoot(chunk, id, x, y, props) {
  if (lootedIds.has(id)) return;
  chunk.loot.push({ id, x, y, ...props });
}

function addChunkZombie(chunk, id, x, y, ring) {
  if (killedZombieIds.has(id)) return;
  const tier =
    ring === 1
      ? { kind: 'walker', hp: 95, speed: 1.85, dmg: 11, color: '#4d7c0f', scale: 1 }
      : ring === 2
      ? { kind: 'sprinter', hp: 120, speed: 2.55, dmg: 15, color: '#ca8a04', scale: 1.05 }
      : { kind: 'brute', hp: 210, speed: 1.75, dmg: 22, color: '#991b1b', scale: 1.25 };

  const ang = hash2d(Math.floor(x * 7), Math.floor(y * 11)) * Math.PI * 2;
  chunk.zombies.push({
    id,
    x,
    y,
    hp: tier.hp,
    maxHp: tier.hp,
    speed: tier.speed,
    dmg: tier.dmg,
    color: tier.color,
    scale: tier.scale,
    kind: tier.kind,
    attackCd: 0,
    hitFlash: 0,
    lungeTimer: 0,
    facing: ang,
    walkPhase: ang,
    wanderAng: ang,
    turnTimer: 1.2,
    aggro: false
  });
}

export function getChunk(cx, cy) {
  if (cx < 0 || cy < 0 || cx >= WORLD_CHUNKS || cy >= WORLD_CHUNKS) return null;
  const key = `${cx},${cy}`;
  if (!chunkCache.has(key)) {
    if (chunkCache.size > 64) {
      const oldest = chunkCache.keys().next().value;
      chunkCache.delete(oldest);
    }
    chunkCache.set(key, generateChunk(cx, cy));
  }
  return chunkCache.get(key);
}

export function getTileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_SIZE || ty >= MAP_SIZE) return 2;
  const cx = Math.floor(tx / CHUNK_SIZE);
  const cy = Math.floor(ty / CHUNK_SIZE);
  const chunk = getChunk(cx, cy);
  if (!chunk) return 2;
  const lx = tx - cx * CHUNK_SIZE;
  const ly = ty - cy * CHUNK_SIZE;
  return chunk.tiles[ly * CHUNK_SIZE + lx];
}

export function getActiveChunks(wx, wy, radiusChunks = 1) {
  const pcx = Math.floor(wx / CHUNK_SIZE);
  const pcy = Math.floor(wy / CHUNK_SIZE);
  const list = [];
  for (let dy = -radiusChunks; dy <= radiusChunks; dy++) {
    for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
      const c = getChunk(pcx + dx, pcy + dy);
      if (c) list.push(c);
    }
  }
  return list;
}
