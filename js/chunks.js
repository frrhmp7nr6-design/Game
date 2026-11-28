import { applyEditorOverridesToChunk } from './editor.js';

export const CHUNK_SIZE = 32;
export const WORLD_CHUNKS = 64; // 64 x 64 chunks = 2048 x 2048 tiles
export const MAP_SIZE = CHUNK_SIZE * WORLD_CHUNKS; // 2048
export const CENTER = 1024;

// Proportional 46x38 Quarry Safe Hub in the south-central valley
export const QUARRY_X = 1024;
export const QUARRY_Y = 1460;
export const QUARRY_RX = 46;
export const QUARRY_RY = 38;

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

export function getQuarryCenter() {
  return { x: QUARRY_X, y: QUARRY_Y };
}

export function isInsideQuarryHub(wx, wy) {
  const dx = (wx - QUARRY_X) / QUARRY_RX;
  const dy = (wy - QUARRY_Y) / QUARRY_RY;
  const angle = Math.atan2(dy, dx);
  const wobble =
    0.10 * Math.sin(angle * 3 + 0.6) +
    0.06 * Math.cos(angle * 5 - 1.1);
  return Math.hypot(dx, dy) <= 1.0 + wobble;
}

function isQuarryPerimeter(wx, wy) {
  if (!isInsideQuarryHub(wx, wy)) return false;
  if (wy < QUARRY_Y && Math.abs(wx - QUARRY_X) <= 2.5) return false;
  return (
    !isInsideQuarryHub(wx + 1, wy) ||
    !isInsideQuarryHub(wx - 1, wy) ||
    !isInsideQuarryHub(wx, wy + 1) ||
    !isInsideQuarryHub(wx, wy - 1)
  );
}

export function getRiverCenterX(wy) {
  return (
    1340 +
    Math.sin(wy * 0.009) * 58 +
    Math.cos(wy * 0.024) * 22
  );
}

export function isCreekTile(wx, wy) {
  const riverX = getRiverCenterX(wy);
  return Math.abs(wx - riverX) <= 3.6;
}

