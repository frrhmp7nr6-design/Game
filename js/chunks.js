import { atlasState, applyAtlasToChunk } from './atlas.js';

export const CHUNK_SIZE = 32;
export const WORLD_CHUNKS = 32;
export const MAP_SIZE = CHUNK_SIZE * WORLD_CHUNKS; // 1024
export const CENTER = 512;

export const QUARRY_X = 520;
export const QUARRY_Y = 610;

const chunkCache = new Map();

export function clearChunkCache() {
  chunkCache.clear();
}

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

export function isCreekTile(wx, wy) {
  const creekCenter =
    655 +
    Math.sin(wy * 0.018) * 32 +
    Math.cos(wy * 0.045) * 14;
  return Math.abs(wx - creekCenter) <= 3.2;
}

export function classifyRoad(wx, wy) {
  const i20Y = 115 + Math.sin(wx * 0.005) * 8;
  const dyI20 = wy - i20Y;
  if (Math.abs(dyI20) <= 3.6) {
    if (Math.abs(dyI20) <= 0.55) return { tile: 2, kind: 'median' };
    return { tile: 3, kind: 'freeway' };
  }

  if (wy >= 115 && wy <= 252) {
    const t = (wy - 115) / 137;
    const westRampX = 530 + t * 44;
    const eastRampX = 622 - t * 44;
    if (Math.abs(wx - westRampX) <= 1.4 || Math.abs(wx - eastRampX) <= 1.4) {
      return { tile: 3, kind: 'ramp' };
    }
  }

  const us278Y = 252 + Math.sin(wx * 0.007) * 10;
  if (Math.abs(wy - us278Y) <= 2.3) {
    return { tile: 3, kind: 'highway' };
  }

  if (wy >= 250 && wy <= 542) {
    const dxBlvd = wx - 576;
    if (Math.abs(dxBlvd) <= 2.6) {
      if (Math.abs(dxBlvd) <= 0.5) return { tile: 0, kind: 'median' };
      return { tile: 3, kind: 'boulevard' };
    }
  }

  const marbleX = 520 + (wy < 555 ? (555 - wy) * 0.14 : 0);
  if (wy >= 252 && wy <= 625 && Math.abs(wx - marbleX) <= 1.8) {
    return { tile: 3, kind: 'avenue' };
  }

  const inDowntown = wx >= 360 && wx <= 630 && wy >= 290 && wy <= 540;
  const inSuburb = wx >= 220 && wx <= 360 && wy >= 340 && wy <= 500;

  if (inDowntown) {
    for (const ay of [310, 358, 406, 454, 502]) {
      if (Math.abs(wy - ay) <= 1.7) return { tile: 3, kind: 'avenue' };
    }
    for (const sx of [384, 448, 512, 624]) {
      if (Math.abs(wx - sx) <= 1.4) return { tile: 3, kind: 'street' };
    }
  }

  if (inSuburb) {
    if (Math.abs(wy - 360) <= 1.4 || Math.abs(wy - 480) <= 1.4) return { tile: 3, kind: 'street' };
    if (Math.abs(wx - 240) <= 1.4 || Math.abs(wx - 320) <= 1.4) return { tile: 3, kind: 'street' };
  }

  if (wx < 515 && wy > 460) {
    const morganY = 485 + (515 - wx) * 0.42 + Math.sin(wx * 0.022) * 18;
    if (Math.abs(wy - morganY) <= 1.4) return { tile: 3, kind: 'rural' };
  }
  if (wy > 605) {
    const hutchinsX = 520 + (wy - 605) * 0.28 + Math.sin(wy * 0.02) * 20;
    if (Math.abs(wx - hutchinsX) <= 1.4) return { tile: 3, kind: 'rural' };
  }

  if (wy > 650 && wx < 500) {
    const dirtY = 740 + Math.sin(wx * 0.03) * 28;
    if (Math.abs(wy - dirtY) <= 1.1) return { tile: 5, kind: 'dirt' };
  }
  if (wx > 690 && wy > 320) {
    const dirtX = 780 + Math.cos(wy * 0.025) * 32;
    if (Math.abs(wx - dirtX) <= 1.1) return { tile: 5, kind: 'dirt' };
  }

  if (inDowntown) {
    for (const ay of [310, 358, 406, 454, 502]) {
      if (Math.abs(wy - ay) <= 2.6) return { tile: 1, kind: 'sidewalk' };
    }
    for (const sx of [384, 448, 512, 624]) {
      if (Math.abs(wx - sx) <= 2.3) return { tile: 1, kind: 'sidewalk' };
    }
    if (Math.abs(wx - 576) <= 3.5) return { tile: 1, kind: 'sidewalk' };
  }
  if (inSuburb) {
    if (Math.abs(wy - 360) <= 2.3 || Math.abs(wy - 480) <= 2.3) return { tile: 1, kind: 'sidewalk' };
    if (Math.abs(wx - 240) <= 2.3 || Math.abs(wx - 320) <= 2.3) return { tile: 1, kind: 'sidewalk' };
  }

  return { tile: 0, kind: 'none' };
}

