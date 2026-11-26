export const TILE_W = 64;
export const TILE_H = 32;
export const MAP_SIZE = 64;

// Tile types:
// 0 = grass, 1 = concrete/interior floor, 2 = wall, 3 = asphalt road
function buildBuilding(grid, x1, y1, x2, y2, doors) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const isEdge = x === x1 || x === x2 || y === y1 || y === y2;
      const isDoor = doors.some(([dx, dy]) => dx === x && dy === y);
      if (isEdge && !isDoor) grid[y][x] = 2;
      else grid[y][x] = 1;
    }
  }
}

export const map = (() => {
  const grid = Array.from({ length: MAP_SIZE }, (_, y) =>
    Array.from({ length: MAP_SIZE }, (_, x) => {
      if (x === 0 || y === 0 || x === MAP_SIZE - 1 || y === MAP_SIZE - 1) return 2;
      // Cross-town asphalt roads
      if ((y >= 28 && y <= 31) || (x >= 28 && x <= 31)) return 3;
      return 0;
    })
  );

  // 1. Starter Cabin (NW: x 4..12, y 4..11)
  buildBuilding(grid, 4, 4, 12, 11, [[8, 11]]);

  // 2. Roadside Gas Station / Garage (N-Central: x 19..26, y 18..25)
  buildBuilding(grid, 19, 18, 26, 25, [[22, 25], [26, 21]]);

  // 3. Hardware Store (NE: x 40..51, y 10..19)
  buildBuilding(grid, 40, 10, 51, 19, [[45, 19], [40, 14]]);

  // 4. Town Diner (Central-East: x 34..43, y 34..42)
  buildBuilding(grid, 34, 34, 43, 42, [[38, 34], [34, 38]]);

  // 5. Police Outpost (SW: x 10..20, y 42..51)
  buildBuilding(grid, 10, 42, 20, 51, [[15, 42], [20, 46]]);

  // 6. Evac Radio Tower Compound (SE: x 46..58, y 46..58)
  buildBuilding(grid, 46, 46, 58, 58, [[46, 52], [52, 46]]);

  return grid;
})();

// Extraction Objective State
export const radioTower = {
  x: 52.5,
  y: 52.5,
  installedParts: [],
  requiredParts: 4,
  evacTimer: 30, // 30s holdout once fully repaired
  evacActive: false,
  complete: false
};

// Scattered loot: 4 Radio Parts + Weapons + Food + Meds
export const worldLoot = [
  // Starter Area
  { x: 9.5, y: 7.5, name: 'Crowbar', type: 'weapon', weaponId: 'crowbar', color: '#38bdf8' },
  { x: 6.5, y: 9.5, name: 'Canned Beans', type: 'food', hunger: 35, hp: 5, color: '#f97316' },

  // Gas Station (Radio Part #1)
  { x: 22.5, y: 20.5, name: 'Car Battery', type: 'part', color: '#22d3ee' },
  { x: 21.0, y: 23.0, name: 'Energy Bar', type: 'food', hunger: 25, hp: 5, color: '#a855f7' },

  // Hardware Store (Radio Part #2 + Fire Axe)
  { x: 46.5, y: 13.5, name: 'Copper Wiring', type: 'part', color: '#22d3ee' },
  { x: 43.0, y: 15.5, name: 'Fire Axe', type: 'weapon', weaponId: 'axe', color: '#f43f5e' },
  { x: 49.0, y: 16.5, name: 'Bandage', type: 'med', hunger: 0, hp: 40, color: '#f8fafc' },

  // Town Diner (Food & Meds)
  { x: 38.5, y: 38.5, name: 'MRE Pack', type: 'food', hunger: 55, hp: 10, color: '#eab308' },
  { x: 40.5, y: 36.5, name: 'Canned Soup', type: 'food', hunger: 40, hp: 8, color: '#f97316' },
  { x: 36.5, y: 40.0, name: 'First Aid Kit', type: 'med', hunger: 0, hp: 65, color: '#f8fafc' },

  // Police Outpost (Radio Part #3 + 9mm Pistol)
  { x: 14.5, y: 47.5, name: 'Transistor Board', type: 'part', color: '#22d3ee' },
  { x: 17.5, y: 45.5, name: '9mm Pistol', type: 'weapon', weaponId: 'pistol', color: '#94a3b8' },
  { x: 12.5, y: 45.0, name: 'MRE Pack', type: 'food', hunger: 55, hp: 10, color: '#eab308' },

  // South-Central Warehouse / Roadside (Radio Part #4)
  { x: 30.5, y: 49.5, name: 'Spark Plugs', type: 'part', color: '#22d3ee' },
  { x: 29.5, y: 48.0, name: 'Apple', type: 'food', hunger: 22, hp: 5, color: '#ef4444' },

  // Evac Compound Supplies
  { x: 55.5, y: 49.5, name: 'Bandage', type: 'med', hunger: 0, hp: 40, color: '#f8fafc' },
  { x: 49.5, y: 55.5, name: 'Canned Beans', type: 'food', hunger: 35, hp: 5, color: '#f97316' }
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
