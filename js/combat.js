import { canWalkTo } from './map.js';
import { isInsideQuarryHub, killedZombieIds } from './chunks.js';
import { showToast } from './inventory.js';
import { broadcastWorldEvent } from './net.js';

export const WEAPONS = {
  fists: {
    name: 'Fists',
    type: 'melee',
    damage: 16,
    range: 1.35,
    arc: 0.72,
    cooldown: 0.42,
    staminaCost: 4,
    knockback: 0.35
  },
  crowbar: {
    name: 'Crowbar',
    type: 'melee',
    damage: 38,
    range: 1.75,
    arc: 0.85,
    cooldown: 0.52,
    staminaCost: 8,
    knockback: 0.65
  },
  axe: {
    name: 'Fire Axe',
    type: 'melee',
    damage: 68,
    range: 1.95,
    arc: 0.9,
    cooldown: 0.72,
    staminaCost: 14,
    knockback: 0.9
  },
  pistol: {
    name: '9mm Pistol',
    type: 'ranged',
    damage: 48,
    range: 10.5,
    arc: 0.22,
    cooldown: 0.38,
    staminaCost: 2,
    knockback: 0.28
  },
  rifle: {
    name: 'Hunting Rifle',
    type: 'ranged',
    damage: 115,
    range: 14.5,
    arc: 0.14,
    cooldown: 0.78,
    staminaCost: 3,
    knockback: 0.55
  }
};

export const fxList = [];

export function getActiveZombies(activeChunks) {
  const list = [];
  for (const c of activeChunks) {
    for (const z of c.zombies) list.push(z);
  }
  return list;
}

export function performAttack(player, activeChunks) {
  if (player.dead || player.attackTimer > 0) return;
  if (player.carryingCrate) {
    showToast('Drop Heavy Crate before attacking!');
    return;
  }

  const weapon = WEAPONS[player.equippedWeapon] || WEAPONS.fists;
  if (player.stamina < weapon.staminaCost) {
    showToast('Too exhausted to attack!');
    return;
  }

  player.stamina = Math.max(0, player.stamina - weapon.staminaCost);
  player.attackTimer = weapon.cooldown;

  const isBruiserMelee = player.archetype === 'bruiser' && weapon.type === 'melee';
  const isMarksmanRanged = player.archetype === 'marksman' && weapon.type === 'ranged';

  const dmgMult = isBruiserMelee ? 1.35 : isMarksmanRanged ? 1.25 : 1.0;
  const effectiveRange = isMarksmanRanged ? weapon.range * 1.25 : weapon.range;
  const kbMult = isBruiserMelee ? 1.4 : 1.0;

  const candidates = [];
  for (const c of activeChunks) {
    for (let i = 0; i < c.zombies.length; i++) {
      const z = c.zombies[i];
      const dx = z.x - player.x;
      const dy = z.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > effectiveRange) continue;

      const screenAng = Math.atan2((dx + dy) * 0.5, dx - dy);
      let diff = screenAng - player.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      if (Math.abs(diff) <= weapon.arc) {
        candidates.push({ chunk: c, index: i, z, dist });
      }
    }
  }

  candidates.sort((a, b) => a.dist - b.dist);
  const hitTargets = weapon.type === 'ranged' ? candidates.slice(0, 1) : candidates;

  if (weapon.type === 'ranged') {
    const endX =
      hitTargets.length > 0
        ? hitTargets[0].z.x
        : player.x + Math.cos(player.angle) * effectiveRange * 0.65;
    const endY =
      hitTargets.length > 0
        ? hitTargets[0].z.y
        : player.y + Math.sin(player.angle) * effectiveRange * 0.65;

    fxList.push({
      type: 'ranged',
      fromX: player.x,
      fromY: player.y,
      toX: endX,
      toY: endY,
      life: 0.14,
      maxLife: 0.14
    });
  } else {
    fxList.push({
      type: 'melee',
      fromX: player.x,
      fromY: player.y,
      toX: player.x,
      toY: player.y,
      angle: player.angle,
      life: 0.18,
      maxLife: 0.18
    });
  }

  for (let i = hitTargets.length - 1; i >= 0; i--) {
    const { chunk, index, z } = hitTargets[i];
    const finalDmg = Math.round(weapon.damage * dmgMult);
    z.hp -= finalDmg;
    z.hitFlash = 0.15;
    z.aggro = true;

    const ang = Math.atan2(z.y - player.y, z.x - player.x);
    const kb = weapon.knockback * kbMult;
    const kx = z.x + Math.cos(ang) * kb;
    const ky = z.y + Math.sin(ang) * kb;
    if (canWalkTo(kx, z.y, 0.26, activeChunks)) z.x = kx;
    if (canWalkTo(z.x, ky, 0.26, activeChunks)) z.y = ky;

    if (z.hp <= 0) {
      killedZombieIds.add(z.id);
      chunk.zombies.splice(index, 1);
      broadcastWorldEvent({ kind: 'zombie_kill', id: z.id });

      const scrapGain = z.isBoss ? 8 : z.kind === 'brute' ? 3 : 1;
      player.scrap = (player.scrap || 0) + scrapGain;
      if (z.isBoss) {
        showToast(`👑 Juggernaut defeated! +${scrapGain} Scrap!`);
      }
    }
  }
}

