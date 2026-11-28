import { openedDoors, doorDamage } from './chunks.js';

const HOUSE_PALETTES = [
  { name: 'Clapboard White', wallL: '#cbd5e1', wallR: '#94a3b8', roofL: '#475569', roofR: '#334155', trim: '#f8fafc', floor: '#78553a' },
  { name: 'Georgia Red Brick', wallL: '#991b1b', wallR: '#7f1d1d', roofL: '#3f3f46', roofR: '#27272a', trim: '#fef3c7', floor: '#6b4c35' },
  { name: 'Sage Craftsman', wallL: '#4d7c0f', wallR: '#3f6212', roofL: '#5c2d16', roofR: '#422006', trim: '#ecfccb', floor: '#855e42' },
  { name: 'Colonial Blue', wallL: '#1d4ed8', wallR: '#1e40af', roofL: '#334155', roofR: '#1e293b', trim: '#dbeafe', floor: '#7c583c' },
  { name: 'Warm Sand Ranch', wallL: '#b45309', wallR: '#92400e', roofL: '#44403c', roofR: '#292524', trim: '#fef3c7', floor: '#6e4e37' },
  { name: 'Weathered Cabin', wallL: '#78350f', wallR: '#5c280b', roofL: '#166534', roofR: '#14532d', trim: '#fed7aa', floor: '#5c3d28' }
];

const COMMERCIAL_PALETTES = [
  { name: 'Downtown Brick', wallL: '#7f1d1d', wallR: '#651515', roofL: '#334155', roofR: '#1e293b', awning: '#dc2626', floor: '#475569' },
  { name: 'Cinderblock Slate', wallL: '#475569', wallR: '#334155', roofL: '#1e293b', roofR: '#0f172a', awning: '#0284c7', floor: '#3f4a59' },
  { name: 'Stucco Cream', wallL: '#a16207', wallR: '#854d0e', roofL: '#3f3f46', roofR: '#27272a', awning: '#16a34a', floor: '#52525b' },
  { name: 'Steel Warehouse', wallL: '#374151', wallR: '#1f2937', roofL: '#4b5563', roofR: '#374151', awning: '#d97706', floor: '#334155' },
  { name: 'Midtown Stone', wallL: '#57534e', wallR: '#44403c', roofL: '#292524', roofR: '#1c1917', awning: '#7c3aed', floor: '#44403c' }
];

export function makeEdgeKey(x, y, side, floor = 0) {
  const prefix = floor === 0 ? '' : `F${floor}:`;
  if (side === 'N') return `${prefix}H:${x},${y}`;
  if (side === 'S') return `${prefix}H:${x},${y + 1}`;
  if (side === 'W') return `${prefix}V:${x},${y}`;
  return `${prefix}V:${x + 1},${y}`;
}

