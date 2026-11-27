import {
  MAP_SIZE,
  CENTER,
  QUARRY_X,
  QUARRY_Y,
  getTileAt,
  getActiveChunks,
  droppedLoot
} from './chunks.js';

export { MAP_SIZE, CENTER, QUARRY_X, QUARRY_Y };
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

// Iron Convoy Garage inside Rockmart Quarry Hub (509, 598)
export const convoyGarage = {
  x: 509.5,
  y: 598.5,
  points: 0,
  targetPoints: 20,
  specialists: 0,
  launched: false
};

// Quarry Workbench inside Quarry Depot (531, 598)
export const quarryWorkbench = {
  x: 531.5,
  y: 598.5
};

// Central Quarry Campfire
export const quarryCampfire = {
  x: 520.5,
  y: 610.5
};

// Rockmart Police Precinct waypoint (568, 468)
export const policePrecinct = {
  x: 568.5,
  y: 468.5
};

export const campUpgrades = {
  medicTent: false,
  armory: false,
  watchtower: false
};

// Hidden Trapped Survivors — NO automatic minimap icons until a Police Radio picks up their distress call!
const DISTRESS_LOCATIONS = [
  {
    name: 'Mechanic Dale',
    x: 499.5,
    y: 465.5,
    callout: 'Pinned down behind Hometown Pizza on Elm St!'
  },
  {
    name: 'Nurse Clara',
    x: 595.5,
    y: 432.5,
    callout: 'Trapped near N Piedmont Ave & College St!'
  },
  {
    name: 'Gunsmith Marcus',
    x: 432.5,
    y: 518.5,
    callout: 'Hiding in the woods off Morgan Valley Rd!'
  },
  {
    name: 'Quartermaster Mae',
    x: 468.5,
    y: 256.5,
    callout: 'Barricaded near Low True Hardware on US-278!'
  },
  {
    name: 'Engineer Brooks',
    x: 562.5,
    y: 735.5,
    callout: 'Stranded south along Hutchins Mountain Rd!'
  }
];

export const rescueEvent = {
  active: false,
  id: 0,
  name: 'Mechanic Dale',
  callout: '',
  x: 499.5,
  y: 465.5,
  following: false,
  radioPingTimer: 0 // > 0 when Police Radio actively picks up their distress call
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
  for (const c of activeChunks) {
    for (const b of c.buildings) {
      if (tx > b.x1 && tx < b.x2 && ty > b.y1 && ty < b.y2) {
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
        if (Math.hypot(player.x - (d.x + 0.5), player.y - (d.y + 0.5)) < 2.4) {
          return true;
        }
      }
    }
  }
  return false;
}

export function isTileBlocked(tx, ty, activeChunks) {
  if (tx < 0 || ty < 0 || tx >= MAP_SIZE || ty >= MAP_SIZE) return true;
  if (getTileAt(tx, ty) === 2) return true;
  const chunks = activeChunks || getActiveChunks(tx, ty, 0);
  const door = getDoorAt(tx, ty, chunks);
  if (door && door.state !== 'open') return true;
  return false;
}

export function canWalkTo(nx, ny, radius, activeChunks) {
  const corners = [
    [nx - radius, ny - radius],
    [nx + radius, ny - radius],
    [nx - radius, ny + radius],
    [nx + radius, ny + radius]
  ];
  for (const [cx, cy] of corners) {
    if (isTileBlocked(Math.floor(cx), Math.floor(cy), activeChunks)) return false;
  }
  return true;
}

export function getNearbyLootList(activeChunks) {
  const all = [...droppedLoot];
  for (const c of activeChunks) {
    for (const item of c.loot) all.push(item);
  }
  return all;
}
