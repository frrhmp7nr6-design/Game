export const CHUNK_SIZE = 32;
export const WORLD_CHUNKS = 32;
export const MAP_SIZE = CHUNK_SIZE * WORLD_CHUNKS; // 1024
export const CENTER = 512;

export const QUARRY_X = 520;
export const QUARRY_Y = 610;

const chunkCache = new Map();

export const openedDoors = new Set();
export const doorDamage = new Map();
export const lootedIds = new Set();
export const killedZombieIds = new Set();
export const droppedLoot = [];

// Tile IDs:
// 0 = Pine Grass / Rural Field
// 1 = Concrete / Sidewalk / Interior Floor
// 2 = Wall / Fence
// 3 = Asphalt Road
// 4 = Euharlee Creek Water
// 5 = Rural Dirt / Gravel Lane

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

// Community Town Grid + Rural Highways
export function getRoadType(wx, wy) {
  // 1. US-278 East-West 4-lane highway across north side (y ~ 252)
  const us278Y = 252 + Math.sin(wx * 0.007) * 10;
  if (Math.abs(wy - us278Y) <= 2.6) return 3;

  // 2. S Marble St / N Piedmont Ave north-south spine (x ~ 520..568)
  const marbleX = 520 + (wy < 555 ? (555 - wy) * 0.14 : 0);
  if (wy >= 245 && wy <= 625 && Math.abs(wx - marbleX) <= 2.0) return 3;

  // 3. Rockmart Downtown & Neighborhood Street Grid (x: 360..630, y: 290..540)
  if (wx >= 360 && wx <= 630 && wy >= 290 && wy <= 540) {
    // East-West avenues every 48 tiles: y = 310, 358, 406, 454, 502
    for (const sy of [310, 358, 406, 454, 502]) {
      if (Math.abs(wy - sy) <= 1.6) return 3;
      // Sidewalk border 1 tile outside road edge
      if (Math.abs(wy - sy) <= 2.6) return 1;
    }
    // North-South streets every 64 tiles: x = 384, 448, 512, 576, 624
    for (const sx of [384, 448, 512, 576, 624]) {
      if (Math.abs(wx - sx) <= 1.6) return 3;
      if (Math.abs(wx - sx) <= 2.6) return 1;
    }
  }

  // 4. Oakridge West Subdivision Loop (x: 220..360, y: 340..500)
  if (wx >= 220 && wx <= 360 && wy >= 340 && wy <= 500) {
    if (Math.abs(wy - 360) <= 1.5 || Math.abs(wy - 480) <= 1.5) return 3;
    if (Math.abs(wx - 240) <= 1.5 || Math.abs(wx - 320) <= 1.5) return 3;
    if (Math.abs(wy - 360) <= 2.4 || Math.abs(wy - 480) <= 2.4) return 1;
    if (Math.abs(wx - 240) <= 2.4 || Math.abs(wx - 320) <= 2.4) return 1;
  }

  // 5. Winding Morgan Valley Rd (Rural Southwest)
  if (wx < 515 && wy > 460) {
    const morganY = 485 + (515 - wx) * 0.42 + Math.sin(wx * 0.022) * 18;
    if (Math.abs(wy - morganY) <= 1.8) return 3;
  }

  // 6. Winding Hutchins Mountain Rd (Rural South-Southeast)
  if (wy > 605) {
    const hutchinsX = 520 + (wy - 605) * 0.28 + Math.sin(wy * 0.02) * 20;
    if (Math.abs(wx - hutchinsX) <= 1.8) return 3;
  }

  return 0;
}