export function getRoadType(wx, wy) {
  return classifyRoad(wx, wy).tile;
}

export function isRoadTile(wx, wy) {
  return classifyRoad(wx, wy).tile === 3;
}

export function getZoneInfo(wx, wy) {
  if (wx < 10 || wy < 10 || wx >= MAP_SIZE - 10 || wy >= MAP_SIZE - 10) {
    return { ring: 4, name: 'Quarantine Wall', color: '#94a3b8' };
  }
  if (isInsideQuarryHub(wx, wy)) {
    return { ring: 0, name: 'Rockmart Quarry Hub', color: '#4ade80' };
  }
  if (wx >= 360 && wx <= 630 && wy >= 290 && wy <= 540) {
    return { ring: 1, name: 'Downtown Rockmart', color: '#38bdf8' };
  }
  if (wx >= 210 && wx <= 365 && wy >= 330 && wy <= 510) {
    return { ring: 1, name: 'Oakridge Suburbs', color: '#38bdf8' };
  }

  const distFromQuarry = Math.hypot(wx - QUARRY_X, wy - QUARRY_Y);
  const warp = Math.sin(wx * 0.015) * 28 + Math.cos(wy * 0.015) * 28;
  const effDist = distFromQuarry + warp;

  if (effDist <= 385) {
    return { ring: 2, name: 'Rural Valley & US-278', color: '#f59e0b' };
  }
  return { ring: 3, name: 'Outer Pine Quarantine', color: '#ef4444' };
}

const HOUSE_PALETTES = [
  { name: 'Clapboard White', wallL: '#cbd5e1', wallR: '#94a3b8', roofL: '#475569', roofR: '#334155', trim: '#f8fafc' },
  { name: 'Georgia Red Brick', wallL: '#991b1b', wallR: '#7f1d1d', roofL: '#3f3f46', roofR: '#27272a', trim: '#fef3c7' },
  { name: 'Sage Craftsman', wallL: '#4d7c0f', wallR: '#3f6212', roofL: '#5c2d16', roofR: '#422006', trim: '#ecfccb' },
  { name: 'Colonial Blue', wallL: '#1d4ed8', wallR: '#1e40af', roofL: '#334155', roofR: '#1e293b', trim: '#dbeafe' },
  { name: 'Warm Sand Ranch', wallL: '#b45309', wallR: '#92400e', roofL: '#44403c', roofR: '#292524', trim: '#fef3c7' },
  { name: 'Weathered Cabin', wallL: '#78350f', wallR: '#5c280b', roofL: '#166534', roofR: '#14532d', trim: '#fed7aa' }
];

const COMMERCIAL_PALETTES = [
  { name: 'Downtown Brick', wallL: '#7f1d1d', wallR: '#651515', roofL: '#334155', roofR: '#1e293b', awning: '#dc2626' },
  { name: 'Cinderblock Slate', wallL: '#475569', wallR: '#334155', roofL: '#1e293b', roofR: '#0f172a', awning: '#0284c7' },
  { name: 'Stucco Cream', wallL: '#a16207', wallR: '#854d0e', roofL: '#3f3f46', roofR: '#27272a', awning: '#16a34a' },
  { name: 'Steel Warehouse', wallL: '#374151', wallR: '#1f2937', roofL: '#4b5563', roofR: '#374151', awning: '#d97706' },
  { name: 'Midtown Stone', wallL: '#57534e', wallR: '#44403c', roofL: '#292524', roofR: '#1c1917', awning: '#7c3aed' }
];

