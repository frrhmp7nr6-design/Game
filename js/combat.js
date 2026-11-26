import { map, MAP_SIZE, worldToScreen, isTileBlocked } from './map.js';

export const WEAPONS = {
  fists: {
    name: 'Fists',
    type: 'melee',
    range: 1.45,
    damage: 14,
    cooldown: 0.65,
    arc: 0.65,
    staminaCost: 4
  },
  crowbar: {
    name: 'Crowbar',
    type: 'melee',
    range: 1.9,
    damage: 34,
    cooldown: 0.72,
    arc: 0.72,
    staminaCost: 7
  },
  axe: {
    name: 'Fire Axe',
    type: 'melee',
    range: 2.15,
    damage: 55,
    cooldown: 0.85,
    arc: 0.78,
    staminaCost: 10
  },
  pistol: {
    name: '9mm Pistol',
    type: 'ranged',
    range: 7.5,
    damage: 48,
    cooldown: 0.52,
    arc: 0.42,
    staminaCost: 1
  }
};

export const zombies = [
  // Outside starter cabin & north road
  { id: 1, x: 14.5, y: 12.5, hp: 100, maxHp: 100, speed: 1.85, attackCd: 0, hitFlash: 0, lungeTimer: 0, facing: 2.2, walkPhase: 0, wanderAng: 2.2, turnTimer: 1.2, aggro: false },
  { id: 2, x: 17.5, y: 22.5, hp: 100, maxHp: 100, speed: 1.85, attackCd: 0, hitFlash: 0, lungeTimer: 0, facing: 3.1, walkPhase: 1, wanderAng: 3.1, turnTimer: 0.8, aggro: false },
  // Inside Gas Station (hidden until door opened!)
  { id: 3, x: 23.5, y: 21.5, hp: 100, maxHp: 100, speed: 1.9, attackCd: 0, hitFlash: 0, lungeTimer: 0, facing: 0.4, walkPhase: 2, wanderAng: 0.4, turnTimer: 1.5, aggro: false },

  // Main street intersection
  { id: 4, x: 29.5, y: 29.5, hp: 100, maxHp: 100, speed: 1.95, attackCd: 0, hitFlash: 0, lungeTimer: 0, facing: 2.2, walkPhase: 0.5, wanderAng: 2.2, turnTimer: 1.0, aggro: false },
  { id: 5, x: 31.5, y: 26.5, hp: 100, maxHp: 100, speed: 1.85, attackCd: 0, hitFlash: 0, lungeTimer: 0, facing: 4.5, walkPhase: 1.5, wanderAng: 4.5, turnTimer: 1.7, aggro: false },

  // Hardware store (1 outside, 1 ambush inside!)
  { id: 6, x: 38.5, y: 16.5, hp: 100, maxHp: 100, speed: 1.85, attackCd: 0, hitFlash: 0, lungeTimer: 0, facing: 0.9, walkPhase: 1.8, wanderAng: 0.9, turnTimer: 0.9, aggro: false },
  { id: 7, x: 47.5, y: 14.5, hp: 110, maxHp: 110, speed: 1.95, attackCd: 0, hitFlash: 0, lungeTimer: 0, facing: 5.0, walkPhase: 0.2, wanderAng: 5.0, turnTimer: 1.4, aggro: false },

  // Diner (1 inside kitchen, 1 outside)
  { id: 8, x: 39.5, y: 38.5, hp: 100, maxHp: 100, speed: 1.9, attackCd: 0, hitFlash: 0, lungeTimer: 0, facing: 3.3, walkPhase: 2.2, wanderAng: 3.3, turnTimer: 1.3, aggro: false },
  { id: 9, x: 32.5, y: 36.5, hp: 100, maxHp: 100, speed: 1.95, attackCd: 0, hitFlash: 0, lungeTimer: 0, facing: 1.1, walkPhase: 0.7, wanderAng: 1.1, turnTimer: 1.6, aggro: false },

  // Police outpost (1 inside cellblock, 2 outside)
  { id: 10, x: 15.5, y: 46.5, hp: 120, maxHp: 120, speed: 2.05, attackCd: 0, hitFlash: 0, lungeTimer: 0, facing: 2.7, walkPhase: 1.1, wanderAng: 2.7, turnTimer: 1.2, aggro: false },
  { id: 11, x: 22.5, y: 44.5, hp: 100, maxHp: 100, speed: 1.9, attackCd: 0, hitFlash: 0, lungeTimer: 0, facing: 0.2, walkPhase: 0.4, wanderAng: 0.2, turnTimer: 1.5, aggro: false },

  // South road & Evac perimeter
  { id: 12, x: 30.5, y: 46.5, hp: 100, maxHp: 100, speed: 2.0, attackCd: 0, hitFlash: 0, lungeTimer: 0, facing: 3.9, walkPhase: 1.4, wanderAng: 3.9, turnTimer: 1.1, aggro: false },
  { id: 13, x: 44.5, y: 50.5, hp: 110, maxHp: 110, speed: 2.05, attackCd: 0, hitFlash: 0, lungeTimer: 0, facing: 2.4, walkPhase: 2.1, wanderAng: 2.4, turnTimer: 1.3, aggro: false },
  { id: 14, x: 54.5, y: 54.5, hp: 110, maxHp: 110, speed: 2.0, attackCd: 0, hitFlash: 0, lungeTimer: 0, facing: 5.5, walkPhase: 0.9, wanderAng: 5.5, turnTimer: 1.0, aggro: false }
];

