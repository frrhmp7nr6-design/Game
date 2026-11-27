export const CHUNK_SIZE = 32;
export const WORLD_CHUNKS = 32;
export const MAP_SIZE = CHUNK_SIZE * WORLD_CHUNKS; // 1024
export const CENTER = 512;

// Offset Quarry Safe Hub centered around (520, 610) like Rockmart Slate Corp
export const QUARRY_X = 520;
export const QUARRY_Y = 610;

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

// Organic irregular quarry safe-zone mask (asymmetrical limestone pit)
export function isInsideQuarryHub(wx, wy) {
  const dx = (wx - QUARRY_X) / 68;
  const dy = (wy - QUARRY_Y) / 54;
  const angle = Math.atan2(dy, dx);
  const wobble =
    0.12 * Math.sin(angle * 3 + 0.6) +
    0.07 * Math.cos(angle * 5 - 1.1);
  return Math.hypot(dx, dy) <= 1.0 + wobble;
}

function isQuarryPerimeter(wx, wy) {
  if (!isInsideQuarryHub(wx, wy)) return false;
  return (
    !isInsideQuarryHub(wx + 1, wy) ||
    !isInsideQuarryHub(wx - 1, wy) ||
    !isInsideQuarryHub(wx, wy + 1) ||
    !isInsideQuarryHub(wx, wy - 1)
  );
}

// Winding Euharlee Creek running north-south east of town & quarry
export function isCreekTile(wx, wy) {
  const creekCenter =
    635 +
    Math.sin(wy * 0.018) * 34 +
    Math.cos(wy * 0.045) * 14;
  return Math.abs(wx - creekCenter) <= 3.2;
}

// Organic road network resembling Rockmart, GA (US-278, S Marble St, Piedmont Ave, Morgan Valley Rd, Hutchins Mtn Rd)
export function isRoadTile(wx, wy) {
  // 1. US-278 East-West 4-lane highway across north side (y ~ 252)
  const us278Y = 252 + Math.sin(wx * 0.009) * 14;
  if (Math.abs(wy - us278Y) <= 2.6) return true;

  // 2. S Marble St / N Piedmont Ave corridor running north from Quarry (520,610) through Downtown Rockmart to US-278
  const marbleX =
    520 +
    (wy < 555 ? (555 - wy) * 0.16 : 0) +
    Math.sin(wy * 0.025) * 6;
  if (wy >= 245 && wy <= 625 && Math.abs(wx - marbleX) <= 2.0) return true;

  // 3. Downtown Rockmart cross streets (Elm St & College St)
  if (wx >= 445 && wx <= 625) {
    if (Math.abs(wy - (472 + (wx - 520) * 0.12)) <= 1.6) return true;
    if (Math.abs(wy - (425 + (wx - 520) * 0.12)) <= 1.6) return true;
  }

  // 4. N Piedmont Ave east downtown connector
  if (wy >= 250 && wy <= 530 && Math.abs(wx - (598 + Math.sin(wy * 0.02) * 5)) <= 1.8) {
    return true;
  }

  // 5. Morgan Valley Rd winding southwest into rural hills
  if (wx < 515 && wy > 460) {
    const morganY = 485 + (515 - wx) * 0.42 + Math.sin(wx * 0.022) * 18;
    if (Math.abs(wy - morganY) <= 1.8) return true;
  }

  // 6. Hutchins Mountain Rd winding south-southeast from Quarry
  if (wy > 605) {
    const hutchinsX = 520 + (wy - 605) * 0.28 + Math.sin(wy * 0.02) * 20;
    if (Math.abs(wx - hutchinsX) <= 1.8) return true;
  }

  return false;
}