function buildFloorLevel(chunk, bldgId, category, floorNum, rooms, doorSpecs, stairs = []) {
  const CHUNK_SIZE = 32;
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseY = chunk.cy * CHUNK_SIZE;

  const cellRoomMap = new Map();
  const cellSet = new Set();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  rooms.forEach((rm, rIdx) => {
    for (let y = rm.y1; y <= rm.y2; y++) {
      for (let x = rm.x1; x <= rm.x2; x++) {
        const k = `${x},${y}`;
        cellSet.add(k);
        cellRoomMap.set(k, rIdx);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;

        if (floorNum === 0) {
          const lx = x - baseX;
          const ly = y - baseY;
          if (lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE) {
            chunk.tiles[ly * CHUNK_SIZE + lx] = rm.floorTile || 1;
          }
        }
      }
    }
  });

  const doorEdgeMap = new Map();
  const clearZones = [];

  for (const ds of doorSpecs) {
    const eKey = makeEdgeKey(ds.x, ds.y, ds.side, floorNum);
    doorEdgeMap.set(eKey, ds);

    const orient = ds.side === 'N' || ds.side === 'S' ? 'H' : 'V';
    const ex = ds.side === 'E' ? ds.x + 1 : ds.x;
    const ey = ds.side === 'S' ? ds.y + 1 : ds.y;
    clearZones.push({
      x: orient === 'H' ? ex + 0.5 : ex,
      y: orient === 'H' ? ey : ey + 0.5
    });
  }

  for (const st of stairs) {
    clearZones.push({ x: st.x + 0.5, y: st.y + 0.5 });
  }

  const edgeWalls = [];
  const floorDoors = [];
  const seenEdges = new Set();

  for (const key of cellSet) {
    const [wx, wy] = key.split(',').map(Number);
    const myRoom = cellRoomMap.get(key);

    const sides = [
      { side: 'N', nx: wx, ny: wy - 1 },
      { side: 'S', nx: wx, ny: wy + 1 },
      { side: 'W', nx: wx - 1, ny: wy },
      { side: 'E', nx: wx + 1, ny: wy }
    ];

    for (const s of sides) {
      const nKey = `${s.nx},${s.ny}`;
      const neighborInBldg = cellSet.has(nKey);
      const neighborRoom = cellRoomMap.get(nKey);
      const isExterior = !neighborInBldg;
      const isPartition = neighborInBldg && neighborRoom !== myRoom;

      if (!isExterior && !isPartition) continue;

      const eKey = makeEdgeKey(wx, wy, s.side, floorNum);
      if (seenEdges.has(eKey)) continue;
      seenEdges.add(eKey);

      const orient = s.side === 'N' || s.side === 'S' ? 'H' : 'V';
      const ex = s.side === 'E' ? wx + 1 : wx;
      const ey = s.side === 'S' ? wy + 1 : wy;

      const doorSpec = doorEdgeMap.get(eKey);
      if (doorSpec) {
        const isOpen = openedDoors.has(eKey) || doorSpec.state === 'open';
        const maxHp = doorSpec.state === 'barricaded' ? 90 : 55;
        const doorObj = {
          key: eKey,
          x: ex,
          y: ey,
          floor: floorNum,
          orient,
          buildingId: bldgId,
          interior: Boolean(doorSpec.interior),
          state: isOpen ? 'open' : doorSpec.state,
          hp: doorDamage.has(eKey) ? doorDamage.get(eKey) : maxHp,
          maxHp
        };
        floorDoors.push(doorObj);
        if (floorNum === 0) chunk.doors.push(doorObj);
        chunk.edgeDoors.set(eKey, doorObj);
      } else {
        // Windows appear on all exterior walls (interior + exterior faces); awnings only draw on S/E in render_buildings.js
        const hasWindow =
          isExterior &&
          floorNum >= 0 &&
          ((orient === 'H' && wx % 2 === 0) || (orient === 'V' && wy % 2 === 1));
        const isBoarded = hasWindow && doorSpecs[0]?.state === 'barricaded';
        const wallObj = {
          key: eKey,
          x: ex,
          y: ey,
          floor: floorNum,
          orient,
          outSide: isExterior ? s.side : null,
          isExterior,
          isBasement: floorNum < 0,
          hasWindow,
          isBoarded,
          buildingId: bldgId
        };
        edgeWalls.push(wallObj);
        chunk.edgeWalls.set(eKey, wallObj);
      }
    }
  }

  const props = [];
  const tryAddProp = (prop) => {
    for (const dp of clearZones) {
      const nearX = Math.max(prop.x, Math.min(dp.x, prop.x + prop.w));
      const nearY = Math.max(prop.y, Math.min(dp.y, prop.y + prop.d));
      if (Math.hypot(dp.x - nearX, dp.y - nearY) < 1.2) return;
    }
    for (const other of props) {
      if (
        prop.x < other.x + other.w + 0.15 &&
        prop.x + prop.w + 0.15 > other.x &&
        prop.y < other.y + other.d + 0.15 &&
        prop.y + prop.d + 0.15 > other.y
      ) {
        return;
      }
    }
    props.push(prop);
  };

  // Offset props +0.28 inside room boundaries so thin edge walls never clip or cover furniture
  const pad = 0.28;
  for (const rm of rooms) {
    const rw = rm.x2 - rm.x1 + 1;
    const rh = rm.y2 - rm.y1 + 1;
    if (rm.type === 'bedroom' && rw >= 3 && rh >= 3) {
      tryAddProp({ x: rm.x1 + pad, y: rm.y1 + pad, w: 1.6, d: 1.6, kind: 'bed', solid: true });
      if (rw >= 4) {
        tryAddProp({ x: rm.x2 + 1 - pad - 0.8, y: rm.y1 + pad, w: 0.8, d: 1.25, kind: 'dresser', solid: true });
      }
    } else if (rm.type === 'bathroom' && rw >= 2 && rh >= 2) {
      tryAddProp({ x: rm.x1 + pad, y: rm.y1 + pad, w: 0.7, d: 0.7, kind: 'toilet', solid: true });
      if (rw >= 3) {
        tryAddProp({ x: rm.x2 + 1 - pad - 0.85, y: rm.y1 + pad, w: 0.85, d: 1.35, kind: 'tub', solid: true });
      }
    } else if (rm.type === 'kitchen' && rw >= 3 && rh >= 3) {
      tryAddProp({ x: rm.x1 + pad, y: rm.y1 + pad, w: Math.min(2.3, rw - 1.45), d: 0.8, kind: 'counter', solid: true });
      tryAddProp({ x: rm.x2 + 1 - pad - 0.8, y: rm.y1 + pad, w: 0.8, d: 0.8, kind: 'fridge', solid: true });
      if (rh >= 4) {
        tryAddProp({ x: rm.x1 + 0.65, y: rm.y2 + 1 - pad - 0.95, w: 1.35, d: 0.95, kind: 'table', solid: true });
      }
    } else if (rm.type === 'living' && rw >= 4 && rh >= 3) {
      tryAddProp({ x: rm.x1 + pad + 0.1, y: rm.y1 + pad + 0.1, w: 1.9, d: 0.85, kind: 'sofa', solid: true });
      tryAddProp({ x: rm.x1 + 0.75, y: rm.y1 + 1.65, w: 1.25, d: 0.7, kind: 'table', solid: true });
    } else if (rm.type === 'garage' && rw >= 4 && rh >= 4) {
      tryAddProp({ x: rm.x1 + pad, y: rm.y1 + pad, w: 2.1, d: 0.8, kind: 'workbench', solid: true });
    } else if (rm.type === 'retail' && rw >= 5 && rh >= 5) {
      tryAddProp({ x: rm.x1 + 0.85, y: rm.y1 + 0.45, w: 2.5, d: 0.8, kind: 'counter', solid: true });
      tryAddProp({ x: rm.x1 + 0.85, y: rm.y1 + 2.55, w: 2.3, d: 0.7, kind: 'shelf', solid: true });
      if (rw >= 8) {
        tryAddProp({ x: rm.x2 + 1 - 3.25, y: rm.y1 + 2.55, w: 2.3, d: 0.7, kind: 'shelf', solid: true });
      }
    } else if ((rm.type === 'shed' || rm.type === 'basement') && rw >= 3 && rh >= 3) {
      tryAddProp({ x: rm.x1 + pad, y: rm.y1 + pad, w: 1.7, d: 0.75, kind: 'shelf', solid: true });
    }
  }

  return {
    floor: floorNum,
    rooms,
    rects: rooms.map((r) => ({ x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 })),
    x1: minX,
    y1: minY,
    x2: maxX,
    y2: maxY,
    cellSet,
    edgeWalls,
    doors: floorDoors,
    props,
    stairs
  };
}

