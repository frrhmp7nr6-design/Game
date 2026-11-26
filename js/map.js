export const TILE_W = 64;
export const TILE_H = 32;
export const MAP_SIZE = 28;

// 0 = grass, 1 = concrete floor, 2 = wall
export const map = Array.from({ length: MAP_SIZE }, (_, y) =>
  Array.from({ length: MAP_SIZE }, (_, x) => {
    if (x === 0 || y === 0 || x === MAP_SIZE - 1 || y === MAP_SIZE - 1) return 2;

    // Starter cabin (x: 8..15, y: 8..14) with doorway at (11, 14)
    if (x >= 8 && x <= 15 && y >= 8 && y <= 14) {
      const isEdge = x === 8 || x === 15 || y === 8 || y === 14;
      if (isEdge && !(x === 11 && y === 14)) return 2;
      return 1;
    }

    // Fenced compound (x: 18..23, y: 5..10) with opening at (18, 7)
    if (x >= 18 && x <= 23 && y >= 5 && y <= 10) {
      const isEdge = x === 18 || x === 23 || y === 5 || y === 10;
      if (isEdge && !(x === 18 && y === 7)) return 2;
      return 1;
    }

    return 0;
  })
);

export const worldLoot = [
  { x: 6.5, y: 6.5, name: 'Canned Beans', type: 'food', hunger: 35, hp: 5, color: '#f97316' },
  { x: 10.5, y: 10.5, name: 'MRE Pack', type: 'food', hunger: 50, hp: 10, color: '#eab308' },
  { x: 13.5, y: 12.5, name: 'Apple', type: 'food', hunger: 20, hp: 5, color: '#ef4444' },
  { x: 12.5, y: 9.5, name: 'Bandage', type: 'med', hunger: 0, hp: 35, color: '#f8fafc' },
  { x: 20.5, y: 7.5, name: 'Canned Soup', type: 'food', hunger: 40, hp: 8, color: '#f97316' },
  { x: 21.5, y: 8.5, name: 'Scrap Wood', type: 'mat', hunger: 0, hp: 0, color: '#a16207' },
  { x: 15.5, y: 21.5, name: 'Energy Bar', type: 'food', hunger: 25, hp: 5, color: '#a855f7' },
  { x: 5.5, y: 19.5, name: 'Wild Berries', type: 'food', hunger: 18, hp: 4, color: '#ec4899' }
];

export function worldToScreen(wx, wy, camX, camY) {
  return {
    x: (wx - wy) * (TILE_W / 2) + window.innerWidth / 2 - camX,
    y: (wx + wy) * (TILE_H / 2) + window.innerHeight / 2 - camY
  };
}

export function canWalkTo(nx, ny, radius) {
  const corners = [
    [nx - radius, ny - radius],
    [nx + radius, ny - radius],
    [nx - radius, ny + radius],
    [nx + radius, ny + radius]
  ];
  for (const [cx, cy] of corners) {
    const tx = Math.floor(cx);
    const ty = Math.floor(cy);
    if (ty < 0 || ty >= MAP_SIZE || tx < 0 || tx >= MAP_SIZE) return false;
    if (map[ty][tx] === 2) return false;
  }
  return true;
}