export function classifyRoad(wx, wy) {
  const i20Y = 230 + Math.sin(wx * 0.0025) * 14;
  const dyI20 = wy - i20Y;
  if (Math.abs(dyI20) <= 3.8) {
    if (Math.abs(dyI20) <= 0.6) return { tile: 2, kind: 'median' };
    return { tile: 3, kind: 'freeway' };
  }

  if (wy >= 230 && wy <= 515) {
    const t = (wy - 230) / 285;
    const westRampX = 1045 + t * 95;
    const eastRampX = 1235 - t * 95;
    if (Math.abs(wx - westRampX) <= 1.5 || Math.abs(wx - eastRampX) <= 1.5) {
      return { tile: 3, kind: 'ramp' };
    }
  }

  const us278Y = 515 + Math.sin(wx * 0.0035) * 16;
  if (Math.abs(wy - us278Y) <= 2.5) {
    return { tile: 3, kind: 'highway' };
  }

  if (wy >= 512 && wy <= 1060) {
    const dxBlvd = wx - 1140;
    if (Math.abs(dxBlvd) <= 2.7) {
      if (Math.abs(dxBlvd) <= 0.55) return { tile: 0, kind: 'median' };
      return { tile: 3, kind: 'boulevard' };
    }
  }

  const marbleX = 1024 + (wy < 1100 ? (1100 - wy) * 0.12 : 0);
  if (wy >= 515 && wy <= 1435 && Math.abs(wx - marbleX) <= 1.9) {
    return { tile: 3, kind: 'avenue' };
  }

  if (wy >= 515 && wy <= 1120 && Math.abs(wx - 540) <= 1.8) {
    return { tile: 3, kind: 'avenue' };
  }

  const inDowntown = wx >= 760 && wx <= 1260 && wy >= 580 && wy <= 1060;
  if (inDowntown) {
    for (const ay of [620, 710, 800, 890, 980, 1050]) {
      if (Math.abs(wy - ay) <= 1.8) return { tile: 3, kind: 'avenue' };
    }
    for (const sx of [780, 880, 980, 1080, 1240]) {
      if (Math.abs(wx - sx) <= 1.5) return { tile: 3, kind: 'street' };
    }
  }

  const inWestSuburb = wx >= 340 && wx <= 720 && wy >= 620 && wy <= 1060;
  if (inWestSuburb) {
    for (const ay of [660, 760, 860, 960, 1040]) {
      if (Math.abs(wy - ay) <= 1.5) return { tile: 3, kind: 'street' };
    }
    for (const sx of [380, 460, 620, 700]) {
      if (Math.abs(wx - sx) <= 1.4) return { tile: 3, kind: 'street' };
    }
  }

  const inEastSuburb = wx >= 1420 && wx <= 1800 && wy >= 580 && wy <= 1000;
  if (inEastSuburb) {
    for (const ay of [630, 740, 850, 960]) {
      if (Math.abs(wy - ay) <= 1.5) return { tile: 3, kind: 'street' };
    }
    for (const sx of [1460, 1580, 1700, 1780]) {
      if (Math.abs(wx - sx) <= 1.4) return { tile: 3, kind: 'street' };
    }
  }

  if (wx < 1020 && wy > 980) {
    const morganY = 1040 + (1020 - wx) * 0.45 + Math.sin(wx * 0.014) * 28;
    if (Math.abs(wy - morganY) <= 1.5) return { tile: 3, kind: 'rural' };
  }
  if (wy > 1420 && wx > 960 && wx < 1300) {
    const hutchinsX = 1024 + (wy - 1420) * 0.32 + Math.sin(wy * 0.015) * 24;
    if (Math.abs(wx - hutchinsX) <= 1.5) return { tile: 3, kind: 'rural' };
  }
  if (wx >= 1024 && wx <= 1880) {
    const southCountyY = 1320 + Math.sin(wx * 0.008) * 24;
    if (Math.abs(wy - southCountyY) <= 1.5) return { tile: 3, kind: 'rural' };
  }

  if (wy > 1350 && wx < 920) {
    const dirtY = 1560 + Math.sin(wx * 0.018) * 42;
    if (Math.abs(wy - dirtY) <= 1.2) return { tile: 5, kind: 'dirt' };
  }
  if (wx > 1480 && wy > 1020) {
    const dirtX = 1660 + Math.cos(wy * 0.016) * 45;
    if (Math.abs(wx - dirtX) <= 1.2) return { tile: 5, kind: 'dirt' };
  }
  if (wy < 460 && wx < 980) {
    const northTrailY = 380 + Math.sin(wx * 0.015) * 30;
    if (Math.abs(wy - northTrailY) <= 1.2) return { tile: 5, kind: 'dirt' };
  }

  if (inDowntown) {
    for (const ay of [620, 710, 800, 890, 980, 1050]) {
      if (Math.abs(wy - ay) <= 2.8) return { tile: 1, kind: 'sidewalk' };
    }
    for (const sx of [780, 880, 980, 1080, 1240]) {
      if (Math.abs(wx - sx) <= 2.4) return { tile: 1, kind: 'sidewalk' };
    }
    if (Math.abs(wx - 1140) <= 3.7) return { tile: 1, kind: 'sidewalk' };
  }
  if (inWestSuburb) {
    for (const ay of [660, 760, 860, 960, 1040]) {
      if (Math.abs(wy - ay) <= 2.4) return { tile: 1, kind: 'sidewalk' };
    }
    for (const sx of [380, 460, 540, 620, 700]) {
      if (Math.abs(wx - sx) <= 2.3) return { tile: 1, kind: 'sidewalk' };
    }
  }
  if (inEastSuburb) {
    for (const ay of [630, 740, 850, 960]) {
      if (Math.abs(wy - ay) <= 2.4) return { tile: 1, kind: 'sidewalk' };
    }
    for (const sx of [1460, 1580, 1700, 1780]) {
      if (Math.abs(wx - sx) <= 2.3) return { tile: 1, kind: 'sidewalk' };
    }
  }

  return { tile: 0, kind: 'none' };
}

export function getRoadType(wx, wy) {
  return classifyRoad(wx, wy).tile;
}

export function isRoadTile(wx, wy) {
  return classifyRoad(wx, wy).tile === 3;
}