export function stampThinWallBuilding(chunk, config) {
  const {
    id,
    name,
    category,
    rooms,
    doorSpecs,
    extraFloors = {},
    groundStairs = [],
    seed = 0.5,
    defaultRevealed = false,
    porchRect = null
  } = config;

  const CHUNK_SIZE = 32;
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseY = chunk.cy * CHUNK_SIZE;

  const palette =
    category === 'commercial'
      ? COMMERCIAL_PALETTES[Math.floor(seed * 97) % COMMERCIAL_PALETTES.length]
      : HOUSE_PALETTES[Math.floor(seed * 131) % HOUSE_PALETTES.length];

  const roofStyle =
    category === 'commercial' || Object.keys(extraFloors).length >= 2
      ? 'parapet'
      : seed > 0.45
      ? 'gable'
      : 'hip';

  const floors = {};
  floors[0] = buildFloorLevel(chunk, id, category, 0, rooms, doorSpecs, groundStairs);

  for (const [fKey, fCfg] of Object.entries(extraFloors)) {
    const fNum = Number(fKey);
    floors[fNum] = buildFloorLevel(
      chunk,
      id,
      category,
      fNum,
      fCfg.rooms,
      fCfg.doorSpecs || [],
      fCfg.stairs || []
    );
  }

  if (porchRect) {
    for (let py = porchRect.y1; py <= porchRect.y2; py++) {
      for (let px = porchRect.x1; px <= porchRect.x2; px++) {
        const lx = px - baseX;
        const ly = py - baseY;
        if (lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE) {
          if (chunk.tiles[ly * CHUNK_SIZE + lx] === 0) {
            chunk.tiles[ly * CHUNK_SIZE + lx] = 1;
          }
        }
      }
    }
  }

  const g = floors[0];
  const bldg = {
    id,
    name,
    category,
    floors,
    minFloor: Math.min(...Object.keys(floors).map(Number)),
    maxFloor: Math.max(...Object.keys(floors).map(Number)),
    rooms: g.rooms,
    rects: g.rects,
    x1: g.x1,
    y1: g.y1,
    x2: g.x2,
    y2: g.y2,
    cellSet: g.cellSet,
    edgeWalls: g.edgeWalls,
    props: g.props,
    stairs: g.stairs,
    palette,
    roofStyle,
    porchRect,
    defaultRevealed
  };

  chunk.buildings.push(bldg);
  return bldg;
}

