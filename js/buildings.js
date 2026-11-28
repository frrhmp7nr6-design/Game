import { openedDoors, doorDamage, lootedIds } from './chunks.js';

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

// Canonical edge key between tile (x,y) and its North or West neighbor so adjacent cells share one thin wall
export function makeEdgeKey(x, y, side) {
  if (side === 'N') return `H:${x},${y}`;
  if (side === 'S') return `H:${x},${y + 1}`;
  if (side === 'W') return `V:${x},${y}`;
  return `V:${x + 1},${y}`; // 'E'
}

export function stampThinWallBuilding(chunk, config) {
  const {
    id,
    name,
    category,
    rooms, // Array of { name, type, x1, y1, x2, y2, floorTile }
    doorSpecs, // Array of { x, y, side: 'N'|'S'|'E'|'W', state: 'unlocked'|'locked'|'barricaded'|'open', interior: boolean }
    seed = 0.5,
    defaultRevealed = false,
    porchRect = null
  } = config;

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

        const lx = x - baseX;
        const ly = y - baseY;
        if (lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE) {
          chunk.tiles[ly * CHUNK_SIZE + lx] = rm.floorTile || 1;
        }
      }
    }
  });

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

  const doorEdgeMap = new Map();
  for (const ds of doorSpecs) {
    const eKey = makeEdgeKey(ds.x, ds.y, ds.side);
    doorEdgeMap.set(eKey, ds);
  }

  const edgeWalls = [];
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

      const eKey = makeEdgeKey(wx, wy, s.side);
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
          orient, // 'H' (along X axis) or 'V' (along Y axis)
          buildingId: id,
          interior: Boolean(doorSpec.interior),
          state: isOpen ? 'open' : doorSpec.state,
          hp: doorDamage.has(eKey) ? doorDamage.get(eKey) : maxHp,
          maxHp
        };
        chunk.doors.push(doorObj);
        chunk.edgeDoors.set(eKey, doorObj);
      } else {
        const hasWindow =
          isExterior &&
          ((orient === 'H' && wx % 2 === 0) || (orient === 'V' && wy % 2 === 1));
        const isBoarded = hasWindow && doorSpecs[0]?.state === 'barricaded';
        const wallObj = {
          key: eKey,
          x: ex,
          y: ey,
          orient,
          isExterior,
          hasWindow,
          isBoarded,
          buildingId: id
        };
        edgeWalls.push(wallObj);
        chunk.edgeWalls.set(eKey, wallObj);
      }
    }
  }

  // Porch & walkway tiles outside main entrance
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

  // Populate room-specific solid furniture props
  const props = [];
  for (const rm of rooms) {
    const rw = rm.x2 - rm.x1 + 1;
    const rh = rm.y2 - rm.y1 + 1;
    if (rm.type === 'bedroom' && rw >= 3 && rh >= 3) {
      props.push({ x: rm.x1 + 0.2, y: rm.y1 + 0.2, w: 1.8, d: 1.8, kind: 'bed', solid: true });
      if (rw >= 4) {
        props.push({ x: rm.x2 - 1.1, y: rm.y1 + 0.2, w: 0.9, d: 1.4, kind: 'dresser', solid: true });
      }
    } else if (rm.type === 'bathroom' && rw >= 2 && rh >= 2) {
      props.push({ x: rm.x1 + 0.2, y: rm.y1 + 0.2, w: 0.8, d: 0.8, kind: 'toilet', solid: true });
      if (rw >= 3) {
        props.push({ x: rm.x2 - 1.2, y: rm.y1 + 0.2, w: 1.0, d: 1.6, kind: 'tub', solid: true });
      }
    } else if (rm.type === 'kitchen' && rw >= 3 && rh >= 3) {
      props.push({ x: rm.x1 + 0.2, y: rm.y1 + 0.2, w: Math.min(2.6, rw - 1.4), d: 0.9, kind: 'counter', solid: true });
      props.push({ x: rm.x2 - 1.1, y: rm.y1 + 0.2, w: 0.9, d: 0.9, kind: 'fridge', solid: true });
      if (rh >= 4) {
        props.push({ x: rm.x1 + 0.8, y: rm.y2 - 1.5, w: 1.6, d: 1.1, kind: 'table', solid: true });
      }
    } else if (rm.type === 'living' && rw >= 4 && rh >= 3) {
      props.push({ x: rm.x1 + 0.4, y: rm.y1 + 0.4, w: 2.2, d: 1.0, kind: 'sofa', solid: true });
      props.push({ x: rm.x1 + 0.8, y: rm.y1 + 1.8, w: 1.4, d: 0.8, kind: 'table', solid: true });
    } else if (rm.type === 'garage' && rw >= 4 && rh >= 4) {
      props.push({ x: rm.x1 + 0.2, y: rm.y1 + 0.2, w: 2.4, d: 0.9, kind: 'workbench', solid: true });
    } else if (rm.type === 'retail' && rw >= 5 && rh >= 5) {
      props.push({ x: rm.x1 + 1.0, y: rm.y1 + 0.5, w: 2.8, d: 0.9, kind: 'counter', solid: true });
      props.push({ x: rm.x1 + 1.0, y: rm.y1 + 2.6, w: 2.6, d: 0.8, kind: 'shelf', solid: true });
      if (rw >= 8) {
        props.push({ x: rm.x2 - 3.6, y: rm.y1 + 2.6, w: 2.6, d: 0.8, kind: 'shelf', solid: true });
      }
    } else if (rm.type === 'shed' && rw >= 3 && rh >= 3) {
      props.push({ x: rm.x1 + 0.2, y: rm.y1 + 0.2, w: 1.8, d: 0.8, kind: 'shelf', solid: true });
    }
  }

  const bldg = {
    id,
    name,
    category,
    rooms,
    rects: rooms.map((r) => ({ x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 })),
    x1: minX,
    y1: minY,
    x2: maxX,
    y2: maxY,
    cellSet,
    edgeWalls,
    props,
    palette,
    roofStyle,
    porchRect,
    defaultRevealed
  };

  chunk.buildings.push(bldg);
  return bldg;
}

