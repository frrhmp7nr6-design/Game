import { worldToScreen, isTileBlocked, CENTER } from './map.js';
import { killedZombieIds } from './chunks.js';
import { broadcastWorldEvent } from './net.js';

export const WEAPONS = {
  fists: {
    name: 'Fists',
    type: 'melee',
    range: 1.5,
    damage: 16,
    cooldown: 0.62,
    arc: 0.65,
    staminaCost: 4
  },
  crowbar: {
    name: 'Crowbar',
    type: 'melee',
    range: 1.95,
    damage: 36,
    cooldown: 0.7,
    arc: 0.72,
    staminaCost: 7
  },
  axe: {
    name: 'Fire Axe',
    type: 'melee',
    range: 2.2,
    damage: 58,
    cooldown: 0.84,
    arc: 0.78,
    staminaCost: 10
  },
  pistol: {
    name: '9mm Pistol',
    type: 'ranged',
    range: 7.8,
    damage: 50,
    cooldown: 0.5,
    arc: 0.42,
    staminaCost: 1
  }
};

export const fxList = [];

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function hasLineOfSight(x1, y1, x2, y2, activeChunks) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(dist * 3);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor(x1 + (x2 - x1) * t);
    const ty = Math.floor(y1 + (y2 - y1) * t);
    if (isTileBlocked(tx, ty, activeChunks)) return false;
  }
  return true;
}

function canZombieWalkTo(nx, ny, activeChunks) {
  if (Math.abs(nx - CENTER) <= 64 && Math.abs(ny - CENTER) <= 64) return false;

  const r = 0.25;
  const corners = [
    [nx - r, ny - r],
    [nx + r, ny - r],
    [nx - r, ny + r],
    [nx + r, ny + r]
  ];
  for (const [cx, cy] of corners) {
    if (isTileBlocked(Math.floor(cx), Math.floor(cy), activeChunks)) return false;
  }
  return true;
}

export function getActiveZombies(activeChunks) {
  const list = [];
  for (const c of activeChunks) {
    for (const z of c.zombies) {
      if (!killedZombieIds.has(z.id)) list.push(z);
    }
  }
  return list;
}

export function updateCombat(dt, player, activeChunks) {
  player.hurtFlash = Math.max(0, (player.hurtFlash || 0) - dt);

  for (let i = fxList.length - 1; i >= 0; i--) {
    fxList[i].life -= dt;
    if (fxList[i].life <= 0) fxList.splice(i, 1);
  }

  player.attackTimer = Math.max(0, player.attackTimer - dt);
  const weapon = WEAPONS[player.equippedWeapon] || WEAPONS.fists;
  const effectiveRange =
    weapon.type === 'ranged' && player.archetype === 'marksman' ? weapon.range * 1.25 : weapon.range;

  const activeZombies = getActiveZombies(activeChunks);

  if (player.attackTimer === 0 && player.stamina >= weapon.staminaCost) {
    let bestTarget = null;
    let bestDist = Infinity;
    const pScreen = worldToScreen(player.x, player.y, 0, 0);

    for (const z of activeZombies) {
      const dist = Math.hypot(z.x - player.x, z.y - player.y);
      if (dist > effectiveRange) continue;

      const zScreen = worldToScreen(z.x, z.y, 0, 0);
      const angleToZ = Math.atan2(zScreen.y - pScreen.y, zScreen.x - pScreen.x);
      const angleDiff = Math.abs(normalizeAngle(angleToZ - player.angle));

      if (angleDiff <= weapon.arc && hasLineOfSight(player.x, player.y, z.x, z.y, activeChunks)) {
        if (dist < bestDist) {
          bestDist = dist;
          bestTarget = z;
        }
      }
    }

    if (bestTarget) {
      let dmg = weapon.damage;
      if (weapon.type === 'melee' && player.archetype === 'bruiser') dmg = Math.round(dmg * 1.35);
      if (weapon.type === 'ranged' && player.archetype === 'marksman') dmg = Math.round(dmg * 1.25);

      bestTarget.hp -= dmg;
      bestTarget.hitFlash = 0.16;
      player.attackTimer = weapon.cooldown;
      player.stamina = Math.max(0, player.stamina - weapon.staminaCost);

      const kbAngle = Math.atan2(bestTarget.y - player.y, bestTarget.x - player.x);
      const kbBase = weapon.type === 'melee' ? 0.35 : 0.15;
      const kbDist = player.archetype === 'bruiser' ? kbBase * 1.4 : kbBase;
      const kx = bestTarget.x + Math.cos(kbAngle) * kbDist;
      const ky = bestTarget.y + Math.sin(kbAngle) * kbDist;
      if (canZombieWalkTo(kx, ky, activeChunks)) {
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

  for (const c of activeChunks) {
    for (let i = c.zombies.length - 1; i >= 0; i--) {
      const z = c.zombies[i];
      z.hitFlash = Math.max(0, z.hitFlash - dt);
      z.attackCd = Math.max(0, z.attackCd - dt);
      z.lungeTimer = Math.max(0, z.lungeTimer - dt);

      if (z.hp <= 0 || killedZombieIds.has(z.id)) {
        if (!killedZombieIds.has(z.id)) {
          killedZombieIds.add(z.id);
          broadcastWorldEvent({ kind: 'zkill', id: z.id });
        }
        c.zombies.splice(i, 1);
        continue;
      }

      const dist = Math.hypot(player.x - z.x, player.y - z.y);
      const canSee = dist < 9.0 && hasLineOfSight(z.x, z.y, player.x, player.y, activeChunks);
      z.aggro = canSee;

      if (canSee) {
        const ang = Math.atan2(player.y - z.y, player.x - z.x);
        z.facing = ang;
        if (dist > 0.72) {
          z.walkPhase += dt * (z.kind === 'sprinter' ? 16 : 12);
          const vx = Math.cos(ang) * z.speed * dt;
          const vy = Math.sin(ang) * z.speed * dt;
          if (canZombieWalkTo(z.x + vx, z.y, activeChunks)) z.x += vx;
          if (canZombieWalkTo(z.x, z.y + vy, activeChunks)) z.y += vy;
        }
      } else {
        z.turnTimer -= dt;
        if (z.turnTimer <= 0) {
          z.wanderAng += (Math.random() - 0.5) * 2.4;
          z.turnTimer = 1.2 + Math.random() * 1.4;
        }
        z.facing = z.wanderAng;
        z.walkPhase += dt * 7;
        const vx = Math.cos(z.wanderAng) * 0.95 * dt;
        const vy = Math.sin(z.wanderAng) * 0.95 * dt;

        let blocked = false;
        if (canZombieWalkTo(z.x + vx, z.y, activeChunks)) z.x += vx;
        else blocked = true;
        if (canZombieWalkTo(z.x, z.y + vy, activeChunks)) z.y += vy;
        else blocked = true;

        if (blocked) {
          z.wanderAng += Math.PI * 0.75;
          z.turnTimer = 1.0;
        }
      }

      if (dist <= 0.92 && z.attackCd === 0 && hasLineOfSight(z.x, z.y, player.x, player.y, activeChunks)) {
        const dmg = z.dmg || 12;
        player.hp = Math.max(0, player.hp - dmg);
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
          dmg,
          life: 0.45,
          maxLife: 0.45
        });
      }
    }
  }
}
