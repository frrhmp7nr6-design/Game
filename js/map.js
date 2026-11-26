export const TILE_W = 64;
export const TILE_H = 32;
export const MAP_SIZE = 64;

// Camera rotation state: 0 = 0°, 1 = 90° CW, 2 = 180°, 3 = 270° CW
export const camera = {
  rotation: 0
};

export function rotateCamera() {
  camera.rotation = (camera.rotation + 1) % 4;
  return camera.rotation;
}

export function rotateCoords(wx, wy) {
  const cx = MAP_SIZE / 2;
  const cy = MAP_SIZE / 2;
  const dx = wx - cx;
  const dy = wy - cy;
  switch (camera.rotation) {
    case 1:
      return { rx: cx - dy, ry: cy + dx };
    case 2:
      return { rx: cx - dx, ry: cy - dy };
    case 3:
      return { rx: cx + dy, ry: cy - dx };
    default:
      return { rx: wx, ry: wy };
  }
}

export function worldToScreen(wx, wy, camX, camY) {
  const { rx, ry } = rotateCoords(wx, wy);
  return {
    x: (rx - ry) * (TILE_W / 2) + window.innerWidth / 2 - camX,
    y: (rx + ry) * (TILE_H / 2) + window.innerHeight / 2 - camY
  };
}

// Doors registry: state = 'unlocked' | 'locked' | 'barricaded' | 'open'
export const doors = [];

// Buildings registry for interior fog-of-war
export const buildings = [];

function buildBuilding(grid, id, name, x1, y1, x2, y2, doorSpecs) {
  buildings.push({ id, name, x1, y1, x2, y2, discovered: id === 'cabin' });
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const isEdge = x === x1 || x === x2 || y === y1 || y === y2;
      const spec = doorSpecs.find((d) => d.x === x && d.y === y);
      if (spec) {
        grid[y][x] = 1; // Interior floor underneath door
        doors.push({
          x,
          y,
          buildingId: id,
          state: spec.state, // 'unlocked', 'locked', 'barricaded', 'open'
          hp: spec.state === 'barricaded' ? 90 : 60,
          maxHp: spec.state === 'barricaded' ? 90 : 60
        });
      } else if (isEdge) {
        grid[y][x] = 2; // Solid wall
      } else {
        grid[y][x] = 1; // Interior floor
      }
    }
  }
}

export const map = (() => {
  const grid = Array.from({ length: MAP_SIZE }, (_, y) =>
    Array.from({ length: MAP_SIZE }, (_, x) => {
      if (x === 0 || y === 0 || x === MAP_SIZE - 1 || y === MAP_SIZE - 1) return 2;
      if ((y >= 28 && y <= 31) || (x >= 28 && x <= 31)) return 3;
      return 0;
    })
  );

  // 1. Starter Cabin (NW) - unlocked door so player can exit immediately
  buildBuilding(grid, 'cabin', 'Starter Cabin', 4, 4, 12, 11, [
    { x: 8, y: 11, state: 'unlocked' }
  ]);

  // 2. Roadside Gas Station (N-Central) - 1 unlocked front door, 1 locked side door
  buildBuilding(grid, 'gas', 'Gas Station', 19, 18, 26, 25, [
    { x: 22, y: 25, state: 'unlocked' },
    { x: 26, y: 21, state: 'locked' }
  ]);

  // 3. Hardware Store (NE) - 1 barricaded front door, 1 locked side door
  buildBuilding(grid, 'hardware', 'Hardware Store', 40, 10, 51, 19, [
    { x: 45, y: 19, state: 'barricaded' },
    { x: 40, y: 14, state: 'locked' }
  ]);

  // 4. Town Diner (Central-East) - unlocked front, locked kitchen door
  buildBuilding(grid, 'diner', 'Town Diner', 34, 34, 43, 42, [
    { x: 38, y: 34, state: 'unlocked' },
    { x: 34, y: 38, state: 'locked' }
  ]);

  // 5. Police Outpost (SW) - both doors locked (use Lockpicks or smash with Fire Axe/Crowbar)
  buildBuilding(grid, 'police', 'Police Outpost', 10, 42, 20, 51, [
    { x: 15, y: 42, state: 'locked' },
    { x: 20, y: 46, state: 'locked' }
  ]);

  // 6. Evac Radio Tower Compound (SE) - unlocked gate, barricaded east gate
  buildBuilding(grid, 'evac', 'Evac Compound', 46, 46, 58, 58, [
    { x: 46, y: 52, state: 'unlocked' },
    { x: 52, y: 46, state: 'barricaded' }
  ]);

  return grid;
})();

export function getDoorAt(tx, ty) {
  return doors.find((d) => d.x === tx && d.y === ty);
}