// Generates realistic floorplans: 1BR/1BA Cottage, 3BR/2BA Ranch + Garage, Mansion, or Storefront
export function generateFloorplanBuilding(chunk, opts) {
  const { id, name, bx, by, tier, doorState, seed } = opts;

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
        { x: bx + 2.5, y: by + 1.5, room: 'stockroom' },
        { x: bx + 7.5, y: by + 1.5, room: 'bathroom' },
        { x: bx + 4.5, y: by + 5.5, room: 'retail' }
      ],
      zX: bx + 5.5,
      zY: by + 5.5
    };
  }

  if (tier === 'cottage_1br') {
    // 1 Bedroom / 1 Bathroom Starter Cottage (7x6)
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
        { x: bx + 1.5, y: by + 1.5, room: 'bedroom' },
        { x: bx + 5.5, y: by + 1.5, room: 'bathroom' }
      ],
      zX: bx + 4.5,
      zY: by + 4.5
    };
  }

  if (tier === 'mansion') {
    // 4 Bedroom / 3 Bathroom Estate Mansion + 2-Car Garage (15x12)
    const rooms = [
      { name: 'Grand Foyer & Living', type: 'living', x1: bx + 4, y1: by + 6, x2: bx + 10, y2: by + 11 },
      { name: 'Gourmet Kitchen', type: 'kitchen', x1: bx + 4, y1: by + 3, x2: bx + 10, y2: by + 5 },
      { name: 'Master Suite', type: 'bedroom', x1: bx, y1: by, x2: bx + 4, y2: by + 3 },
      { name: 'Master Bath', type: 'bathroom', x1: bx, y1: by + 4, x2: bx + 3, y2: by + 6 },
      { name: 'Guest Bedroom 2', type: 'bedroom', x1: bx + 5, y1: by, x2: bx + 8, y2: by + 2 },
      { name: 'Guest Bedroom 3', type: 'bedroom', x1: bx + 9, y1: by, x2: bx + 12, y2: by + 2 },
      { name: 'Hall Bath', type: 'bathroom', x1: bx + 11, y1: by + 3, x2: bx + 13, y2: by + 5 },
      { name: '2-Car Garage', type: 'garage', x1: bx + 11, y1: by + 6, x2: bx + 14, y2: by + 11 }
    ];
    const doorSpecs = [
      { x: bx + 7, y: by + 11, side: 'S', state: doorState, interior: false },
      { x: bx + 12, y: by + 11, side: 'S', state: 'locked', interior: false },
      { x: bx + 7, y: by + 5, side: 'S', state: 'unlocked', interior: true },
      { x: bx + 4, y: by + 2, side: 'E', state: 'unlocked', interior: true },
      { x: bx + 2, y: by + 3, side: 'S', state: 'unlocked', interior: true },
      { x: bx + 6, y: by + 2, side: 'S', state: 'unlocked', interior: true },
      { x: bx + 10, y: by + 2, side: 'S', state: 'unlocked', interior: true },
      { x: bx + 11, y: by + 4, side: 'W', state: 'unlocked', interior: true },
      { x: bx + 11, y: by + 8, side: 'W', state: 'unlocked', interior: true }
    ];
    stampThinWallBuilding(chunk, {
      id,
      name: `${name} (4BR/3BA)`,
      category: 'house',
      rooms,
      doorSpecs,
      seed,
      porchRect: { x1: bx + 5, y1: by + 12, x2: bx + 9, y2: by + 12 }
    });
    return {
      lootSpots: [
        { x: bx + 1.5, y: by + 1.5, room: 'bedroom' },
        { x: bx + 1.5, y: by + 5.5, room: 'bathroom' },
        { x: bx + 12.5, y: by + 8.5, room: 'garage' }
      ],
      zX: bx + 7.5,
      zY: by + 8.5
    };
  }

  // Default: 3 Bedroom / 2 Bathroom Suburban Family Home + Attached Garage (11x9)
  const rooms = [
    { name: 'Living Room', type: 'living', x1: bx, y1: by + 5, x2: bx + 4, y2: by + 8 },
    { name: 'Kitchen & Dining', type: 'kitchen', x1: bx + 5, y1: by + 5, x2: bx + 7, y2: by + 8 },
    { name: 'Master Bedroom', type: 'bedroom', x1: bx, y1: by, x2: bx + 3, y2: by + 2 },
    { name: 'Master Bath', type: 'bathroom', x1: bx, y1: by + 3, x2: bx + 2, y2: by + 4 },
    { name: 'Bedroom 2', type: 'bedroom', x1: bx + 4, y1: by, x2: bx + 6, y2: by + 2 },
    { name: 'Bedroom 3', type: 'bedroom', x1: bx + 7, y1: by, x2: bx + 9, y2: by + 2 },
    { name: 'Hall Bath', type: 'bathroom', x1: bx + 5, y1: by + 3, x2: bx + 7, y2: by + 4 },
    { name: 'Garage', type: 'garage', x1: bx + 8, y1: by + 4, x2: bx + 10, y2: by + 8 }
  ];
  const doorSpecs = [
    { x: bx + 2, y: by + 8, side: 'S', state: doorState, interior: false },
    { x: bx + 9, y: by + 8, side: 'S', state: 'locked', interior: false },
    { x: bx + 4, y: by + 6, side: 'E', state: 'unlocked', interior: true },
    { x: bx + 3, y: by + 2, side: 'S', state: 'unlocked', interior: true },
    { x: bx + 1, y: by + 2, side: 'S', state: 'unlocked', interior: true },
    { x: bx + 5, y: by + 2, side: 'S', state: 'unlocked', interior: true },
    { x: bx + 8, y: by + 2, side: 'S', state: 'unlocked', interior: true },
    { x: bx + 6, y: by + 4, side: 'S', state: 'unlocked', interior: true },
    { x: bx + 8, y: by + 6, side: 'W', state: 'unlocked', interior: true }
  ];
  stampThinWallBuilding(chunk, {
    id,
    name: `${name} (3BR/2BA)`,
    category: 'house',
    rooms,
    doorSpecs,
    seed,
    porchRect: { x1: bx + 1, y1: by + 9, x2: bx + 3, y2: by + 9 }
  });

  return {
    lootSpots: [
      { x: bx + 1.5, y: by + 1.5, room: 'bedroom' },
      { x: bx + 1.5, y: by + 3.5, room: 'bathroom' },
      { x: bx + 9.5, y: by + 6.5, room: 'garage' }
    ],
    zX: bx + 3.5,
    zY: by + 6.5
  };
}