export function isRoadTile(wx, wy) {
  return getRoadType(wx, wy) === 3;
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

// Architectural Palettes (Wall left/right/top + Roof left/right/ridge + Awning)
const HOUSE_PALETTES = [
  { name: 'Clapboard White', wallL: '#cbd5e1', wallR: '#94a3b8', roofL: '#334155', roofR: '#1e293b', trim: '#f8fafc' },
  { name: 'Georgia Red Brick', wallL: '#991b1b', wallR: '#7f1d1d', roofL: '#27272a', roofR: '#18181b', trim: '#fef3c7' },
  { name: 'Sage Craftsman', wallL: '#4d7c0f', wallR: '#3f6212', roofL: '#451a03', roofR: '#290f02', trim: '#ecfccb' },
  { name: 'Colonial Blue', wallL: '#1d4ed8', wallR: '#1e40af', roofL: '#334155', roofR: '#1e293b', trim: '#dbeafe' },
  { name: 'Warm Sand Ranch', wallL: '#b45309', wallR: '#92400e', roofL: '#3f3f46', roofR: '#27272a', trim: '#fef3c7' },
  { name: 'Weathered Cabin', wallL: '#78350f', wallR: '#5c280b', roofL: '#14532d', roofR: '#052e16', trim: '#fed7aa' }
];

const COMMERCIAL_PALETTES = [
  { name: 'Downtown Brick', wallL: '#7f1d1d', wallR: '#651515', roofL: '#334155', roofR: '#1e293b', awning: '#dc2626' },
  { name: 'Cinderblock Slate', wallL: '#475569', wallR: '#334155', roofL: '#1e293b', roofR: '#0f172a', awning: '#0284c7' },
  { name: 'Stucco Cream', wallL: '#a16207', wallR: '#854d0e', roofL: '#3f3f46', roofR: '#27272a', awning: '#16a34a' },
  { name: 'Steel Warehouse', wallL: '#374151', wallR: '#1f2937', roofL: '#4b5563', roofR: '#374151', awning: '#d97706' },
  { name: 'Midtown Stone', wallL: '#57534e', wallR: '#44403c', roofL: '#292524', roofR: '#1c1917', awning: '#7c3aed' }
];

// Compound Multi-Rectangle Building Stamper (supports L-shapes, T-shapes, porches, windows & interior props)
function stampCompoundBuilding(chunk, config) {
  const {
    id,
    name,
    category, // 'house' | 'commercial' | 'rural'
    rects, // array of { x1, y1, x2, y2 }
    doorSpecs,
    seed,
    defaultRevealed = false,
    porchRect = null
  } = config;

  // Build full floor footprint cell set
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
      ? seed > 0.35
        ? 'parapet'
        : 'gable'
      : seed > 0.45
      ? 'gable'
      : 'hip';

  const wallTiles = [];
  const interiorTiles = [];

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

        // Stamp walkway connecting front door out toward street
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
      // Add windows on camera-facing South (!hasS) or East (!hasE) walls
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
      interiorTiles.push({ x: wx, y: wy });
    }
  }

  // Stamp porch deck if present
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

  // Generate interior furniture props (counters, beds, tables, shelves)
  const props = [];
  if (interiorTiles.length > 0) {
    const p1 = interiorTiles[Math.floor(interiorTiles.length * 0.25)];
    const p2 = interiorTiles[Math.floor(interiorTiles.length * 0.72)];
    if (p1) {
      props.push({
        x: p1.x + 0.5,
        y: p1.y + 0.5,
        kind: category === 'commercial' ? 'counter' : 'bed'
      });
    }
    if (p2 && (p2.x !== p1.x || p2.y !== p1.y)) {
      props.push({
        x: p2.x + 0.5,
        y: p2.y + 0.5,
        kind: category === 'commercial' ? 'shelf' : 'table'
      });
    }
  }

  chunk.buildings.push({
    id,
    name,
    category,
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

  // Compound wings for L-shaped garage, T-shaped addition, or extended den
  if (shapeRoll === 1 && bw >= 7) {
    // L-wing attached garage on east side
    rects.push({
      x1: bx + bw - 3,
      y1: by + bh,
      x2: bx + bw + 2,
      y2: by + bh + 3
    });
  } else if (shapeRoll === 2 && bh >= 7) {
    // Side wing on west side
    rects.push({
      x1: bx - 3,
      y1: by + 1,
      x2: bx,
      y2: by + bh - 2
    });
  } else if (shapeRoll === 3 && bw >= 8) {
    // Back sunroom extension
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
    // L-shaped corner storefront / motel wing
    rects.push({
      x1: bx + bw - 4,
      y1: by + bh,
      x2: bx + bw,
      y2: by + bh + 4
    });
  } else if (shapeRoll === 2 && bw >= 10) {
    // Back storage / loading bay extension
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

      if (wx < 10 || wy < 10 || wx >= MAP_SIZE - 10 || wy >= MAP_SIZE - 10) {
        tiles[ly * CHUNK_SIZE + lx] = 2;
        continue;
      }

      const roadTile = getRoadType(wx, wy);
      if (roadTile !== 0) {
        tiles[ly * CHUNK_SIZE + lx] = roadTile;
        continue;
      }

      if (isQuarryPerimeter(wx, wy)) {
        tiles[ly * CHUNK_SIZE + lx] = 2;
        continue;
      }

      if (isInsideQuarryHub(wx, wy)) {
        tiles[ly * CHUNK_SIZE + lx] = 1;
        continue;
      }

      if (isCreekTile(wx, wy)) {
        tiles[ly * CHUNK_SIZE + lx] = 4;
        continue;
      }

      tiles[ly * CHUNK_SIZE + lx] = 0;
    }
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

  // 2. Rockmart Police Precinct (aligned on Elm St & N Piedmont Ave block)
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

  // 3. Hometown Pizza (aligned on Elm St & Marble St block)
  if (cx === 15 && cy === 14) {
    stampCompoundBuilding(chunk, {
      id: 'hometown-pizza',
      name: 'Hometown Pizza',
      category: 'commercial',
      rects: [{ x1: 492, y1: 462, x2: 505, y2: 472 }],
      doorSpecs: [{ x: 498, y: 472, state: 'unlocked', dir: { dx: 0, dy: 1 } }],
      seed: 0.14
    });
    addChunkLoot(chunk, 'pizza-food', 498.5, 466.5, {
      name: 'MRE Pack',
      type: 'food',
      hunger: 55,
      hp: 10,
      color: '#eab308'
    });
    addChunkLoot(chunk, 'pizza-sup', 495.5, 465.5, {
      name: 'Scrap Plating',
      type: 'convoy',
      value: 1,
      color: '#22d3ee'
    });
    addChunkZombie(chunk, 'z-pizza-1', 502.5, 466.5, 1, false);
    return chunk;
  }

  // 4. Low True Hardware (on US-278 corridor)
  if (cx === 14 && cy === 8) {
    stampCompoundBuilding(chunk, {
      id: 'low-true-hw',
      name: 'Low True Hardware',
      category: 'commercial',
      rects: [
        { x1: 454, y1: 262, x2: 470, y2: 274 },
        { x1: 454, y1: 274, x2: 460, y2: 278 }
      ],
      doorSpecs: [{ x: 463, y: 262, state: 'locked', dir: { dx: 0, dy: -1 } }],
      seed: 0.61
    });
    addChunkLoot(chunk, 'hw-axe', 458.5, 268.5, {
      name: 'Fire Axe',
      type: 'weapon',
      weaponId: 'axe',
      color: '#f43f5e'
    });
    addChunkLoot(chunk, 'hw-crate', 466.5, 269.5, {
      name: 'Heavy Supply Crate',
      type: 'heavy',
      value: 4,
      color: '#fb923c'
    });
    addChunkZombie(chunk, 'z-hw-1', 463.5, 270.5, 2, false);
    return chunk;
  }

  // 5. Walmart Supercenter (NE US-278 commercial anchor)
  if (cx === 25 && cy === 7) {
    stampCompoundBuilding(chunk, {
      id: 'walmart-sc',
      name: 'Walmart Supercenter',
      category: 'commercial',
      rects: [
        { x1: 804, y1: 224, x2: 822, y2: 240 },
        { x1: 816, y1: 240, x2: 822, y2: 244 }
      ],
      doorSpecs: [{ x: 811, y: 240, state: 'barricaded', dir: { dx: 0, dy: 1 } }],
      seed: 0.88
    });
    addChunkLoot(chunk, 'wm-core', 813.5, 231.5, {
      name: 'Prototype Convoy Core',
      type: 'heavy',
      value: 6,
      color: '#e879f9'
    });
    addChunkZombie(chunk, 'z-wm-boss', 813.5, 228.5, 3, true);
    return chunk;
  }

  const midX = baseX + 16;
  const midY = baseY + 16;
  const zone = getZoneInfo(midX, midY);
  if (zone.ring === 0 || zone.ring === 4) return chunk;

  const isDowntownBlock = midX >= 360 && midX <= 630 && midY >= 290 && midY <= 540;
  const isSuburbBlock = midX >= 210 && midX <= 365 && midY >= 330 && midY <= 510;
  const isRuralArea = !isDowntownBlock && !isSuburbBlock;

  // Community Clustering:
  // - Downtown & Suburbs: Dense street-aligned blocks (2 paired houses or commercial storefronts per block)
  // - Rural Countryside: Sparse isolated farmhouses/cabins (~22% of chunks) with dirt driveways
  const seed = hash2d(cx, cy);
  const spawnThreshold = isDowntownBlock ? 0.15 : isSuburbBlock ? 0.2 : 0.78;

  if (seed > spawnThreshold) {
    // Find nearest east-west street inside chunk to snap building frontages neatly along the sidewalk!
    let targetRoadY = null;
    for (let y = baseY + 4; y <= baseY + 28; y++) {
      if (getRoadType(baseX + 16, y) === 3) {
        targetRoadY = y;
        break;
      }
    }

    const lots = [];
    if (targetRoadY !== null && !isRuralArea) {
      // Snap 1 or 2 buildings right onto the north side of the street sidewalk!
      const by = targetRoadY - 11;
      if (by >= baseY + 2) {
        lots.push({ bx: baseX + 4, by, bw: 9, bh: 8, s: hash2d(cx * 5, cy * 3) });
        if (hash2d(cx + 9, cy + 2) > 0.35) {
          lots.push({ bx: baseX + 17, by, bw: 9, bh: 8, s: hash2d(cx * 11, cy * 7) });
        }
      }
    } else if (isRuralArea) {
      // Isolated Rural Farmhouse, Barn, or Hunting Cabin with a dirt lane
      const bx = baseX + 8 + Math.floor(hash2d(cx + 3, cy) * 8);
      const by = baseY + 8 + Math.floor(hash2d(cx, cy + 5) * 8);
      // Verify no creek/road/quarry overlap
      let ok = true;
      for (let yy = by - 2; yy <= by + 12; yy += 2) {
        for (let xx = bx - 2; xx <= bx + 12; xx += 2) {
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
      // Skip if lot overlaps a north-south street
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

      // Primary building loot
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

  // Outdoor roaming zombies (denser in town streets, sparser in rural woods)
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
