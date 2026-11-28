import { canWalkTo, worldToScreen } from './map.js';
import { isInsideQuarryHub, killedZombieIds } from './chunks.js';
import { dropHeavyCrate, showToast } from './inventory.js';
import { broadcastWorldEvent } from './net.js';

export const WEAPONS = {
  fists: {
    name: 'Fists',
    type: 'melee',
    damage: 20,
    range: 1.9,
    arc: 1.05,
    cooldown: 0.4,
    staminaCost: 2,
    knockback: 0.42
  },
  crowbar: {
    name: 'Crowbar',
    type: 'melee',
    damage: 42,
    range: 2.25,
    arc: 1.15,
    cooldown: 0.48,
    staminaCost: 5,
    knockback: 0.72
  },
  axe: {
    name: 'Fire Axe',
    type: 'melee',
    damage: 72,
    range: 2.45,
    arc: 1.2,
    cooldown: 0.65,
    staminaCost: 9,
    knockback: 0.95
  },
  pistol: {
    name: '9mm Pistol',
    type: 'ranged',
    damage: 52,
    range: 11.5,
    arc: 0.34,
    cooldown: 0.38,
    staminaCost: 1,
    knockback: 0.32
  },
  rifle: {
    name: 'Hunting Rifle',
    type: 'ranged',
    damage: 120,
    range: 15.5,
    arc: 0.22,
    cooldown: 0.75,
    staminaCost: 2,
    knockback: 0.58
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

// Exact segment-vs-edge check so open doorways never false-block attacks
function isSightClear(x1, y1, x2, y2, activeChunks) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  if (dist < 0.45) return true;

  const isBlocked = (edgeKey) => {
    for (const c of activeChunks) {
      if (c.edgeWalls && c.edgeWalls.has(edgeKey)) return true;
      if (c.edgeDoors && c.edgeDoors.has(edgeKey)) {
        const door = c.edgeDoors.get(edgeKey);
        if (door && door.state !== 'open') return true;
      }
    }
    return false;
  };

  // Check every integer X grid line crossed between x1 and x2
  const minGx = Math.floor(Math.min(x1, x2)) + 1;
  const maxGx = Math.floor(Math.max(x1, x2));
  for (let gx = minGx; gx <= maxGx; gx++) {
    const t = (gx - x1) / (x2 - x1);
    const iy = y1 + (y2 - y1) * t;
    if (isBlocked(`V:${gx},${Math.floor(iy)}`)) return false;
  }

  // Check every integer Y grid line crossed between y1 and y2
  const minGy = Math.floor(Math.min(y1, y2)) + 1;
  const maxGy = Math.floor(Math.max(y1, y2));
  for (let gy = minGy; gy <= maxGy; gy++) {
    const t = (gy - y1) / (y2 - y1);
    const ix = x1 + (x2 - x1) * t;
    if (isBlocked(`H:${Math.floor(ix)},${gy}`)) return false;
  }

  return true;
}

function getTargetsInCone(player, activeChunks, weapon, effectiveRange) {
  const pScreen = worldToScreen(player.x, player.y, 0, 0);
  const candidates = [];

  for (const c of activeChunks) {
    for (let i = 0; i < c.zombies.length; i++) {
      const z = c.zombies[i];
      const dx = z.x - player.x;
      const dy = z.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > effectiveRange) continue;

      const zScreen = worldToScreen(z.x, z.y, 0, 0);
      const screenAng = Math.atan2(zScreen.y - pScreen.y, zScreen.x - pScreen.x);
      let diff = screenAng - player.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      const withinCone = Math.abs(diff) <= weapon.arc || (dist < 1.25 && Math.abs(diff) <= 1.45);
      if (!withinCone) continue;

      if (!isSightClear(player.x, player.y, z.x, z.y, activeChunks)) continue;

      candidates.push({ chunk: c, index: i, z, dist });
    }
  }

  candidates.sort((a, b) => a.dist - b.dist);
  return candidates;
}