export function getZoneInfo(wx, wy) {
  if (wx < 10 || wy < 10 || wx >= MAP_SIZE - 10 || wy >= MAP_SIZE - 10) {
    return { ring: 4, name: 'Quarantine Wall', color: '#94a3b8' };
  }
  if (isInsideQuarryHub(wx, wy)) {
    return { ring: 0, name: 'Rockmart Quarry Hub', color: '#4ade80' };
  }

  // Organic threat gradient radiating outward from Quarry + downtown
  const distFromQuarry = Math.hypot(wx - QUARRY_X, wy - QUARRY_Y);
  const warp = Math.sin(wx * 0.015) * 28 + Math.cos(wy * 0.015) * 28;
  const effDist = distFromQuarry + warp;

  if (effDist <= 225) {
    return { ring: 1, name: 'Downtown & Elm St', color: '#38bdf8' };
  }
  if (effDist <= 395) {
    return { ring: 2, name: 'US-278 & Valley', color: '#f59e0b' };
  }
  return { ring: 3, name: 'Outer Quarantine', color: '#ef4444' };
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

  // Tile types: 0 = pine grass, 1 = concrete/quarry floor, 2 = wall/fence, 3 = asphalt road, 4 = creek water
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    const wy = baseY + ly;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = baseX + lx;

      // Outer Quarantine Perimeter Wall
      if (wx < 10 || wy < 10 || wx >= MAP_SIZE - 10 || wy >= MAP_SIZE - 10) {
        tiles[ly * CHUNK_SIZE + lx] = 2;
        continue;
      }

      // Roads override creek (bridges) and quarry gates
      if (isRoadTile(wx, wy)) {
        tiles[ly * CHUNK_SIZE + lx] = 3;
        continue;
      }

      // Irregular Quarry Safe Hub perimeter wall (with road gates open)
      if (isQuarryPerimeter(wx, wy)) {
        tiles[ly * CHUNK_SIZE + lx] = 2;
        continue;
      }

      // Quarry interior slate floor
      if (isInsideQuarryHub(wx, wy)) {
        tiles[ly * CHUNK_SIZE + lx] = 1;
        continue;
      }

      // Winding Euharlee Creek (shallow water slows movement)
      if (isCreekTile(wx, wy)) {
        tiles[ly * CHUNK_SIZE + lx] = 4;
        continue;
      }

      tiles[ly * CHUNK_SIZE + lx] = 0;
    }
  }

  // 1. Rockmart Slate Quarry Safe Hub Landmarks (around 520, 610)
  if (cx >= 14 && cx <= 18 && cy >= 17 && cy <= 20) {
    stampBuilding(
      chunk,
      'quarry-garage',
      'Convoy Garage',
      504,
      594,
      514,
      603,
      [
        { x: 509, y: 603, state: 'unlocked' },
        { x: 514, y: 598, state: 'unlocked' }
      ],
      true
    );

    stampBuilding(
      chunk,
      'quarry-depot',
      'Quarry Depot',
      526,
      594,
      536,
      603,
      [{ x: 526, y: 598, state: 'unlocked' }],
      true
    );

    if (cx === 16 && cy === 19) {
      addChunkLoot(chunk, 'q-crowbar', 516.5, 608.5, {
        name: 'Crowbar',
        type: 'weapon',
        weaponId: 'crowbar',
        color: '#38bdf8'
      });
      addChunkLoot(chunk, 'q-beans', 517.5, 607.5, {
        name: 'Canned Beans',
        type: 'food',
        hunger: 35,
        hp: 5,
        color: '#f97316'
      });
      addChunkLoot(chunk, 'q-pick', 515.5, 609.5, {
        name: 'Lockpick Set',
        type: 'tool',
        toolId: 'lockpick',
        color: '#fbbf24'
      });
    }
    if (cx === 16 && cy === 18) {
      addChunkLoot(chunk, 'q-med', 530.5, 598.5, {
        name: 'First Aid Kit',
        type: 'med',
        hunger: 0,
        hp: 65,
        color: '#f8fafc'
      });
    }
  }

  // 2. Rockmart Police Precinct in Downtown Rockmart (Chunk 17, 14 -> around 562..575, 456..467)
  if (cx === 17 && cy === 14) {
    stampBuilding(
      chunk,
      'rockmart-pd',
      'Rockmart Police Precinct',
      562,
      456,
      574,
      467,
      [
        { x: 568, y: 467, state: 'locked' },
        { x: 562, y: 461, state: 'barricaded' }
      ],
      false
    );

    // Police Two-Way Radios inside Precinct Dispatch & Evidence Room!
    addChunkLoot(chunk, 'pd-radio-1', 566.5, 459.5, {
      name: 'Police Radio',
      type: 'radio',
      charges: 3,
      color: '#38bdf8'
    });
    addChunkLoot(chunk, 'pd-radio-2', 570.5, 459.5, {
      name: 'Police Radio',
      type: 'radio',
      charges: 3,
      color: '#38bdf8'
    });
    addChunkLoot(chunk, 'pd-pistol', 571.5, 463.5, {
      name: '9mm Pistol',
      type: 'weapon',
      weaponId: 'pistol',
      color: '#94a3b8'
    });

    // Undead Police Deputies guarding the Precinct
    addChunkZombie(chunk, 'z-pd-1', 565.5, 463.5, 2, false);
    addChunkZombie(chunk, 'z-pd-2', 571.5, 460.5, 2, false);
    return chunk;
  }

  // 3. Landmark Businesses along Downtown Rockmart & US-278
  if (cx === 15 && cy === 14) {
    stampBuilding(chunk, 'hometown-pizza', 'Hometown Pizza', 492, 454, 504, 464, [
      { x: 498, y: 464, state: 'unlocked' }
    ]);
    addChunkLoot(chunk, 'pizza-food', 498.5, 458.5, {
      name: 'MRE Pack',
      type: 'food',
      hunger: 55,
      hp: 10,
      color: '#eab308'
    });
    addChunkLoot(chunk, 'pizza-sup', 495.5, 457.5, {
      name: 'Scrap Plating',
      type: 'convoy',
      value: 1,
      color: '#22d3ee'
    });
    addChunkZombie(chunk, 'z-pizza-1', 501.5, 458.5, 1, false);
    return chunk;
  }

  if (cx === 14 && cy === 8) {
    stampBuilding(chunk, 'low-true-hw', 'Low True Hardware', 456, 264, 470, 276, [
      { x: 463, y: 264, state: 'locked' }
    ]);
    addChunkLoot(chunk, 'hw-axe', 460.5, 270.5, {
      name: 'Fire Axe',
      type: 'weapon',
      weaponId: 'axe',
      color: '#f43f5e'
    });
    addChunkLoot(chunk, 'hw-crate', 466.5, 271.5, {
      name: 'Heavy Supply Crate',
      type: 'heavy',
      value: 4,
      color: '#fb923c'
    });
    addChunkZombie(chunk, 'z-hw-1', 463.5, 272.5, 2, false);
    return chunk;
  }

  if (cx === 25 && cy === 7) {
    stampBuilding(chunk, 'walmart-sc', 'Walmart Supercenter', 804, 224, 822, 240, [
      { x: 813, y: 240, state: 'barricaded' }
    ]);
    addChunkLoot(chunk, 'wm-core', 813.5, 231.5, {
      name: 'Prototype Convoy Core',
      type: 'heavy',
      value: 6,
      color: '#e879f9'
    });
    addChunkZombie(chunk, 'z-wm-boss', 813.5, 228.5, 3, true);
    return chunk;
  }

  // 4. Procedural Buildings & Encounters outside Quarry Hub
  const midX = baseX + 16;
  const midY = baseY + 16;
  const zone = getZoneInfo(midX, midY);
  if (zone.ring === 0 || zone.ring === 4) return chunk;

  // Check if chunk center is clear of roads, quarry, and creek
  let clearForBuilding = true;
  for (let sy = baseY + 4; sy <= baseY + 26; sy += 4) {
    for (let sx = baseX + 4; sx <= baseX + 26; sx += 4) {
      if (isRoadTile(sx, sy) || isInsideQuarryHub(sx, sy) || isCreekTile(sx, sy)) {
        clearForBuilding = false;
        break;
      }
    }
  }

  const seed = hash2d(cx, cy);
  if (clearForBuilding && seed > 0.38) {
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
        ? ['Elm St Bungalow', 'Silver Comet Depot', 'Piedmont House', 'Marble St Shop']
        : zone.ring === 2
        ? ['US-278 Diner', 'Morgan Valley Barn', 'Van Wert Garage', 'County Outpost']
        : ['Quarantine Bunker', 'National Guard Tent', 'Armored Checkpoint', 'Perimeter Armory'];

    const bName = bNames[Math.floor(hash2d(cx * 3, cy * 7) * bNames.length)];
    const bId = `b-${cx}-${cy}`;

    stampBuilding(chunk, bId, bName, bx1, by1, bx2, by2, [
      { x: Math.floor((bx1 + bx2) / 2), y: by2, state: doorState }
    ]);

    const lx = Math.floor((bx1 + bx2) / 2) + 0.5;
    const ly = Math.floor((by1 + by2) / 2) + 0.5;
    const crateRoll = hash2d(cx + 51, cy + 59);

    const supplyItem =
      zone.ring === 3
        ? { name: 'Prototype Convoy Core', type: 'heavy', value: 6, color: '#e879f9' }
        : crateRoll > 0.65
        ? { name: 'Heavy Supply Crate', type: 'heavy', value: 4, color: '#fb923c' }
        : zone.ring === 1
        ? { name: 'Scrap Plating', type: 'convoy', value: 1, color: '#22d3ee' }
        : { name: 'Tanker Fuel Drum', type: 'convoy', value: 2, color: '#f59e0b' };

    addChunkLoot(chunk, `loot-main-${cx}-${cy}`, lx, ly, supplyItem);

    const secRoll = hash2d(cx + 41, cy + 43);
    let secItem;
    if (secRoll < 0.22) {
      secItem =
        zone.ring >= 2
          ? { name: '9mm Pistol', type: 'weapon', weaponId: 'pistol', color: '#94a3b8' }
          : { name: 'Fire Axe', type: 'weapon', weaponId: 'axe', color: '#f43f5e' };
    } else if (secRoll < 0.45) {
      secItem = { name: 'Lockpick Set', type: 'tool', toolId: 'lockpick', color: '#fbbf24' };
    } else if (secRoll < 0.75) {
      secItem = { name: 'MRE Pack', type: 'food', hunger: 55, hp: 10, color: '#eab308' };
    } else {
      secItem = { name: 'Bandage', type: 'med', hunger: 0, hp: 40, color: '#f8fafc' };
    }
    addChunkLoot(chunk, `loot-sec-${cx}-${cy}`, bx1 + 2.5, by1 + 2.5, secItem);

    addChunkZombie(
      chunk,
      `z-in-${cx}-${cy}`,
      bx2 - 2.5,
      by1 + 2.5,
      zone.ring,
      zone.ring === 3
    );
  }

  const outdoorCount = zone.ring === 1 ? 2 : zone.ring === 2 ? 3 : 4;
  for (let i = 0; i < outdoorCount; i++) {
    const zx = baseX + 3 + Math.floor(hash2d(cx + i * 13, cy + 5) * 26) + 0.5;
    const zy = baseY + 3 + Math.floor(hash2d(cx + 7, cy + i * 19) * 26) + 0.5;
    const tx = Math.floor(zx - baseX);
    const ty = Math.floor(zy - baseY);
    if (tiles[ty * CHUNK_SIZE + tx] !== 2 && !isInsideQuarryHub(zx, zy)) {
      addChunkZombie(chunk, `z-out-${cx}-${cy}-${i}`, zx, zy, zone.ring, false);
    }
  }

  return chunk;
}

function addChunkLoot(chunk, id, x, y, props) {
  if (lootedIds.has(id)) return;
  chunk.loot.push({ id, x, y, ...props });
}

function addChunkZombie(chunk, id, x, y, ring, isBoss = false) {
  if (killedZombieIds.has(id)) return;
  const tier = isBoss
    ? { kind: 'juggernaut', hp: 450, speed: 2.0, dmg: 28, color: '#a21caf', scale: 1.55, isBoss: true }
    : ring === 1
    ? { kind: 'walker', hp: 95, speed: 1.85, dmg: 11, color: '#4d7c0f', scale: 1, isBoss: false }
    : ring === 2
    ? { kind: 'sprinter', hp: 120, speed: 2.55, dmg: 15, color: '#ca8a04', scale: 1.05, isBoss: false }
    : { kind: 'brute', hp: 210, speed: 1.75, dmg: 22, color: '#991b1b', scale: 1.25, isBoss: false };

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
    isBoss: tier.isBoss,
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