export function getDistrictAt(wx, wy) {
  if (wx < 12 || wy < 12 || wx >= MAP_SIZE - 12 || wy >= MAP_SIZE - 12) return 'wall';
  if (isInsideQuarryHub(wx, wy)) return 'quarry';
  if (wx >= 760 && wx <= 1260 && wy >= 580 && wy <= 1060) return 'downtown';
  if (wx >= 340 && wx <= 720 && wy >= 620 && wy <= 1060) return 'suburb_west';
  if (wx >= 1420 && wx <= 1800 && wy >= 580 && wy <= 1000) return 'suburb_east';
  if (wy >= 470 && wy <= 575 && wx >= 420 && wx <= 1760) return 'highway_strip';
  if (Math.hypot(wx - QUARRY_X, wy - QUARRY_Y) <= 760) return 'rural';
  return 'wilderness';
}

export function getZoneInfo(wx, wy) {
  const district = getDistrictAt(wx, wy);
  if (district === 'wall') {
    return { ring: 4, name: 'Perimeter Quarantine Wall', color: '#94a3b8' };
  }
  if (district === 'quarry') {
    return { ring: 0, name: 'Rockmart Quarry Safe Hub', color: '#4ade80' };
  }
  if (district === 'downtown') {
    return { ring: 1, name: 'Downtown Rockmart', color: '#38bdf8' };
  }
  if (district === 'suburb_west') {
    return { ring: 1, name: 'Oakridge Suburbs', color: '#38bdf8' };
  }
  if (district === 'suburb_east') {
    return { ring: 2, name: 'Eastbrook Suburbs', color: '#f59e0b' };
  }
  if (district === 'highway_strip') {
    return { ring: 2, name: 'US-278 Commercial Corridor', color: '#f59e0b' };
  }
  if (district === 'rural') {
    return { ring: 2, name: 'Cedar Valley Farmlands', color: '#f59e0b' };
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

function isLotClear(bx, by, bw, bh, margin = 2) {
  for (let y = by - margin; y <= by + bh + margin; y++) {
    for (let x = bx - margin; x <= bx + bw + margin; x++) {
      if (x < 16 || y < 16 || x >= MAP_SIZE - 16 || y >= MAP_SIZE - 16) return false;
      if (isInsideQuarryHub(x, y) || isCreekTile(x, y)) return false;
      if (getRoadType(x, y) === 3) return false;
    }
  }
  return true;
}

function buildHouseBlueprint(chunk, id, name, bx, by, bw, bh, doorState, seed, isRural = false) {
  const shapeRoll = Math.floor(seed * 100) % 4;
  const rects = [{ x1: bx, y1: by, x2: bx + bw, y2: by + bh }];

  if (shapeRoll === 1 && bw >= 7 && isLotClear(bx + bw - 3, by + bh, 5, 3, 1)) {
    rects.push({
      x1: bx + bw - 3,
      y1: by + bh,
      x2: bx + bw + 2,
      y2: by + bh + 3
    });
  } else if (shapeRoll === 2 && bh >= 7 && isLotClear(bx - 3, by + 1, 3, bh - 3, 1)) {
    rects.push({
      x1: bx - 3,
      y1: by + 1,
      x2: bx,
      y2: by + bh - 2
    });
  } else if (shapeRoll === 3 && bw >= 8 && isLotClear(bx + 2, by - 2, bw - 4, 2, 1)) {
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

  if (shapeRoll === 1 && bw >= 9 && isLotClear(bx + bw - 4, by + bh, 4, 4, 1)) {
    rects.push({
      x1: bx + bw - 4,
      y1: by + bh,
      x2: bx + bw,
      y2: by + bh + 4
    });
  } else if (shapeRoll === 2 && bw >= 10 && isLotClear(bx + 1, by - 3, bw - 2, 3, 1)) {
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

function populateEnvironmentProps(chunk, district) {
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseY = chunk.cy * CHUNK_SIZE;

  const isOccupied = (wx, wy) => {
    const lx = Math.floor(wx) - baseX;
    const ly = Math.floor(wy) - baseY;
    if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_SIZE) return true;
    const t = chunk.tiles[ly * CHUNK_SIZE + lx];
    if (t === 2 || t === 3 || t === 4) return true;
    if (isInsideQuarryHub(wx, wy)) return true;
    for (const b of chunk.buildings) {
      if (wx >= b.x1 - 1 && wx <= b.x2 + 2 && wy >= b.y1 - 1 && wy <= b.y2 + 3) {
        return true;
      }
    }
    return false;
  };

  for (let ly = 2; ly < CHUNK_SIZE - 2; ly += 4) {
    const wy = baseY + ly;
    for (let lx = 2; lx < CHUNK_SIZE - 2; lx += 4) {
      const wx = baseX + lx;
      const idx = ly * CHUNK_SIZE + lx;
      const t = chunk.tiles[idx];
      const rk = chunk.roadKinds[idx];
      const r = hash2d(wx * 13, wy * 17);

      if (t === 1 && rk === 'sidewalk' && !isOccupied(wx + 0.5, wy + 0.5)) {
        if (r > 0.68) {
          chunk.props.push({ kind: 'streetlight', x: wx + 0.5, y: wy + 0.5, solid: false });
        } else if (r < 0.14) {
          chunk.props.push({ kind: 'hydrant', x: wx + 0.5, y: wy + 0.5, solid: false });
        }
      } else if (t === 0 && !isOccupied(wx + 0.5, wy + 0.5)) {
        const nearRoad =
          getRoadType(wx + 3, wy) === 3 ||
          getRoadType(wx - 3, wy) === 3 ||
          getRoadType(wx, wy + 3) === 3 ||
          getRoadType(wx, wy - 3) === 3;

        if (nearRoad && r > 0.84) {
          if (district === 'rural' || district === 'wilderness') {
            chunk.props.push({ kind: 'fence', x: wx + 0.5, y: wy + 0.5, solid: false });
          } else {
            chunk.props.push({
              kind: 'car',
              x: wx + 0.5,
              y: wy + 0.5,
              color: r > 0.92 ? '#991b1b' : r > 0.88 ? '#1d4ed8' : '#cbd5e1',
              solid: true
            });
          }
        }
      }
    }
  }

  const treeAttempts =
    district === 'wilderness'
      ? 26
      : district === 'rural'
      ? 18
      : district === 'suburb_west' || district === 'suburb_east'
      ? 10
      : district === 'quarry'
      ? 3
      : 5;

  for (let i = 0; i < treeAttempts; i++) {
    const lx = 1 + Math.floor(hash2d(chunk.cx * 31 + i, chunk.cy * 17 + 3) * (CHUNK_SIZE - 2));
    const ly = 1 + Math.floor(hash2d(chunk.cx * 19 + 7, chunk.cy * 29 + i) * (CHUNK_SIZE - 2));
    const wx = baseX + lx + 0.5;
    const wy = baseY + ly + 0.5;
    if (isOccupied(wx, wy)) continue;

    let nearDoor = false;
    for (const d of chunk.doors) {
      if (Math.hypot(d.x + 0.5 - wx, d.y + 0.5 - wy) < 3.0) {
        nearDoor = true;
        break;
      }
    }
    if (nearDoor) continue;

    const kindRoll = hash2d(Math.floor(wx * 3), Math.floor(wy * 5));
    const kind =
      kindRoll < 0.14
        ? 'rock'
        : kindRoll < 0.34
        ? 'bush'
        : district === 'wilderness' || kindRoll > 0.65
        ? 'pine'
        : 'oak';

    chunk.props.push({
      kind,
      x: wx,
      y: wy,
      scale: 0.85 + hash2d(i * 11, chunk.cx + chunk.cy) * 0.4,
      solid: kind === 'pine' || kind === 'oak' || kind === 'rock'
    });
  }
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
    zombies: [],
    props: []
  };

  const baseX = cx * CHUNK_SIZE;
  const baseY = cy * CHUNK_SIZE;

  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    const wy = baseY + ly;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = baseX + lx;
      const idx = ly * CHUNK_SIZE + lx;

      if (wx < 12 || wy < 12 || wx >= MAP_SIZE - 12 || wy >= MAP_SIZE - 12) {
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

  // Guaranteed Landmarks: Quarry Safe Hub
  if (Math.abs(baseX + 16 - QUARRY_X) <= 48 && Math.abs(baseY + 16 - QUARRY_Y) <= 48) {
    stampCompoundBuilding(chunk, {
      id: 'quarry-garage',
      name: 'Convoy Garage',
      category: 'commercial',
      rects: [{ x1: QUARRY_X - 16, y1: QUARRY_Y - 16, x2: QUARRY_X - 6, y2: QUARRY_Y - 7 }],
      doorSpecs: [
        { x: QUARRY_X - 11, y: QUARRY_Y - 7, state: 'unlocked', dir: { dx: 0, dy: 1 } },
        { x: QUARRY_X - 6, y: QUARRY_Y - 12, state: 'unlocked', dir: { dx: 1, dy: 0 } }
      ],
      seed: 0.42,
      defaultRevealed: true
    });

    stampCompoundBuilding(chunk, {
      id: 'quarry-depot',
      name: 'Quarry Depot',
      category: 'commercial',
      rects: [{ x1: QUARRY_X + 6, y1: QUARRY_Y - 16, x2: QUARRY_X + 16, y2: QUARRY_Y - 7 }],
      doorSpecs: [{ x: QUARRY_X + 6, y: QUARRY_Y - 12, state: 'unlocked', dir: { dx: -1, dy: 0 } }],
      seed: 0.77,
      defaultRevealed: true
    });

    const gCx = Math.floor(QUARRY_X / CHUNK_SIZE);
    const gCy = Math.floor(QUARRY_Y / CHUNK_SIZE);
    if (cx === gCx && cy === gCy) {
      addChunkLoot(chunk, 'q-crowbar', QUARRY_X - 3.5, QUARRY_Y - 1.5, {
        name: 'Crowbar',
        type: 'weapon',
        weaponId: 'crowbar',
        color: '#38bdf8'
      });
      addChunkLoot(chunk, 'q-beans', QUARRY_X - 2.5, QUARRY_Y - 2.5, {
        name: 'Canned Beans',
        type: 'food',
        hunger: 35,
        hp: 5,
        color: '#f97316'
      });
      addChunkLoot(chunk, 'q-pick', QUARRY_X - 4.5, QUARRY_Y - 0.5, {
        name: 'Lockpick Set',
        type: 'tool',
        toolId: 'lockpick',
        color: '#fbbf24'
      });
      addChunkLoot(chunk, 'q-med', QUARRY_X + 10.5, QUARRY_Y - 11.5, {
        name: 'First Aid Kit',
        type: 'med',
        hunger: 0,
        hp: 65,
        color: '#f8fafc'
      });
    }
  }

  // Rockmart Police Precinct at (1120, 920)
  if (cx === 35 && cy === 28) {
    stampCompoundBuilding(chunk, {
      id: 'rockmart-pd',
      name: 'Rockmart Police Precinct',
      category: 'commercial',
      rects: [
        { x1: 1120, y1: 904, x2: 1132, y2: 916 },
        { x1: 1128, y1: 916, x2: 1132, y2: 920 }
      ],
      doorSpecs: [
        { x: 1125, y: 916, state: 'locked', dir: { dx: 0, dy: 1 } },
        { x: 1120, y: 910, state: 'barricaded', dir: { dx: -1, dy: 0 } }
      ],
      seed: 0.22
    });

    addChunkLoot(chunk, 'pd-radio-1', 1124.5, 907.5, {
      name: 'Police Radio',
      type: 'radio',
      charges: 3,
      color: '#38bdf8'
    });
    addChunkLoot(chunk, 'pd-radio-2', 1129.5, 907.5, {
      name: 'Police Radio',
      type: 'radio',
      charges: 3,
      color: '#38bdf8'
    });
    addChunkLoot(chunk, 'pd-pistol', 1129.5, 912.5, {
      name: '9mm Pistol',
      type: 'weapon',
      weaponId: 'pistol',
      color: '#94a3b8'
    });

    addChunkZombie(chunk, 'z-pd-1', 1123.5, 912.5, 2, false);
    addChunkZombie(chunk, 'z-pd-2', 1129.5, 909.5, 2, false);
    populateEnvironmentProps(chunk, 'downtown');
    applyEditorOverridesToChunk(chunk);
    return chunk;
  }

  // Regional District Building & Encounter Rules
  const midX = baseX + 16;
  const midY = baseY + 16;
  const district = getDistrictAt(midX, midY);
  const zone = getZoneInfo(midX, midY);

  if (district !== 'quarry' && district !== 'wall') {
    const isDowntown = district === 'downtown';
    const isSuburb = district === 'suburb_west' || district === 'suburb_east';
    const isHighwayStrip = district === 'highway_strip';
    const isRural = district === 'rural' || district === 'wilderness';

    const seed = hash2d(cx, cy);
    const spawnThreshold = isDowntown
      ? 0.05
      : isSuburb
      ? 0.08
      : isHighwayStrip
      ? 0.15
      : district === 'rural'
      ? 0.45
      : 0.72;

    if (seed > spawnThreshold) {
      let targetRoadY = null;
      for (let y = baseY + 11; y <= baseY + 29; y++) {
        if (getRoadType(baseX + 16, y) === 3) {
          targetRoadY = y;
          break;
        }
      }

      const lots = [];
      if (targetRoadY !== null && !isRural) {
        const by = targetRoadY - 12;
        if (by >= baseY + 1) {
          lots.push({ bx: baseX + 3, by, bw: 9, bh: 8, s: hash2d(cx * 5, cy * 3) });
          lots.push({ bx: baseX + 17, by, bw: 9, bh: 8, s: hash2d(cx * 11, cy * 7) });
        }
      } else if (!isRural) {
        lots.push({ bx: baseX + 4, by: baseY + 4, bw: 9, bh: 8, s: hash2d(cx * 7, cy * 13) });
        lots.push({ bx: baseX + 18, by: baseY + 17, bw: 9, bh: 8, s: hash2d(cx * 19, cy * 23) });
      } else {
        const bx = baseX + 6 + Math.floor(hash2d(cx + 3, cy) * 9);
        const by = baseY + 6 + Math.floor(hash2d(cx, cy + 5) * 9);
        lots.push({ bx, by, bw: 9, bh: 8, s: hash2d(cx * 17, cy * 19), rural: true });
      }

      lots.forEach((lot, idx) => {
        if (!isLotClear(lot.bx, lot.by, lot.bw, lot.bh, 2)) return;

        const isCommercial =
          !lot.rural &&
          (isHighwayStrip || (isDowntown && lot.s > 0.35));

        const doorRoll = hash2d(cx + idx * 17, cy + 29);
        const doorState =
          zone.ring === 1
            ? doorRoll > 0.62
              ? 'locked'
              : 'unlocked'
            : zone.ring === 2
            ? doorRoll > 0.50
              ? 'barricaded'
              : 'locked'
            : 'barricaded';

        const commNames = [
          'Corner Market',
          'Piedmont Pharmacy',
          'Elm St Cafe',
          'Auto Parts Depot',
          'Rockmart Laundromat',
          'Feed & Seed Store',
          'US-278 Truck Stop',
          'Hardware & Supply'
        ];
        const houseNames = [
          'Craftsman Home',
          'Georgia Brick Ranch',
          'Oakridge Bungalow',
          'Colonial Two-Story',
          'Wrap-Porch Cottage',
          'Suburban Split-Level'
        ];
        const ruralNames = [
          'Valley Farmhouse',
          'Cedar Timber Barn',
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
              : crateRoll > 0.66 || isHighwayStrip
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

    const outdoorCount = isDowntown ? 3 : isSuburb || isHighwayStrip ? 2 : 1;
    for (let i = 0; i < outdoorCount; i++) {
      const zx = baseX + 3 + Math.floor(hash2d(cx + i * 13, cy + 5) * 26) + 0.5;
      const zy = baseY + 3 + Math.floor(hash2d(cx + 7, cy + i * 19) * 26) + 0.5;
      const tx = Math.floor(zx - baseX);
      const ty = Math.floor(zy - baseY);
      if (tiles[ty * CHUNK_SIZE + tx] !== 2 && tiles[ty * CHUNK_SIZE + tx] !== 4 && !isInsideQuarryHub(zx, zy)) {
        addChunkZombie(chunk, `z-out-${cx}-${cy}-${i}`, zx, zy, zone.ring, false);
      }
    }
  }

  populateEnvironmentProps(chunk, district);
  applyEditorOverridesToChunk(chunk);
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