export const fxList = [];

let nextWaveId = 100;
export function spawnEvacHorde() {
  const spawnPoints = [
    [47.5, 52.5],
    [52.5, 47.5],
    [48.5, 48.5],
    [56.5, 52.5]
  ];
  for (const [sx, sy] of spawnPoints) {
    zombies.push({
      id: nextWaveId++,
      x: sx,
      y: sy,
      hp: 100,
      maxHp: 100,
      speed: 2.2,
      attackCd: 0,
      hitFlash: 0,
      lungeTimer: 0,
      facing: 0,
      walkPhase: 0,
      wanderAng: 0,
      turnTimer: 1,
      aggro: true,
      forcedAggro: true
    });
  }
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Blocked by both solid walls AND closed doors
export function hasLineOfSight(x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(dist * 4);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor(x1 + (x2 - x1) * t);
    const ty = Math.floor(y1 + (y2 - y1) * t);
    if (isTileBlocked(tx, ty)) return false;
  }
  return true;
}

function canZombieWalkTo(nx, ny) {
  const r = 0.25;
  const corners = [
    [nx - r, ny - r],
    [nx + r, ny - r],
    [nx - r, ny + r],
    [nx + r, ny + r]
  ];
  for (const [cx, cy] of corners) {
    if (isTileBlocked(Math.floor(cx), Math.floor(cy))) return false;
  }
  return true;
}

