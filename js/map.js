import {
  MAP_SIZE,
  CENTER,
  getTileAt,
  getActiveChunks,
  droppedLoot
} from './chunks.js';

export { MAP_SIZE, CENTER };
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
  x: 501.5,
  y: 501.5,
  points: 0,
  targetPoints: 20,
  specialists: 0,
  launched: false
};

export const quarryWorkbench = {
  x: 523.5,
  y: 500.5
};

export const quarryCampfire = {
  x: 512.5,
  y: 512.5
};

export const campUpgrades = {
  medicTent: false,
  armory: false,
  watchtower: false
};

const SPECIALIST_ROLES = [
  'Mechanic Dale',
  'Nurse Clara',
  'Gunsmith Marcus',
  'Quartermaster Mae',
  'Engineer Brooks',
  'Scout Elena'
];

export const rescueEvent = {
  active: false,
  id: 0,
  name: 'Mechanic Dale',
  x: 540.5,
  y: 430.5,
  following: false
};

export const rescuedSpecialists = [];

export function spawnNextRescueFlare() {
  const id = rescueEvent.id + 1;
  const angle = Math.random() * Math.PI * 2;
  const dist = 85 + Math.random() * 80;
  let fx = Math.round(CENTER + Math.cos(angle) * dist) + 0.5;
  let fy = Math.round(CENTER + Math.sin(angle) * dist) + 0.5;

  for (let tries = 0; tries < 12; tries++) {
    if (getTileAt(Math.floor(fx), Math.floor(fy)) !== 2) break;
    fx += 1;
  }

  rescueEvent.active = true;
  rescueEvent.id = id;
  rescueEvent.name = SPECIALIST_ROLES[(id - 1) % SPECIALIST_ROLES.length];
  rescueEvent.x = fx;
  rescueEvent.y = fy;
  rescueEvent.following = false;
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
