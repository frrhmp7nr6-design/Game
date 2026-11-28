import {
  MAP_SIZE,
  CENTER,
  QUARRY_X,
  QUARRY_Y,
  QUARRY_RX,
  QUARRY_RY,
  getQuarryCenter,
  getTileAt,
  getActiveChunks,
  droppedLoot
} from './chunks.js';

export {
  MAP_SIZE,
  CENTER,
  QUARRY_X,
  QUARRY_Y,
  QUARRY_RX,
  QUARRY_RY,
  getQuarryCenter
};
export const TILE_W = 64;
export const TILE_H = 32;

export const camera = {
  rotation: 0
};

export function rotateCamera() {
  camera.rotation = (camera.rotation + 1) % 4;
  return camera.rotation;
}

export function rotateCoords(wx, wy) {
  const dx = wx - CENTER;
  const dy = wy - CENTER;
  switch (camera.rotation) {
    case 1:
      return { rx: CENTER - dy, ry: CENTER + dx };
    case 2:
      return { rx: CENTER - dx, ry: CENTER - dy };
    case 3:
      return { rx: CENTER + dy, ry: CENTER - dx };
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

export const convoyGarage = {
  x: QUARRY_X - 10.5,
  y: QUARRY_Y - 11.5,
  points: 0,
  targetPoints: 20,
  specialists: 0,
  launched: false
};

export const quarryWorkbench = {
  x: QUARRY_X + 11.5,
  y: QUARRY_Y - 11.5
};

export const quarryCampfire = {
  x: QUARRY_X + 0.5,
  y: QUARRY_Y + 0.5
};

export function syncQuarryLandmarks() {
  const qc = getQuarryCenter();
  convoyGarage.x = qc.x - 10.5;
  convoyGarage.y = qc.y - 11.5;
  quarryWorkbench.x = qc.x + 11.5;
  quarryWorkbench.y = qc.y - 11.5;
  quarryCampfire.x = qc.x + 0.5;
  quarryCampfire.y = qc.y + 0.5;
}

export const policePrecinct = {
  x: 1125.5,
  y: 916.5
};

export const campUpgrades = {
  medicTent: false,
  armory: false,
  watchtower: false
};

const DISTRESS_LOCATIONS = [
  {
    name: 'Mechanic Dale',
    x: 980.5,
    y: 890.5,
    callout: 'Pinned down on Elm Ave in Downtown Rockmart!'
  },
  {
    name: 'Nurse Clara',
    x: 1140.5,
    y: 710.5,
    callout: 'Trapped on Piedmont Blvd near Midtown Pharmacy!'
  },
  {
    name: 'Gunsmith Marcus',
    x: 540.5,
    y: 760.5,
    callout: 'Barricaded along Westfield Rd in Oakridge Suburbs!'
  },
  {
    name: 'Quartermaster Mae',
    x: 920.5,
    y: 515.5,
    callout: 'Holding out at the US-278 Truck Stop!'
  },
  {
    name: 'Engineer Brooks',
    x: 1580.5,
    y: 740.5,
    callout: 'Stranded across the Euharlee River in Eastbrook Suburbs!'
  }
];

export const rescueEvent = {
  active: false,
  id: 0,
  name: 'Mechanic Dale',
  callout: '',
  x: 980.5,
  y: 890.5,
  following: false,
  radioPingTimer: 0
};

export const rescuedSpecialists = [];

export function spawnNextRescueFlare() {
  const id = rescueEvent.id + 1;
  const spot = DISTRESS_LOCATIONS[(id - 1) % DISTRESS_LOCATIONS.length];

  rescueEvent.active = true;
  rescueEvent.id = id;
  rescueEvent.name = spot.name;
  rescueEvent.callout = spot.callout;
  rescueEvent.x = spot.x;
  rescueEvent.y = spot.y;
  rescueEvent.following = false;
  rescueEvent.radioPingTimer = 0;
  return rescueEvent;
}

export function getDoorAt(tx, ty, activeChunks) {
  for (const c of activeChunks) {
    for (const d of c.doors) {
      if (d.x === tx && d.y === ty) return d;
    }
  }
  return null;
}

export function getBuildingAt(wx, wy, activeChunks) {
  const tx = Math.floor(wx);
  const ty = Math.floor(wy);
  const key = `${tx},${ty}`;
  for (const c of activeChunks) {
    for (const b of c.buildings) {
      if (b.cellSet && b.cellSet.has(key)) {
        return b;
      }
      if (tx >= b.x1 && tx <= b.x2 && ty >= b.y1 && ty <= b.y2) {
        return b;
      }
    }
  }
  return null;
}

export function isBuildingRevealed(building, player, activeChunks) {
  if (!building) return true;
  if (building.defaultRevealed) return true;

  const pBldg = getBuildingAt(player.x, player.y, activeChunks);
  if (pBldg && pBldg.id === building.id) return true;

  for (const c of activeChunks) {
    for (const d of c.doors) {
      if (d.buildingId === building.id && d.state === 'open') {
        const mx = d.orient === 'H' ? d.x + 0.5 : d.x;
        const my = d.orient === 'H' ? d.y : d.y + 0.5;
        if (Math.hypot(player.x - mx, player.y - my) < 2.6) {
          return true;
        }
      }
    }
  }
  return false;
}

function isEdgeBlocked(edgeKey, chunks) {
  for (const c of chunks) {
    if (c.edgeWalls && c.edgeWalls.has(edgeKey)) return true;
    if (c.edgeDoors && c.edgeDoors.has(edgeKey)) {
      const door = c.edgeDoors.get(edgeKey);
      if (door && door.state !== 'open') return true;
    }
  }
  return false;
}

function hitsSolidProp(nx, ny, radius, chunks) {
  const r = Math.min(radius, 0.24);
  for (const c of chunks) {
    // 1. Solid interior furniture props inside buildings
    for (const b of c.buildings) {
      if (!b.props) continue;
      for (const p of b.props) {
        if (!p.solid) continue;
        const x1 = p.x;
        const y1 = p.y;
        const x2 = p.x + (p.w || 1);
        const y2 = p.y + (p.d || 1);
        if (nx + r > x1 && nx - r < x2 && ny + r > y1 && ny - r < y2) {
          return true;
        }
      }
    }

    // 2. Solid outdoor props (parked cars, pine/oak trunks, boulders)
    if (c.props) {
      for (const p of c.props) {
        if (!p.solid) continue;
        if (p.kind === 'car') {
          if (nx + r > p.x - 1.0 && nx - r < p.x + 1.0 && ny + r > p.y - 0.55 && ny - r < p.y + 0.55) {
            return true;
          }
        } else {
          // Tree trunk / rock radius
          if (Math.hypot(nx - p.x, ny - p.y) < r + 0.26) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export function isTileBlocked(tx, ty, activeChunks) {
  if (tx < 0 || ty < 0 || tx >= MAP_SIZE || ty >= MAP_SIZE) return true;
  if (getTileAt(tx, ty) === 2) return true;
  return false;
}

export function canWalkTo(nx, ny, radius, activeChunks) {
  const chunks = activeChunks || getActiveChunks(nx, ny, 1);

  // 1. Check solid tile blocks (perimeter walls, river cliff, quarry wall)
  const corners = [
    [nx - radius, ny - radius],
    [nx + radius, ny - radius],
    [nx - radius, ny + radius],
    [nx + radius, ny + radius]
  ];
  for (const [cx, cy] of corners) {
    if (isTileBlocked(Math.floor(cx), Math.floor(cy), chunks)) return false;
  }

  // 2. Check thin edge walls & closed edge doors crossed by the unit's collision circle
  const minTx = Math.floor(nx - radius);
  const maxTx = Math.floor(nx + radius);
  const minTy = Math.floor(ny - radius);
  const maxTy = Math.floor(ny + radius);

  // Vertical edges (x = gridX, spanning [ty, ty + 1])
  for (let gx = minTx + 1; gx <= maxTx; gx++) {
    for (let ty = minTy; ty <= maxTy; ty++) {
      if (isEdgeBlocked(`V:${gx},${ty}`, chunks)) return false;
    }
  }

  // Horizontal edges (y = gridY, spanning [tx, tx + 1])
  for (let gy = minTy + 1; gy <= maxTy; gy++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (isEdgeBlocked(`H:${tx},${gy}`, chunks)) return false;
    }
  }

  // 3. Check solid furniture (beds, counters, sofas, tables, toilets) & outdoor cars/trees
  if (hitsSolidProp(nx, ny, radius, chunks)) return false;

  return true;
}

export function getNearbyLootList(activeChunks) {
  const all = [...droppedLoot];
  for (const c of activeChunks) {
    for (const item of c.loot) all.push(item);
  }
  return all;
}