export function generateFloorplanBuilding(chunk, opts) {
  const { id, name, bx, by, tier, doorState, seed } = opts;

  if (tier === 'highrise') {
    const bw = 11;
    const bh = 10;
    const rooms1F = [
      { name: 'Lobby & Security', type: 'retail', x1: bx, y1: by + 4, x2: bx + bw - 1, y2: by + bh - 1 },
      { name: 'Mail & Stair Core', type: 'shed', x1: bx, y1: by, x2: bx + 4, y2: by + 3 },
      { name: 'Management Office', type: 'living', x1: bx + 5, y1: by, x2: bx + bw - 1, y2: by + 3 }
    ];
    const doors1F = [
      { x: bx + 5, y: by + bh - 1, side: 'S', state: doorState, interior: false },
      { x: bx + 2, y: by + 3, side: 'S', state: 'unlocked', interior: true },
      { x: bx + 7, y: by + 3, side: 'S', state: 'unlocked', interior: true }
    ];
    const stairs1F = [{ x: bx + 1, y: by + 1, fromFloor: 0, toFloor: 1, dir: 'up' }];

    const makeUpperFloor = (fNum, hasUp, hasDown) => {
      const stairs = [];
      if (hasDown) stairs.push({ x: bx + 1, y: by + 1, fromFloor: fNum, toFloor: fNum - 1, dir: 'down' });
      if (hasUp) stairs.push({ x: bx + 3, y: by + 1, fromFloor: fNum, toFloor: fNum + 1, dir: 'up' });
      return {
        rooms: [
          { name: `Floor ${fNum + 1} Hall`, type: 'living', x1: bx, y1: by, x2: bx + 4, y2: by + 4 },
          { name: `Suite ${fNum + 1}A`, type: 'bedroom', x1: bx + 5, y1: by, x2: bx + bw - 1, y2: by + 4 },
          { name: `Suite ${fNum + 1}B`, type: 'kitchen', x1: bx, y1: by + 5, x2: bx + 5, y2: by + bh - 1 },
          { name: `Suite ${fNum + 1} Bath`, type: 'bathroom', x1: bx + 6, y1: by + 5, x2: bx + bw - 1, y2: by + bh - 1 }
        ],
        doorSpecs: [
          { x: bx + 4, y: by + 2, side: 'E', state: 'locked', interior: true },
          { x: bx + 2, y: by + 4, side: 'S', state: 'unlocked', interior: true },
          { x: bx + 5, y: by + 7, side: 'E', state: 'unlocked', interior: true }
        ],
        stairs
      };
    };

    stampThinWallBuilding(chunk, {
      id,
      name: `${name} (4-Story Tower)`,
      category: 'commercial',
      rooms: rooms1F,
      doorSpecs: doors1F,
      groundStairs: stairs1F,
      extraFloors: {
        1: makeUpperFloor(1, true, true),
        2: makeUpperFloor(2, true, true),
        3: makeUpperFloor(3, false, true)
      },
      seed
    });

    return {
      lootSpots: [
        { x: bx + 7.5, y: by + 2.5, room: 'garage', floor: 0 },
        { x: bx + 8.5, y: by + 2.5, room: 'bedroom', floor: 1 },
        { x: bx + 8.5, y: by + 7.5, room: 'bathroom', floor: 2 },
        { x: bx + 2.5, y: by + 7.5, room: 'garage', floor: 3 }
      ],
      zX: bx + 5.5,
      zY: by + 6.5
    };
  }

  if (tier === 'apartments') {
    const bw = 11;
    const bh = 9;
    const makeAptFloor = (fNum, isGround) => {
      const stairs = [];
      if (fNum > 0) stairs.push({ x: bx + 5, y: by + 1, fromFloor: fNum, toFloor: fNum - 1, dir: 'down' });
      if (fNum < 2) stairs.push({ x: bx + 5, y: by + 7, fromFloor: fNum, toFloor: fNum + 1, dir: 'up' });

      const doorSpecs = [
        { x: bx + 4, y: by + 2, side: 'W', state: 'locked', interior: true },
        { x: bx + 6, y: by + 2, side: 'E', state: 'unlocked', interior: true },
        { x: bx + 4, y: by + 6, side: 'W', state: 'unlocked', interior: true },
        { x: bx + 6, y: by + 6, side: 'E', state: 'locked', interior: true }
      ];
      if (isGround) {
        doorSpecs.unshift({ x: bx + 5, y: by + bh - 1, side: 'S', state: doorState, interior: false });
      }

      return {
        rooms: [
          { name: 'Central Breezeway', type: 'living', x1: bx + 4, y1: by, x2: bx + 6, y2: by + bh - 1 },
          { name: `Apt ${fNum + 1}01`, type: 'bedroom', x1: bx, y1: by, x2: bx + 3, y2: by + 3 },
          { name: `Apt ${fNum + 1}02`, type: 'kitchen', x1: bx + 7, y1: by, x2: bx + bw - 1, y2: by + 3 },
          { name: `Apt ${fNum + 1}03`, type: 'kitchen', x1: bx, y1: by + 4, x2: bx + 3, y2: by + bh - 1 },
          { name: `Apt ${fNum + 1}04`, type: 'bedroom', x1: bx + 7, y1: by + 4, x2: bx + bw - 1, y2: by + bh - 1 }
        ],
        doorSpecs,
        stairs
      };
    };

    const f0 = makeAptFloor(0, true);
    stampThinWallBuilding(chunk, {
      id,
      name: `${name} (3F Apts)`,
      category: 'commercial',
      rooms: f0.rooms,
      doorSpecs: f0.doorSpecs,
      groundStairs: f0.stairs,
      extraFloors: {
        1: makeAptFloor(1, false),
        2: makeAptFloor(2, false)
      },
      seed
    });

    return {
      lootSpots: [
        { x: bx + 1.5, y: by + 1.5, room: 'bedroom', floor: 0 },
        { x: bx + 8.5, y: by + 1.5, room: 'kitchen', floor: 1 },
        { x: bx + 8.5, y: by + 6.5, room: 'bedroom', floor: 2 }
      ],
      zX: bx + 5.5,
      zY: by + 4.5
    };
  }

  if (tier === 'commercial') {
    const bw = 9;
    const bh = 8;
    const rooms = [
      { name: 'Sales Floor', type: 'retail', x1: bx, y1: by + 3, x2: bx + bw - 1, y2: by + bh - 1 },
      { name: 'Stockroom', type: 'shed', x1: bx, y1: by, x2: bx + 5, y2: by + 2 },
      { name: 'Restroom', type: 'bathroom', x1: bx + 6, y1: by, x2: bx + bw - 1, y2: by + 2 }
    ];
    const doorSpecs = [
      { x: bx + 4, y: by + bh - 1, side: 'S', state: doorState, interior: false },
      { x: bx + 2, y: by + 2, side: 'S', state: 'unlocked', interior: true },
      { x: bx + 7, y: by + 2, side: 'S', state: 'unlocked', interior: true }
    ];
    stampThinWallBuilding(chunk, { id, name, category: 'commercial', rooms, doorSpecs, seed });
    return {
      lootSpots: [
        { x: bx + 2.5, y: by + 1.5, room: 'stockroom', floor: 0 },
        { x: bx + 7.5, y: by + 1.5, room: 'bathroom', floor: 0 }
      ],
      zX: bx + 4.5,
      zY: by + 6.5
    };
  }

  if (tier === 'cottage_1br') {
    const rooms = [
      { name: 'Living & Kitchen', type: 'kitchen', x1: bx, y1: by + 3, x2: bx + 6, y2: by + 5 },
      { name: 'Bedroom', type: 'bedroom', x1: bx, y1: by, x2: bx + 3, y2: by + 2 },
      { name: 'Bathroom', type: 'bathroom', x1: bx + 4, y1: by, x2: bx + 6, y2: by + 2 }
    ];
    const doorSpecs = [
      { x: bx + 3, y: by + 5, side: 'S', state: doorState, interior: false },
      { x: bx + 2, y: by + 2, side: 'S', state: 'unlocked', interior: true },
      { x: bx + 5, y: by + 2, side: 'S', state: 'unlocked', interior: true }
    ];
    stampThinWallBuilding(chunk, {
      id,
      name: `${name} (1BR/1BA)`,
      category: 'house',
      rooms,
      doorSpecs,
      seed,
      porchRect: { x1: bx + 2, y1: by + 6, x2: bx + 4, y2: by + 6 }
    });
    return {
      lootSpots: [
        { x: bx + 2.5, y: by + 1.5, room: 'bedroom', floor: 0 },
        { x: bx + 5.5, y: by + 1.5, room: 'bathroom', floor: 0 }
      ],
      zX: bx + 4.5,
      zY: by + 4.5
    };
  }

  if (tier === 'mansion') {
    const rooms1F = [
      { name: 'Grand Foyer & Living', type: 'living', x1: bx + 4, y1: by + 6, x2: bx + 10, y2: by + 11 },
      { name: 'Gourmet Kitchen', type: 'kitchen', x1: bx + 4, y1: by + 3, x2: bx + 10, y2: by + 5 },
      { name: 'Downstairs Suite', type: 'bedroom', x1: bx, y1: by, x2: bx + 4, y2: by + 3 },
      { name: 'Powder Bath', type: 'bathroom', x1: bx, y1: by + 4, x2: bx + 3, y2: by + 6 },
      { name: 'Study', type: 'living', x1: bx + 5, y1: by, x2: bx + 12, y2: by + 2 },
      { name: '2-Car Garage', type: 'garage', x1: bx + 11, y1: by + 4, x2: bx + 14, y2: by + 11 }
    ];
    const doorSpecs1F = [
      { x: bx + 7, y: by + 11, side: 'S', state: doorState, interior: false },
      { x: bx + 12, y: by + 11, side: 'S', state: 'locked', interior: false },
      { x: bx + 7, y: by + 5, side: 'S', state: 'unlocked', interior: true },
      { x: bx + 4, y: by + 2, side: 'E', state: 'unlocked', interior: true },
      { x: bx + 2, y: by + 3, side: 'S', state: 'unlocked', interior: true },
      { x: bx + 8, y: by + 2, side: 'S', state: 'unlocked', interior: true },
      { x: bx + 11, y: by + 8, side: 'W', state: 'unlocked', interior: true }
    ];
    stampThinWallBuilding(chunk, {
      id,
      name: `${name} (4BR/3BA)`,
      category: 'house',
      rooms: rooms1F,
      doorSpecs: doorSpecs1F,
      seed,
      porchRect: { x1: bx + 5, y1: by + 12, x2: bx + 9, y2: by + 12 }
    });
    return {
      lootSpots: [
        { x: bx + 2.5, y: by + 1.5, room: 'bedroom', floor: 0 },
        { x: bx + 12.5, y: by + 8.5, room: 'garage', floor: 0 }
      ],
      zX: bx + 7.5,
      zY: by + 9.5
    };
  }

  // 3BR/2BA Suburban Family Home + Attached Garage
  const rooms1F = [
    { name: 'Living Room', type: 'living', x1: bx, y1: by + 4, x2: bx + 4, y2: by + 8 },
    { name: 'Kitchen & Dining', type: 'kitchen', x1: bx + 5, y1: by + 4, x2: bx + 7, y2: by + 8 },
    { name: 'Master Bedroom', type: 'bedroom', x1: bx, y1: by, x2: bx + 4, y2: by + 3 },
    { name: 'Bath', type: 'bathroom', x1: bx + 5, y1: by, x2: bx + 7, y2: by + 3 },
    { name: 'Garage', type: 'garage', x1: bx + 8, y1: by + 3, x2: bx + 10, y2: by + 8 }
  ];
  const doorSpecs1F = [
    { x: bx + 2, y: by + 8, side: 'S', state: doorState, interior: false },
    { x: bx + 9, y: by + 8, side: 'S', state: 'locked', interior: false },
    { x: bx + 4, y: by + 6, side: 'E', state: 'unlocked', interior: true },
    { x: bx + 2, y: by + 3, side: 'S', state: 'unlocked', interior: true },
    { x: bx + 6, y: by + 3, side: 'S', state: 'unlocked', interior: true },
    { x: bx + 8, y: by + 6, side: 'W', state: 'unlocked', interior: true }
  ];
  stampThinWallBuilding(chunk, {
    id,
    name: `${name} (3BR/2BA)`,
    category: 'house',
    rooms: rooms1F,
    doorSpecs: doorSpecs1F,
    seed,
    porchRect: { x1: bx + 1, y1: by + 9, x2: bx + 3, y2: by + 9 }
  });

  return {
    lootSpots: [
      { x: bx + 2.5, y: by + 1.5, room: 'bedroom', floor: 0 },
      { x: bx + 9.5, y: by + 6.5, room: 'garage', floor: 0 }
    ],
    zX: bx + 3.5,
    zY: by + 7.5
  };
}
