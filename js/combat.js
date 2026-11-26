import { map, MAP_SIZE, worldToScreen } from './map.js';

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
    cooldown: 0.75,
    arc: 0.72,
    staminaCost: 7
  },
  pistol: {
    name: '9mm Pistol',
    type: 'ranged',
    range: 7.2,
    damage: 45,
    cooldown: 0.55,
    arc: 0.42,
    staminaCost: 1
  }
};

export const zombies = [
  { id: 1, x: 11.5, y: 11.5, hp: 100, maxHp: 100, speed: 1.85, attackCd: 0, hitFlash: 0 },
  { id: 2, x: 19.5, y: 8.5, hp: 100, maxHp: 100, speed: 2.0, attackCd: 0, hitFlash: 0 },
  { id: 3, x: 14.5, y: 20.5, hp: 100, maxHp: 100, speed: 1.75, attackCd: 0, hitFlash: 0 },
  { id: 4, x: 6.5, y: 18.5, hp: 100, maxHp: 100, speed: 1.9, attackCd: 0, hitFlash: 0 },
  { id: 5, x: 22.5, y: 18.5, hp: 100, maxHp: 100, speed: 2.1, attackCd: 0, hitFlash: 0 }
];

// Visual tracers & melee slash arcs
export const fxList = [];

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Ray-march check so you don't shoot or swing through solid walls
export function hasLineOfSight(x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(dist * 4);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor(x1 + (x2 - x1) * t);
    const ty = Math.floor(y1 + (y2 - y1) * t);
    if (tx >= 0 && tx < MAP_SIZE && ty >= 0 && ty < MAP_SIZE) {
      if (map[ty][tx] === 2) return false;
    }
  }
  return true;
}

function canZombieWalkTo(nx, ny) {
  const r = 0.26;
  const corners = [
    [nx - r, ny - r],
    [nx + r, ny - r],
    [nx - r, ny + r],
    [nx + r, ny + r]
  ];
  for (const [cx, cy] of corners) {
    const tx = Math.floor(cx);
    const ty = Math.floor(cy);
    if (ty < 0 || ty >= MAP_SIZE || tx < 0 || tx >= MAP_SIZE) return false;
    if (map[ty][tx] === 2) return false;
  }
  return true;
}

export function updateCombat(dt, player) {
  // Decay active visual effects
  for (let i = fxList.length - 1; i >= 0; i--) {
    fxList[i].life -= dt;
    if (fxList[i].life <= 0) fxList.splice(i, 1);
  }

  player.attackTimer = Math.max(0, player.attackTimer - dt);
  const weapon = WEAPONS[player.equippedWeapon] || WEAPONS.fists;

  // 1. Auto-target closest zombie inside vision cone & weapon range
  if (player.attackTimer === 0 && player.stamina >= weapon.staminaCost) {
    let bestTarget = null;
    let bestDist = Infinity;

    const pScreen = worldToScreen(player.x, player.y, 0, 0);

    for (const z of zombies) {
      const dist = Math.hypot(z.x - player.x, z.y - player.y);
      if (dist > weapon.range) continue;

      // Compare screen-space angle to player's vision cone angle
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
      bestTarget.hitFlash = 0.14;
      player.attackTimer = weapon.cooldown;
      player.stamina = Math.max(0, player.stamina - weapon.staminaCost);

      // Knockback slightly
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
        life: 0.14,
        maxLife: 0.14
      });
    }
  }

  // 2. Update zombies (death cleanup, chasing, melee bite)
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    z.hitFlash = Math.max(0, z.hitFlash - dt);
    z.attackCd = Math.max(0, z.attackCd - dt);

    if (z.hp <= 0) {
      zombies.splice(i, 1);
      continue;
    }

    const dist = Math.hypot(player.x - z.x, player.y - z.y);

    // Aggro if within 7.5 tiles and has line of sight
    if (dist < 7.5 && dist > 0.72 && hasLineOfSight(z.x, z.y, player.x, player.y)) {
      const ang = Math.atan2(player.y - z.y, player.x - z.x);
      const vx = Math.cos(ang) * z.speed * dt;
      const vy = Math.sin(ang) * z.speed * dt;
      if (canZombieWalkTo(z.x + vx, z.y)) z.x += vx;
      if (canZombieWalkTo(z.x, z.y + vy)) z.y += vy;
    }

    // Bite player if within melee reach
    if (dist <= 0.85 && z.attackCd === 0) {
      player.hp = Math.max(0, player.hp - 12);
      z.attackCd = 1.15;
    }
  }
}