// Returns building object if (wx, wy) is strictly inside the interior floor of a building
export function getBuildingAt(wx, wy) {
  const tx = Math.floor(wx);
  const ty = Math.floor(wy);
  for (const b of buildings) {
    if (tx > b.x1 && tx < b.x2 && ty > b.y1 && ty < b.y2) {
      return b;
    }
  }
  return null;
}

// Check if a building's interior should be visible to the player right now
export function isBuildingRevealed(building, player) {
  if (!building) return true;
  // 1. Player is standing inside the building
  const pBldg = getBuildingAt(player.x, player.y);
  if (pBldg && pBldg.id === building.id) return true;

  // 2. Player is standing right in front of an OPEN doorway of this building
  for (const d of doors) {
    if (d.buildingId === building.id && d.state === 'open') {
      if (Math.hypot(player.x - (d.x + 0.5), player.y - (d.y + 0.5)) < 2.3) {
        return true;
      }
    }
  }
  return false;
}

export const radioTower = {
  x: 52.5,
  y: 52.5,
  installedParts: [],
  requiredParts: 4,
  evacTimer: 30,
  evacActive: false,
  complete: false
};

export const worldLoot = [
  // Starter Cabin
  { x: 9.5, y: 7.5, name: 'Crowbar', type: 'weapon', weaponId: 'crowbar', color: '#38bdf8' },
  { x: 6.5, y: 9.5, name: 'Canned Beans', type: 'food', hunger: 35, hp: 5, color: '#f97316' },
  { x: 10.5, y: 9.5, name: 'Lockpick Set', type: 'tool', toolId: 'lockpick', color: '#fbbf24' },

  // Outside near Gas Station
  { x: 17.5, y: 24.5, name: 'Lockpick Set', type: 'tool', toolId: 'lockpick', color: '#fbbf24' },

  // Gas Station Interior (Radio Part #1)
  { x: 22.5, y: 20.5, name: 'Car Battery', type: 'part', color: '#22d3ee' },
  { x: 21.0, y: 23.0, name: 'Energy Bar', type: 'food', hunger: 25, hp: 5, color: '#a855f7' },

  // Hardware Store Interior (Radio Part #2 + Fire Axe)
  { x: 46.5, y: 13.5, name: 'Copper Wiring', type: 'part', color: '#22d3ee' },
  { x: 43.0, y: 15.5, name: 'Fire Axe', type: 'weapon', weaponId: 'axe', color: '#f43f5e' },
  { x: 49.0, y: 16.5, name: 'Bandage', type: 'med', hunger: 0, hp: 40, color: '#f8fafc' },

  // Town Diner Interior (Food & Meds)
  { x: 38.5, y: 38.5, name: 'MRE Pack', type: 'food', hunger: 55, hp: 10, color: '#eab308' },
  { x: 40.5, y: 36.5, name: 'Canned Soup', type: 'food', hunger: 40, hp: 8, color: '#f97316' },
  { x: 36.5, y: 40.0, name: 'First Aid Kit', type: 'med', hunger: 0, hp: 65, color: '#f8fafc' },
  { x: 35.5, y: 36.0, name: 'Lockpick Set', type: 'tool', toolId: 'lockpick', color: '#fbbf24' },

  // Police Outpost Interior (Radio Part #3 + 9mm Pistol)
  { x: 14.5, y: 47.5, name: 'Transistor Board', type: 'part', color: '#22d3ee' },
  { x: 17.5, y: 45.5, name: '9mm Pistol', type: 'weapon', weaponId: 'pistol', color: '#94a3b8' },
  { x: 12.5, y: 45.0, name: 'MRE Pack', type: 'food', hunger: 55, hp: 10, color: '#eab308' },

  // South-Central Roadside (Radio Part #4)
  { x: 30.5, y: 49.5, name: 'Spark Plugs', type: 'part', color: '#22d3ee' },
  { x: 29.5, y: 48.0, name: 'Apple', type: 'food', hunger: 22, hp: 5, color: '#ef4444' },

  // Evac Compound Interior Supplies
  { x: 55.5, y: 49.5, name: 'Bandage', type: 'med', hunger: 0, hp: 40, color: '#f8fafc' },
  { x: 49.5, y: 55.5, name: 'Canned Beans', type: 'food', hunger: 35, hp: 5, color: '#f97316' }
];

export function isTileBlocked(tx, ty) {
  if (ty < 0 || ty >= MAP_SIZE || tx < 0 || tx >= MAP_SIZE) return true;
  if (map[ty][tx] === 2) return true;
  const door = getDoorAt(tx, ty);
  if (door && door.state !== 'open') return true;
  return false;
}

export function canWalkTo(nx, ny, radius) {
  const corners = [
    [nx - radius, ny - radius],
    [nx + radius, ny - radius],
    [nx - radius, ny + radius],
    [nx + radius, ny + radius]
  ];
  for (const [cx, cy] of corners) {
    if (isTileBlocked(Math.floor(cx), Math.floor(cy))) return false;
  }
  return true;
}