export function performAttack(player, activeChunks, isAuto = false) {
  if (player.dead || player.attackTimer > 0) return;

  const weapon = WEAPONS[player.equippedWeapon] || WEAPONS.fists;
  const isBruiserMelee = player.archetype === 'bruiser' && weapon.type === 'melee';
  const isMarksmanRanged = player.archetype === 'marksman' && weapon.type === 'ranged';
  const effectiveRange = isMarksmanRanged ? weapon.range * 1.25 : weapon.range;

  const candidates = getTargetsInCone(player, activeChunks, weapon, effectiveRange);
  if (isAuto === true && candidates.length === 0) return;

  if (player.carryingCrate) {
    dropHeavyCrate(player);
  }

  player.stamina = Math.max(0, player.stamina - weapon.staminaCost);
  player.attackTimer = weapon.cooldown;

  const dmgMult = isBruiserMelee ? 1.35 : isMarksmanRanged ? 1.25 : 1.0;
  const kbMult = isBruiserMelee ? 1.4 : 1.0;
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
      life: 0.2,
      maxLife: 0.2
    });
  }

  for (let i = hitTargets.length - 1; i >= 0; i--) {
    const { chunk, index, z } = hitTargets[i];
    const finalDmg = Math.round(weapon.damage * dmgMult);
    z.hp -= finalDmg;
    z.hitFlash = 0.16;
    z.aggro = true;
    z.lostSightTimer = 0;

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

  // Auto-attack closest zombie(s) whenever aim cone faces a target in range & clear sight
  if (!playerInSafeHub && !player.dead && player.attackTimer === 0) {
    performAttack(player, activeChunks, true);
  }

  const sightRange = player.isSprinting ? 10.5 : 7.0;
  const allZombies = getActiveZombies(activeChunks);

  // Soft zombie-to-zombie separation so hordes never stack on top of one another
  for (let i = 0; i < allZombies.length; i++) {
    const a = allZombies[i];
    for (let j = i + 1; j < allZombies.length; j++) {
      const b = allZombies[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      const minSep = 0.68;
      if (d > 0.001 && d < minSep) {
        const push = ((minSep - d) / minSep) * 1.8 * dt;
        const ux = dx / d;
        const uy = dy / d;
        if (canWalkTo(a.x + ux * push, a.y, 0.26, activeChunks)) a.x += ux * push;
        if (canWalkTo(a.x, a.y + uy * push, 0.26, activeChunks)) a.y += uy * push;
        if (canWalkTo(b.x - ux * push, b.y, 0.26, activeChunks)) b.x -= ux * push;
        if (canWalkTo(b.x, b.y - uy * push, 0.26, activeChunks)) b.y -= uy * push;
      }
    }
  }

  for (const c of activeChunks) {
    for (const z of c.zombies) {
      if (z.attackCd > 0) z.attackCd = Math.max(0, z.attackCd - dt);
      if (z.hitFlash > 0) z.hitFlash = Math.max(0, z.hitFlash - dt);
      if (z.lungeTimer > 0) z.lungeTimer = Math.max(0, z.lungeTimer - dt);

      const dx = player.x - z.x;
      const dy = player.y - z.y;
      const dist = Math.hypot(dx, dy);
      const canSeePlayer =
        !playerInSafeHub &&
        dist < 14.5 &&
        isSightClear(z.x, z.y, player.x, player.y, activeChunks);

      if (playerInSafeHub) {
        z.aggro = false;
        z.lostSightTimer = 0;
      } else if (canSeePlayer) {
        if (dist < sightRange || z.aggro) {
          z.aggro = true;
          z.lostSightTimer = 0;
        }
      } else if (z.aggro) {
        z.lostSightTimer = (z.lostSightTimer || 0) + dt;
        if (z.lostSightTimer >= 2.5) {
          z.aggro = false;
          z.lostSightTimer = 0;
        }
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
        } else if (z.attackCd === 0 && canSeePlayer) {
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