export function updateCombat(dt, player) {
  player.hurtFlash = Math.max(0, (player.hurtFlash || 0) - dt);

  for (let i = fxList.length - 1; i >= 0; i--) {
    fxList[i].life -= dt;
    if (fxList[i].life <= 0) fxList.splice(i, 1);
  }

  player.attackTimer = Math.max(0, player.attackTimer - dt);
  const weapon = WEAPONS[player.equippedWeapon] || WEAPONS.fists;

  // Player auto-attack inside vision cone
  if (player.attackTimer === 0 && player.stamina >= weapon.staminaCost) {
    let bestTarget = null;
    let bestDist = Infinity;
    const pScreen = worldToScreen(player.x, player.y, 0, 0);

    for (const z of zombies) {
      const dist = Math.hypot(z.x - player.x, z.y - player.y);
      if (dist > weapon.range) continue;

      const zScreen = worldToScreen(z.x, z.y, 0, 0);
      const angleToZ = Math.atan2(zScreen.y - pScreen.y, zScreen.x - pScreen.x);
      const angleDiff = Math.abs(normalizeAngle(angleToZ - player.angle));

      if (angleDiff <= weapon.arc && hasLineOfSight(player.x, player.y, z.x, z.y)) {
        if (dist < bestDist) {
          bestDist = dist;
          bestTarget = z;
        }
      }
    }

    if (bestTarget) {
      bestTarget.hp -= weapon.damage;
      bestTarget.hitFlash = 0.16;
      player.attackTimer = weapon.cooldown;
      player.stamina = Math.max(0, player.stamina - weapon.staminaCost);

      const kbAngle = Math.atan2(bestTarget.y - player.y, bestTarget.x - player.x);
      const kbDist = weapon.type === 'melee' ? 0.35 : 0.15;
      const kx = bestTarget.x + Math.cos(kbAngle) * kbDist;
      const ky = bestTarget.y + Math.sin(kbAngle) * kbDist;
      if (canZombieWalkTo(kx, ky)) {
        bestTarget.x = kx;
        bestTarget.y = ky;
      }

      fxList.push({
        type: weapon.type,
        fromX: player.x,
        fromY: player.y,
        toX: bestTarget.x,
        toY: bestTarget.y,
        angle: player.angle,
        life: 0.16,
        maxLife: 0.16
      });
    }
  }

  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    z.hitFlash = Math.max(0, z.hitFlash - dt);
    z.attackCd = Math.max(0, z.attackCd - dt);
    z.lungeTimer = Math.max(0, z.lungeTimer - dt);

    if (z.hp <= 0) {
      zombies.splice(i, 1);
      continue;
    }

    const dist = Math.hypot(player.x - z.x, player.y - z.y);
    const sightRange = z.forcedAggro ? 24 : 8.5;
    // Zombies only chase if they have line-of-sight (so closed doors hold them back!)
    const canSee =
      z.forcedAggro || (dist < sightRange && hasLineOfSight(z.x, z.y, player.x, player.y));

    z.aggro = canSee;

    if (canSee) {
      const ang = Math.atan2(player.y - z.y, player.x - z.x);
      z.facing = ang;
      if (dist > 0.72) {
        z.walkPhase += dt * 13;
        const vx = Math.cos(ang) * z.speed * dt;
        const vy = Math.sin(ang) * z.speed * dt;
        if (canZombieWalkTo(z.x + vx, z.y)) z.x += vx;
        if (canZombieWalkTo(z.x, z.y + vy)) z.y += vy;
      }
    } else {
      z.turnTimer -= dt;
      if (z.turnTimer <= 0) {
        z.wanderAng += (Math.random() - 0.5) * 2.4;
        z.turnTimer = 1.2 + Math.random() * 1.4;
      }
      z.facing = z.wanderAng;
      z.walkPhase += dt * 8;
      const vx = Math.cos(z.wanderAng) * 1.05 * dt;
      const vy = Math.sin(z.wanderAng) * 1.05 * dt;

      let blocked = false;
      if (canZombieWalkTo(z.x + vx, z.y)) z.x += vx;
      else blocked = true;
      if (canZombieWalkTo(z.x, z.y + vy)) z.y += vy;
      else blocked = true;

      if (blocked) {
        z.wanderAng += Math.PI * 0.75;
        z.turnTimer = 1.0;
      }
    }

    if (dist <= 0.92 && z.attackCd === 0 && hasLineOfSight(z.x, z.y, player.x, player.y)) {
      player.hp = Math.max(0, player.hp - 12);
      player.hurtFlash = 0.35;
      z.attackCd = 1.1;
      z.lungeTimer = 0.25;
      z.facing = Math.atan2(player.y - z.y, player.x - z.x);

      fxList.push({
        type: 'bite',
        fromX: z.x,
        fromY: z.y,
        toX: player.x,
        toY: player.y,
        life: 0.45,
        maxLife: 0.45
      });
    }
  }
}