export function updateCombat(dt, player, activeChunks) {
  if (player.attackTimer > 0) player.attackTimer = Math.max(0, player.attackTimer - dt);
  if (player.hurtFlash > 0) player.hurtFlash = Math.max(0, player.hurtFlash - dt);

  for (let i = fxList.length - 1; i >= 0; i--) {
    fxList[i].life -= dt;
    if (fxList[i].life <= 0) fxList.splice(i, 1);
  }

  const playerInSafeHub = isInsideQuarryHub(player.x, player.y);
  const sightRange = player.isSprinting ? 10.5 : 7.0;

  for (const c of activeChunks) {
    for (const z of c.zombies) {
      if (z.attackCd > 0) z.attackCd = Math.max(0, z.attackCd - dt);
      if (z.hitFlash > 0) z.hitFlash = Math.max(0, z.hitFlash - dt);
      if (z.lungeTimer > 0) z.lungeTimer = Math.max(0, z.lungeTimer - dt);

      const dx = player.x - z.x;
      const dy = player.y - z.y;
      const dist = Math.hypot(dx, dy);

      if (playerInSafeHub) {
        z.aggro = false;
      } else if (dist < sightRange) {
        z.aggro = true;
      } else if (dist > 14.5) {
        z.aggro = false;
      }

      if (z.aggro && !playerInSafeHub) {
        if (dist > 0.72) {
          const ang = Math.atan2(dy, dx);
          z.facing = ang;
          z.walkPhase = (z.walkPhase || 0) + dt * z.speed * 5.2;

          const nx = z.x + Math.cos(ang) * z.speed * dt;
          const ny = z.y + Math.sin(ang) * z.speed * dt;
          if (!isInsideQuarryHub(nx, z.y) && canWalkTo(nx, z.y, 0.26, activeChunks)) z.x = nx;
          if (!isInsideQuarryHub(z.x, ny) && canWalkTo(z.x, ny, 0.26, activeChunks)) z.y = ny;
        } else if (z.attackCd === 0) {
          const hitDmg = z.dmg || 12;
          player.hp = Math.max(0, player.hp - hitDmg);
          player.hurtFlash = 0.35;
          z.attackCd = 0.95;
          z.lungeTimer = 0.25;
          z.facing = Math.atan2(dy, dx);

          fxList.push({
            type: 'bite',
            fromX: z.x,
            fromY: z.y,
            toX: player.x,
            toY: player.y,
            dmg: hitDmg,
            life: 0.45,
            maxLife: 0.45
          });
        }
      } else {
        z.turnTimer = (z.turnTimer || 1.5) - dt;
        if (z.turnTimer <= 0) {
          z.wanderAng = (z.wanderAng || 0) + (Math.random() - 0.5) * 2.4;
          z.turnTimer = 1.6 + Math.random() * 2.2;
        }
        const wanderSpeed = z.speed * 0.32;
        const wAng = z.wanderAng || 0;
        z.facing = wAng;
        z.walkPhase = (z.walkPhase || 0) + dt * wanderSpeed * 4.5;

        const nx = z.x + Math.cos(wAng) * wanderSpeed * dt;
        const ny = z.y + Math.sin(wAng) * wanderSpeed * dt;
        if (!isInsideQuarryHub(nx, z.y) && canWalkTo(nx, z.y, 0.26, activeChunks)) {
          z.x = nx;
        } else {
          z.wanderAng = wAng + Math.PI * 0.65;
        }
        if (!isInsideQuarryHub(z.x, ny) && canWalkTo(z.x, ny, 0.26, activeChunks)) {
          z.y = ny;
        } else {
          z.wanderAng = wAng - Math.PI * 0.65;
        }
      }
    }
  }
}