export function stampCompoundBuilding(chunk, config) {
  const {
    id,
    name,
    category,
    rects,
    doorSpecs,
    seed,
    defaultRevealed = false,
    porchRect = null
  } = config;

  const cellSet = new Set();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const r of rects) {
    for (let y = r.y1; y <= r.y2; y++) {
      for (let x = r.x1; x <= r.x2; x++) {
        cellSet.add(`${x},${y}`);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const palette =
    category === 'commercial'
      ? COMMERCIAL_PALETTES[Math.floor(seed * 97) % COMMERCIAL_PALETTES.length]
      : HOUSE_PALETTES[Math.floor(seed * 131) % HOUSE_PALETTES.length];

  const roofStyle =
    category === 'commercial'
      ? 'parapet'
      : seed > 0.45
      ? 'gable'
      : 'hip';

  const wallTiles = [];

  for (const key of cellSet) {
    const [wx, wy] = key.split(',').map(Number);
    const hasN = cellSet.has(`${wx},${wy - 1}`);
    const hasS = cellSet.has(`${wx},${wy + 1}`);
    const hasW = cellSet.has(`${wx - 1},${wy}`);
    const hasE = cellSet.has(`${wx + 1},${wy}`);

    const isPerimeter = !hasN || !hasS || !hasW || !hasE;
    const doorSpec = doorSpecs.find((d) => d.x === wx && d.y === wy);

    const lx = wx - chunk.cx * CHUNK_SIZE;
    const ly = wy - chunk.cy * CHUNK_SIZE;
    const inChunk = lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE;

    if (doorSpec) {
      if (inChunk) {
        chunk.tiles[ly * CHUNK_SIZE + lx] = 1;
        const doorKey = `${wx},${wy}`;
        const isOpen = openedDoors.has(doorKey);
        const maxHp = doorSpec.state === 'barricaded' ? 90 : 60;
        chunk.doors.push({
          key: doorKey,
          x: wx,
          y: wy,
          buildingId: id,
          state: isOpen ? 'open' : doorSpec.state,
          hp: doorDamage.has(doorKey) ? doorDamage.get(doorKey) : maxHp,
          maxHp
        });

        const stepDir = doorSpec.dir || { dx: 0, dy: 1 };
        for (let step = 1; step <= 4; step++) {
          const sx = lx + stepDir.dx * step;
          const sy = ly + stepDir.dy * step;
          if (sx >= 0 && sx < CHUNK_SIZE && sy >= 0 && sy < CHUNK_SIZE) {
            if (chunk.tiles[sy * CHUNK_SIZE + sx] === 0) {
              chunk.tiles[sy * CHUNK_SIZE + sx] = category === 'rural' ? 5 : 1;
            }
          }
        }
      }
    } else if (isPerimeter) {
      if (inChunk) chunk.tiles[ly * CHUNK_SIZE + lx] = 2;
      const isCorner = (!hasN && !hasW) || (!hasN && !hasE) || (!hasS && !hasW) || (!hasS && !hasE);
      const hasWindow =
        !isCorner &&
        ((!hasS && (wx + wy) % 2 === 0) || (!hasE && (wx + wy) % 2 === 1));
      const isBoarded = hasWindow && doorSpecs[0]?.state === 'barricaded';
      wallTiles.push({
        x: wx,
        y: wy,
        faceSouth: !hasS,
        faceEast: !hasE,
        hasWindow,
        isBoarded
      });
    } else {
      if (inChunk) chunk.tiles[ly * CHUNK_SIZE + lx] = 1;
    }
  }

  if (porchRect) {
    for (let py = porchRect.y1; py <= porchRect.y2; py++) {
      for (let px = porchRect.x1; px <= porchRect.x2; px++) {
        const lx = px - chunk.cx * CHUNK_SIZE;
        const ly = py - chunk.cy * CHUNK_SIZE;
        if (lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE) {
          if (chunk.tiles[ly * CHUNK_SIZE + lx] === 0) {
            chunk.tiles[ly * CHUNK_SIZE + lx] = 1;
          }
        }
      }
    }
  }

  const props = [];
  const mainR = rects[0];
  if (mainR && mainR.x2 - mainR.x1 >= 6 && mainR.y2 - mainR.y1 >= 6) {
    if (category === 'commercial') {
      props.push({ x: mainR.x1 + 2, y: mainR.y1 + 1, w: 3, d: 1, kind: 'counter' });
      props.push({ x: mainR.x1 + 2, y: mainR.y1 + 4, w: 3, d: 1, kind: 'shelf' });
      if (mainR.x2 - mainR.x1 >= 9) {
        props.push({ x: mainR.x2 - 4, y: mainR.y1 + 4, w: 3, d: 1, kind: 'shelf' });
      }
    } else {
      props.push({ x: mainR.x1 + 1, y: mainR.y1 + 1, w: 2, d: 2, kind: 'bed' });
      props.push({ x: mainR.x2 - 3, y: mainR.y1 + 1, w: 3, d: 1, kind: 'counter' });
      props.push({ x: mainR.x1 + 2, y: mainR.y2 - 3, w: 2, d: 1, kind: 'table' });
    }
  }

  chunk.buildings.push({
    id,
    name,
    category,
    rects,
    x1: minX,
    y1: minY,
    x2: maxX,
    y2: maxY,
    cellSet,
    wallTiles,
    props,
    palette,
    roofStyle,
    porchRect,
    defaultRevealed
  });
}

function buildHouseBlueprint(chunk, id, name, bx, by, bw, bh, doorState, seed, isRural = false) {
  const shapeRoll = Math.floor(seed * 100) % 4;
  const rects = [{ x1: bx, y1: by, x2: bx + bw, y2: by + bh }];

  if (shapeRoll === 1 && bw >= 7) {
    rects.push({
      x1: bx + bw - 3,
      y1: by + bh,
      x2: bx + bw + 2,
      y2: by + bh + 3
    });
  } else if (shapeRoll === 2 && bh >= 7) {
    rects.push({
      x1: bx - 3,
      y1: by + 1,
      x2: bx,
      y2: by + bh - 2
    });
  } else if (shapeRoll === 3 && bw >= 8) {
    rects.push({
      x1: bx + 2,
      y1: by - 2,
      x2: bx + bw - 2,
      y2: by
    });
  }

  const doorX = bx + Math.floor(bw / 2);
  const doorY = by + bh;
  const porchRect =
    shapeRoll !== 1
      ? { x1: doorX - 2, y1: doorY + 1, x2: doorX + 2, y2: doorY + 2 }
      : null;

  stampCompoundBuilding(chunk, {
    id,
    name,
    category: isRural ? 'rural' : 'house',
    rects,
    doorSpecs: [{ x: doorX, y: doorY, state: doorState, dir: { dx: 0, dy: 1 } }],
    seed,
    porchRect
  });

  return {
    lootX: bx + Math.floor(bw / 2) + 0.5,
    lootY: by + Math.floor(bh / 2) + 0.5,
    zX: bx + 2.5,
    zY: by + 2.5
  };
}

function buildCommercialBlueprint(chunk, id, name, bx, by, bw, bh, doorState, seed) {
  const shapeRoll = Math.floor(seed * 100) % 3;
  const rects = [{ x1: bx, y1: by, x2: bx + bw, y2: by + bh }];

  if (shapeRoll === 1 && bw >= 9) {
    rects.push({
      x1: bx + bw - 4,
      y1: by + bh,
      x2: bx + bw,
      y2: by + bh + 4
    });
  } else if (shapeRoll === 2 && bw >= 10) {
    rects.push({
      x1: bx + 1,
      y1: by - 3,
      x2: bx + bw - 1,
      y2: by
    });
  }

  const doorX = bx + Math.floor(bw / 2);
  const doorY = by + bh;

  stampCompoundBuilding(chunk, {
    id,
    name,
    category: 'commercial',
    rects,
    doorSpecs: [{ x: doorX, y: doorY, state: doorState, dir: { dx: 0, dy: 1 } }],
    seed
  });

  return {
    lootX: bx + Math.floor(bw / 2) + 0.5,
    lootY: by + Math.floor(bh / 2) + 0.5,
    zX: bx + 2.5,
    zY: by + 2.5
  };
}

function generateChunk(cx, cy) {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  const roadKinds = new Array(CHUNK_SIZE * CHUNK_SIZE).fill('none');
  const chunk = {
    cx,
    cy,
    tiles,
    roadKinds,
    buildings: [],
    doors: [],
    loot: [],
    zombies: []
  };

  const baseX = cx * CHUNK_SIZE;
  const baseY = cy * CHUNK_SIZE;

  const usedOsmAtlas = atlasState.loaded
    ? applyAtlasToChunk(chunk, baseX, baseY, CHUNK_SIZE, stampCompoundBuilding)
    : false;

  if (!usedOsmAtlas) {
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      const wy = baseY + ly;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const idx = ly * CHUNK_SIZE + lx;

        if (wx < 10 || wy < 10 || wx >= MAP_SIZE - 10 || wy >= MAP_SIZE - 10) {
          tiles[idx] = 2;
          continue;
        }

        const roadInfo = classifyRoad(wx, wy);
        if (roadInfo.kind !== 'none') {
          tiles[idx] = roadInfo.tile;
          roadKinds[idx] = roadInfo.kind;
          continue;
        }

        if (isQuarryPerimeter(wx, wy)) {
          tiles[idx] = 2;
          continue;
        }

        if (isInsideQuarryHub(wx, wy)) {
          tiles[idx] = 1;
          continue;
        }

        if (isCreekTile(wx, wy)) {
          tiles[idx] = 4;
          continue;
        }

        tiles[idx] = 0;
      }
    }
  } else {
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      const wy = baseY + ly;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const idx = ly * CHUNK_SIZE + lx;
        if (isQuarryPerimeter(wx, wy) && tiles[idx] !== 3) {
          tiles[idx] = 2;
        } else if (isInsideQuarryHub(wx, wy) && tiles[idx] !== 3) {
          tiles[idx] = 1;
        }
      }
    }

    const midX = baseX + 16;
    const midY = baseY + 16;
    const zone = getZoneInfo(midX, midY);
    chunk.buildings.forEach((b, idx) => {
      const lx = Math.floor((b.x1 + b.x2) / 2) + 0.5;
      const ly = Math.floor((b.y1 + b.y2) / 2) + 0.5;
      const crateRoll = hash2d(cx + idx * 19, cy + 59);
      const supplyItem =
        zone.ring === 3
          ? { name: 'Prototype Convoy Core', type: 'heavy', value: 6, color: '#e879f9' }
          : crateRoll > 0.72
          ? { name: 'Heavy Supply Crate', type: 'heavy', value: 4, color: '#fb923c' }
          : { name: 'Scrap Plating', type: 'convoy', value: 1, color: '#22d3ee' };
      addChunkLoot(chunk, `osm-loot-${cx}-${cy}-${idx}`, lx, ly, supplyItem);
      if (zone.ring > 0) {
        addChunkZombie(chunk, `osm-z-${cx}-${cy}-${idx}`, b.x1 + 2.5, b.y1 + 2.5, zone.ring, false);
      }
    });
  }

  // 1. Rockmart Slate Quarry Safe Hub Landmarks
  if (cx >= 14 && cx <= 18 && cy >= 17 && cy <= 20) {
    stampCompoundBuilding(chunk, {
      id: 'quarry-garage',
      name: 'Convoy Garage',
      category: 'commercial',
      rects: [{ x1: 504, y1: 594, x2: 514, y2: 603 }],
      doorSpecs: [
        { x: 509, y: 603, state: 'unlocked', dir: { dx: 0, dy: 1 } },
        { x: 514, y: 598, state: 'unlocked', dir: { dx: 1, dy: 0 } }
      ],
      seed: 0.42,
      defaultRevealed: true
    });

    stampCompoundBuilding(chunk, {
      id: 'quarry-depot',
      name: 'Quarry Depot',
      category: 'commercial',
      rects: [{ x1: 526, y1: 594, x2: 536, y2: 603 }],
      doorSpecs: [{ x: 526, y: 598, state: 'unlocked', dir: { dx: -1, dy: 0 } }],
      seed: 0.77,
      defaultRevealed: true
    });

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

  // 2. Rockmart Police Precinct (always guaranteed so Police Radios can be looted)
  if (cx === 17 && cy === 14) {
    stampCompoundBuilding(chunk, {
      id: 'rockmart-pd',
      name: 'Rockmart Police Precinct',
      category: 'commercial',
      rects: [
        { x1: 560, y1: 460, x2: 572, y2: 472 },
        { x1: 568, y1: 472, x2: 572, y2: 476 }
      ],
      doorSpecs: [
        { x: 565, y: 472, state: 'locked', dir: { dx: 0, dy: 1 } },
        { x: 560, y: 466, state: 'barricaded', dir: { dx: -1, dy: 0 } }
      ],
      seed: 0.22
    });

    addChunkLoot(chunk, 'pd-radio-1', 564.5, 463.5, {
      name: 'Police Radio',
      type: 'radio',
      charges: 3,
      color: '#38bdf8'
    });
    addChunkLoot(chunk, 'pd-radio-2', 569.5, 463.5, {
      name: 'Police Radio',
      type: 'radio',
      charges: 3,
      color: '#38bdf8'
    });
    addChunkLoot(chunk, 'pd-pistol', 569.5, 468.5, {
      name: '9mm Pistol',
      type: 'weapon',
      weaponId: 'pistol',
      color: '#94a3b8'
    });

    addChunkZombie(chunk, 'z-pd-1', 563.5, 468.5, 2, false);
    addChunkZombie(chunk, 'z-pd-2', 569.5, 465.5, 2, false);
    return chunk;
  }

  if (usedOsmAtlas) {
    const midX = baseX + 16;
    const midY = baseY + 16;
    const zone = getZoneInfo(midX, midY);
    if (zone.ring > 0 && zone.ring < 4) {
      for (let i = 0; i < 2; i++) {
        const zx = baseX + 4 + Math.floor(hash2d(cx + i * 13, cy + 5) * 24) + 0.5;
        const zy = baseY + 4 + Math.floor(hash2d(cx + 7, cy + i * 19) * 24) + 0.5;
        const tx = Math.floor(zx - baseX);
        const ty = Math.floor(zy - baseY);
        if (tiles[ty * CHUNK_SIZE + tx] !== 2 && !isInsideQuarryHub(zx, zy)) {
          addChunkZombie(chunk, `z-osm-out-${cx}-${cy}-${i}`, zx, zy, zone.ring, false);
        }
      }
    }
    return chunk;
  }

  // Fallback procedural buildings when OSM atlas isn't active
  const midX = baseX + 16;
  const midY = baseY + 16;
  const zone = getZoneInfo(midX, midY);
  if (zone.ring === 0 || zone.ring === 4) return chunk;

  const isDowntownBlock = midX >= 360 && midX <= 630 && midY >= 290 && midY <= 540;
  const isSuburbBlock = midX >= 210 && midX <= 365 && midY >= 330 && midY <= 510;
  const isRuralArea = !isDowntownBlock && !isSuburbBlock;

  const seed = hash2d(cx, cy);
  const spawnThreshold = isDowntownBlock ? 0.15 : isSuburbBlock ? 0.2 : 0.78;

  if (seed > spawnThreshold) {
    let targetRoadY = null;
    for (let y = baseY + 4; y <= baseY + 28; y++) {
      if (getRoadType(baseX + 16, y) === 3) {
        targetRoadY = y;
        break;
      }
    }

    const lots = [];
    if (targetRoadY !== null && !isRuralArea) {
      const by = targetRoadY - 11;
      if (by >= baseY + 2) {
        lots.push({ bx: baseX + 4, by, bw: 9, bh: 8, s: hash2d(cx * 5, cy * 3) });
        if (hash2d(cx + 9, cy + 2) > 0.35) {
          lots.push({ bx: baseX + 17, by, bw: 9, bh: 8, s: hash2d(cx * 11, cy * 7) });
        }
      }
    } else if (isRuralArea) {
      const bx = baseX + 8 + Math.floor(hash2d(cx + 3, cy) * 8);
      const by = baseY + 8 + Math.floor(hash2d(cx, cy + 5) * 8);
      let ok = true;
      for (let yy = by - 4; yy <= by + 13; yy += 2) {
        for (let xx = bx - 4; xx <= bx + 13; xx += 2) {
          if (isCreekTile(xx, yy) || isInsideQuarryHub(xx, yy) || getRoadType(xx, yy) !== 0) {
            ok = false;
          }
        }
      }
      if (ok) {
        lots.push({ bx, by, bw: 9, bh: 8, s: hash2d(cx * 17, cy * 19), rural: true });
      }
    }

    lots.forEach((lot, idx) => {
      for (let xx = lot.bx - 1; xx <= lot.bx + lot.bw + 1; xx++) {
        if (getRoadType(xx, lot.by + 2) === 3) return;
      }

      const isCommercial = isDowntownBlock && lot.s > 0.45 && !lot.rural;
      const doorRoll = hash2d(cx + idx * 17, cy + 29);
      const doorState =
        zone.ring === 1
          ? doorRoll > 0.62
            ? 'locked'
            : 'unlocked'
          : zone.ring === 2
          ? doorRoll > 0.52
            ? 'barricaded'
            : 'locked'
          : 'barricaded';

      const commNames = [
        'Corner Market',
        'Piedmont Pharmacy',
        'Elm St Cafe',
        'Auto Parts Shop',
        'Rockmart Laundromat',
        'Feed & Seed Store'
      ];
      const houseNames = [
        'Craftsman Home',
        'Brick Ranch',
        'Oakridge Bungalow',
        'Family Residence',
        'Porch Cottage',
        'Split-Level House'
      ];
      const ruralNames = [
        'Valley Farmhouse',
        'Timber Barn',
        'Pine Woods Cabin',
        'Creekside Homestead'
      ];

      const namePool = lot.rural
        ? ruralNames
        : isCommercial
        ? commNames
        : houseNames;
      const bName = namePool[Math.floor(hash2d(cx * 3 + idx, cy * 7) * namePool.length)];
      const bId = `b-${cx}-${cy}-${idx}`;

      const spot = isCommercial
        ? buildCommercialBlueprint(chunk, bId, bName, lot.bx, lot.by, lot.bw, lot.bh, doorState, lot.s)
        : buildHouseBlueprint(chunk, bId, bName, lot.bx, lot.by, lot.bw, lot.bh, doorState, lot.s, lot.rural);

      if (idx === 0) {
        const crateRoll = hash2d(cx + 51, cy + 59);
        const supplyItem =
          zone.ring === 3
            ? { name: 'Prototype Convoy Core', type: 'heavy', value: 6, color: '#e879f9' }
            : crateRoll > 0.68
            ? { name: 'Heavy Supply Crate', type: 'heavy', value: 4, color: '#fb923c' }
            : zone.ring === 1
            ? { name: 'Scrap Plating', type: 'convoy', value: 1, color: '#22d3ee' }
            : { name: 'Tanker Fuel Drum', type: 'convoy', value: 2, color: '#f59e0b' };

        addChunkLoot(chunk, `loot-main-${cx}-${cy}`, spot.lootX, spot.lootY, supplyItem);
      } else {
        const secRoll = hash2d(cx + 41, cy + 43);
        const secItem =
          secRoll < 0.25
            ? { name: 'Lockpick Set', type: 'tool', toolId: 'lockpick', color: '#fbbf24' }
            : secRoll < 0.65
            ? { name: 'MRE Pack', type: 'food', hunger: 55, hp: 10, color: '#eab308' }
            : { name: 'Bandage', type: 'med', hunger: 0, hp: 40, color: '#f8fafc' };
        addChunkLoot(chunk, `loot-sec-${cx}-${cy}-${idx}`, spot.lootX, spot.lootY, secItem);
      }

      addChunkZombie(
        chunk,
        `z-in-${cx}-${cy}-${idx}`,
        spot.zX,
        spot.zY,
        zone.ring,
        zone.ring === 3 && idx === 0
      );
    });
  }

  const outdoorCount = isRuralArea ? 1 : zone.ring === 1 ? 2 : 3;
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

export function getRoadKindAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_SIZE || ty >= MAP_SIZE) return 'none';
  const cx = Math.floor(tx / CHUNK_SIZE);
  const cy = Math.floor(ty / CHUNK_SIZE);
  const chunk = getChunk(cx, cy);
  if (!chunk) return 'none';
  const lx = tx - cx * CHUNK_SIZE;
  const ly = ty - cy * CHUNK_SIZE;
  return chunk.roadKinds[ly * CHUNK_SIZE + lx];
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
