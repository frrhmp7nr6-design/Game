import {
  TILE_W,
  TILE_H,
  MAP_SIZE,
  QUARRY_RX,
  QUARRY_RY,
  getQuarryCenter,
  convoyGarage,
  quarryWorkbench,
  quarryCampfire,
  policePrecinct,
  rescueEvent,
  rescuedSpecialists,
  rotateCoords,
  worldToScreen,
  getBuildingAt,
  isBuildingRevealed,
  getNearbyLootList
} from './map.js';
import { getTileAt, getRoadKindAt, getRiverCenterX } from './chunks.js';
import {
  drawExtrudedBlock,
  drawIsoBox,
  drawThinWall,
  drawEdgeDoor,
  drawInteriorProp,
  drawRoofCap
} from './render_buildings.js';
import { sticks, MAX_STICK_R } from './input.js';
import { getActiveZombies, fxList, WEAPONS } from './combat.js';
import { remotePlayers } from './net.js';

function drawTile(ctx, wx, wy, camX, camY, type, roadKind, isHiddenInterior) {
  const p = worldToScreen(wx, wy, camX, camY);
  if (
    p.x < -TILE_W ||
    p.x > window.innerWidth + TILE_W ||
    p.y < -TILE_H * 2 ||
    p.y > window.innerHeight + TILE_H
  ) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2);
  ctx.lineTo(p.x, p.y + TILE_H);
  ctx.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2);
  ctx.closePath();

  if (isHiddenInterior) {
    ctx.fillStyle = '#090d14';
  } else if (type === 1) {
    ctx.fillStyle =
      roadKind === 'sidewalk'
        ? (wx + wy) % 2 === 0
          ? '#64748b'
          : '#5b6b80'
        : (wx + wy) % 2 === 0
        ? '#334155'
        : '#2c384b';
  } else if (type === 3) {
    if (roadKind === 'freeway' || roadKind === 'ramp') {
      ctx.fillStyle = (wx + wy) % 2 === 0 ? '#18181b' : '#141417';
    } else if (roadKind === 'highway' || roadKind === 'boulevard') {
      ctx.fillStyle = (wx + wy) % 2 === 0 ? '#232327' : '#1e1e22';
    } else if (roadKind === 'rural') {
      ctx.fillStyle = (wx + wy) % 2 === 0 ? '#323238' : '#2c2c31';
    } else {
      ctx.fillStyle = (wx + wy) % 2 === 0 ? '#27272a' : '#212124';
    }
  } else if (type === 4) {
    ctx.fillStyle = (wx + wy) % 2 === 0 ? '#1d4ed8' : '#1e40af';
  } else if (type === 5) {
    ctx.fillStyle = (wx + wy) % 2 === 0 ? '#6b4c35' : '#5e422e';
  } else {
    ctx.fillStyle = (wx + wy) % 2 === 0 ? '#1c2b21' : '#18241c';
  }
  ctx.fill();

  if (type !== 3 && !isHiddenInterior) {
    ctx.strokeStyle =
      roadKind === 'sidewalk' ? 'rgba(203, 213, 225, 0.25)' : 'rgba(15, 23, 42, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (!isHiddenInterior) {
    if (type === 3 && (wx + wy) % 2 === 0) {
      if (roadKind === 'freeway' || roadKind === 'highway' || roadKind === 'boulevard') {
        ctx.fillStyle = roadKind === 'highway' ? 'rgba(250, 204, 21, 0.45)' : 'rgba(248, 250, 252, 0.38)';
        ctx.beginPath();
        ctx.arc(p.x, p.y + TILE_H / 2, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (roadKind === 'avenue' || roadKind === 'rural') {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.32)';
        ctx.beginPath();
        ctx.arc(p.x, p.y + TILE_H / 2, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 5 && (wx * 3 + wy) % 3 === 0) {
      ctx.fillStyle = 'rgba(214, 211, 209, 0.28)';
      ctx.fillRect(p.x - 2, p.y + TILE_H / 2 - 1, 3, 2);
    }
  }
}

function drawEnvProp(ctx, prop, camX, camY, player) {
  const pos = worldToScreen(prop.x, prop.y, camX, camY);
  if (
    pos.x < -80 ||
    pos.x > window.innerWidth + 80 ||
    pos.y < -120 ||
    pos.y > window.innerHeight + 80
  ) {
    return;
  }

  const s = prop.scale || 1;

  let alpha = 1;
  if (prop.kind === 'pine' || prop.kind === 'oak') {
    const propRot = rotateCoords(prop.x, prop.y);
    const playerRot = rotateCoords(player.x, player.y);
    if (propRot.rx + propRot.ry > playerRot.rx + playerRot.ry + 0.35) {
      const pScreen = worldToScreen(player.x, player.y, camX, camY);
      const dy = pos.y - pScreen.y;
      const dx = Math.abs(pos.x - pScreen.x);
      if (dy > 6 && dy < 72 && dx < 32) alpha = 0.34;
    }
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  if (prop.kind === 'pine') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 3, 16 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#5c2d16';
    ctx.fillRect(pos.x - 2.5 * s, pos.y - 16 * s, 5 * s, 17 * s);

    const tiers = [
      { yOff: 14, w: 18, h: 24, col: '#14532d' },
      { yOff: 28, w: 14, h: 22, col: '#166534' },
      { yOff: 42, w: 10, h: 18, col: '#15803d' }
    ];
    for (const t of tiers) {
      ctx.fillStyle = t.col;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y - (t.yOff + t.h) * s);
      ctx.lineTo(pos.x + t.w * s, pos.y - t.yOff * s);
      ctx.lineTo(pos.x - t.w * s, pos.y - t.yOff * s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#052e16';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  } else if (prop.kind === 'oak') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 3, 18 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#78350f';
    ctx.fillRect(pos.x - 3 * s, pos.y - 22 * s, 6 * s, 23 * s);

    ctx.fillStyle = '#166534';
    ctx.beginPath();
    ctx.arc(pos.x - 8 * s, pos.y - 30 * s, 13 * s, 0, Math.PI * 2);
    ctx.arc(pos.x + 8 * s, pos.y - 30 * s, 13 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - 37 * s, 15 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#14532d';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else if (prop.kind === 'bush') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 2, 10 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.arc(pos.x - 4 * s, pos.y - 4 * s, 7 * s, 0, Math.PI * 2);
    ctx.arc(pos.x + 4 * s, pos.y - 4 * s, 6.5 * s, 0, Math.PI * 2);
    ctx.arc(pos.x, pos.y - 7 * s, 7 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === 'rock') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 2, 12 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(pos.x - 11 * s, pos.y + 1);
    ctx.lineTo(pos.x - 6 * s, pos.y - 10 * s);
    ctx.lineTo(pos.x + 5 * s, pos.y - 11 * s);
    ctx.lineTo(pos.x + 11 * s, pos.y + 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (prop.kind === 'fence') {
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pos.x - 14, pos.y + 7);
    ctx.lineTo(pos.x - 14, pos.y - 7);
    ctx.moveTo(pos.x + 14, pos.y - 7);
    ctx.lineTo(pos.x + 14, pos.y - 21);
    ctx.moveTo(pos.x - 14, pos.y - 4);
    ctx.lineTo(pos.x + 14, pos.y - 18);
    ctx.moveTo(pos.x - 14, pos.y + 1);
    ctx.lineTo(pos.x + 14, pos.y - 13);
    ctx.stroke();
  } else if (prop.kind === 'streetlight') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 2, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x, pos.y - 44);
    ctx.lineTo(pos.x + 10, pos.y - 48);
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(pos.x + 11, pos.y - 47, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === 'hydrant') {
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(pos.x - 3, pos.y - 9, 6, 9);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - 9, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === 'car') {
    const col = prop.color || '#cbd5e1';
    drawIsoBox(ctx, prop.x - 1.1, prop.y - 0.6, prop.x + 1.1, prop.y + 0.6, 0, 9, camX, camY, {
      left: col,
      right: '#334155',
      top: col
    });
    drawIsoBox(ctx, prop.x - 0.55, prop.y - 0.5, prop.x + 0.55, prop.y + 0.5, 9, 6, camX, camY, {
      left: '#0f172a',
      right: '#1e293b',
      top: col
    });
  }

  ctx.restore();
}

function drawQuarryLandmarks(ctx, camX, camY) {
  const gPos = worldToScreen(convoyGarage.x, convoyGarage.y, camX, camY);
  if (gPos.x > -100 && gPos.x < window.innerWidth + 100) {
    ctx.beginPath();
    ctx.ellipse(gPos.x, gPos.y + 4, 34, 17, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#0369a1';
    ctx.fillRect(gPos.x - 18, gPos.y - 22, 36, 20);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.strokeRect(gPos.x - 18, gPos.y - 22, 36, 20);

    ctx.font = 'bold 10px -apple-system, sans-serif';
    ctx.fillStyle = '#bae6fd';
    ctx.textAlign = 'center';
    ctx.fillText('IRON CONVOY', gPos.x, gPos.y - 28);
  }

  const wPos = worldToScreen(quarryWorkbench.x, quarryWorkbench.y, camX, camY);
  if (wPos.x > -100 && wPos.x < window.innerWidth + 100) {
    ctx.beginPath();
    ctx.ellipse(wPos.x, wPos.y + 4, 28, 14, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#b45309';
    ctx.fillRect(wPos.x - 14, wPos.y - 16, 28, 14);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wPos.x - 14, wPos.y - 16, 28, 14);

    ctx.font = 'bold 10px -apple-system, sans-serif';
    ctx.fillStyle = '#fde68a';
    ctx.textAlign = 'center';
    ctx.fillText('WORKBENCH', wPos.x, wPos.y - 22);
  }

  const fPos = worldToScreen(quarryCampfire.x, quarryCampfire.y, camX, camY);
  if (fPos.x > -100 && fPos.x < window.innerWidth + 100) {
    ctx.beginPath();
    ctx.ellipse(fPos.x, fPos.y + 2, 42, 21, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(249, 115, 22, 0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const flicker = 5 + Math.sin(performance.now() / 110) * 2;
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(fPos.x, fPos.y - 4, flicker, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(fPos.x, fPos.y - 3, flicker * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRescueNpc(ctx, npc, camX, camY, isRescueTarget) {
  const pos = worldToScreen(npc.x, npc.y, camX, camY);
  if (pos.x < -80 || pos.x > window.innerWidth + 80) return;

  if (isRescueTarget && !npc.following) {
    const pulse = 18 + Math.sin(performance.now() / 180) * 6;
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 3, pulse, pulse * 0.5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(244, 114, 182, 0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 2, 11, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f472b6';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y - 12, 8.5, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = 'bold 10px -apple-system, sans-serif';
  ctx.fillStyle = '#fbcfe8';
  ctx.textAlign = 'center';
  ctx.fillText(npc.name.toUpperCase(), pos.x, pos.y - 33);
}

function drawLoot(ctx, item, camX, camY, isHighlighted) {
  const pos = worldToScreen(item.x, item.y, camX, camY);

  if (item.type === 'convoy' || item.type === 'heavy' || item.type === 'radio') {
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 4, 16, 8, 0, 0, Math.PI * 2);
    ctx.strokeStyle =
      item.type === 'heavy'
        ? 'rgba(251, 146, 60, 0.9)'
        : item.type === 'radio'
        ? 'rgba(56, 189, 248, 0.95)'
        : 'rgba(34, 211, 238, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (isHighlighted) {
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 4, 20, 10, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  if (item.type === 'heavy') {
    ctx.fillStyle = item.color || '#ea580c';
    ctx.fillRect(pos.x - 8, pos.y - 13, 16, 13);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pos.x - 8, pos.y - 13, 16, 13);
    return;
  }

  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - 3, item.type === 'convoy' || item.type === 'radio' ? 8 : 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawZombie(ctx, z, camX, camY) {
  const lungeOffset = z.lungeTimer > 0 ? Math.sin((z.lungeTimer / 0.25) * Math.PI) * 0.34 : 0;
  const drawX = z.x + Math.cos(z.facing) * lungeOffset;
  const drawY = z.y + Math.sin(z.facing) * lungeOffset;
  const pos = worldToScreen(drawX, drawY, camX, camY);
  const s = z.scale || 1;

  const phase = z.walkPhase || 0;
  const bob = Math.abs(Math.sin(phase)) * 4.5;
  const sway = Math.sin(phase) * 0.18;
  const stride = Math.sin(phase) * 5;

  const screenDir = worldToScreen(drawX + Math.cos(z.facing), drawY + Math.sin(z.facing), 0, 0);
  const screenOrig = worldToScreen(drawX, drawY, 0, 0);
  const sAng = Math.atan2(screenDir.y - screenOrig.y, screenDir.x - screenOrig.x);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 3, 13 * s, 6.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  const perpAng = sAng + Math.PI / 2;
  ctx.beginPath();
  ctx.arc(
    pos.x + Math.cos(perpAng) * 4 + Math.cos(sAng) * stride,
    pos.y + 1 + Math.sin(perpAng) * 2.5 + Math.sin(sAng) * (stride * 0.5),
    3,
    0,
    Math.PI * 2
  );
  ctx.arc(
    pos.x - Math.cos(perpAng) * 4 - Math.cos(sAng) * stride,
    pos.y + 1 - Math.sin(perpAng) * 2.5 - Math.sin(sAng) * (stride * 0.5),
    3,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.strokeStyle = z.lungeTimer > 0 ? '#ef4444' : z.color || '#84cc16';
  ctx.lineWidth = 3.5 * s;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y - 14 - bob);
  ctx.lineTo(pos.x + Math.cos(sAng - 0.35) * 15, pos.y - 14 - bob + Math.sin(sAng - 0.35) * 9.5);
  ctx.moveTo(pos.x, pos.y - 14 - bob);
  ctx.lineTo(pos.x + Math.cos(sAng + 0.35) * 15, pos.y - 14 - bob + Math.sin(sAng + 0.35) * 9.5);
  ctx.stroke();

  ctx.fillStyle = z.hitFlash > 0 ? '#fca5a5' : z.color || '#4d7c0f';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y - 13 * s - bob, 9 * s, 17 * s, sway, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#090d14';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (z.isBoss) {
    ctx.font = 'bold 10px -apple-system, sans-serif';
    ctx.fillStyle = '#f0abfc';
    ctx.textAlign = 'center';
    ctx.fillText('👑 JUGGERNAUT', pos.x, pos.y - 45 * s - bob);
  } else if (z.aggro && z.hp === z.maxHp) {
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.fillText('!', pos.x, pos.y - 36 * s - bob);
  }

  if (z.hp < z.maxHp || z.isBoss) {
    const bw = 28 * s;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(pos.x - bw / 2, pos.y - 39 * s - bob, bw, 4);
    ctx.fillStyle = z.isBoss ? '#e879f9' : '#ef4444';
    ctx.fillRect(pos.x - bw / 2, pos.y - 39 * s - bob, bw * (z.hp / z.maxHp), 4);
  }
}

function drawRemotePlayer(ctx, rp, camX, camY) {
  const pos = worldToScreen(rp.x, rp.y, camX, camY);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.arc(pos.x, pos.y, 160, rp.angle - 0.45, rp.angle + 0.45);
  ctx.closePath();
  ctx.fillStyle = 'rgba(74, 222, 128, 0.1)';
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 2, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y - 12, 9, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = 'bold 10px -apple-system, sans-serif';
  ctx.fillStyle = '#86efac';
  ctx.textAlign = 'center';
  ctx.fillText((rp.archetype || 'ALLY').toUpperCase(), pos.x, pos.y - 34);
}

function drawPlayer(ctx, player, camX, camY, objectiveTarget) {
  const pos = worldToScreen(player.x, player.y, camX, camY);
  const weapon = WEAPONS[player.equippedWeapon] || WEAPONS.fists;

  const coneRadius =
    weapon.type === 'ranged' ? (player.archetype === 'marksman' ? 350 : 290) : 210;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.arc(pos.x, pos.y, coneRadius, player.angle - weapon.arc, player.angle + weapon.arc);
  ctx.closePath();
  const grad = ctx.createRadialGradient(pos.x, pos.y, 8, pos.x, pos.y, coneRadius);
  grad.addColorStop(0, 'rgba(253, 224, 71, 0.24)');
  grad.addColorStop(1, 'rgba(253, 224, 71, 0.0)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  if (rescueEvent.active && !rescueEvent.following) {
    const distToNpc = Math.hypot(rescueEvent.x - player.x, rescueEvent.y - player.y);
    if (distToNpc <= 28 && distToNpc > 2.2) {
      const nPos = worldToScreen(rescueEvent.x, rescueEvent.y, camX, camY);
      const ang = Math.atan2(nPos.y - pos.y, nPos.x - pos.x);
      const vx = pos.x + Math.cos(ang) * 62;
      const vy = pos.y - 12 + Math.sin(ang) * 42;
      const alpha = Math.max(0.25, 1 - distToNpc / 28);

      ctx.save();
      ctx.strokeStyle = `rgba(244, 114, 182, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(vx, vy, 12, ang - 0.5, ang + 0.5);
      ctx.stroke();

      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.fillStyle = `rgba(251, 207, 232, ${alpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(distToNpc < 13 ? '🗣️ "OVER HERE!"' : '👂 Faint voice...', vx, vy - 12);
      ctx.restore();
    }
  }

  if (objectiveTarget) {
    const tPos = worldToScreen(objectiveTarget.x, objectiveTarget.y, camX, camY);
    const dist = Math.hypot(tPos.x - pos.x, tPos.y - pos.y);
    if (dist > 45) {
      const ang = Math.atan2(tPos.y - pos.y, tPos.x - pos.x);
      const ax = pos.x + Math.cos(ang) * 44;
      const ay = pos.y - 10 + Math.sin(ang) * 32;

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle =
        objectiveTarget.color || (objectiveTarget.isGarage ? '#4ade80' : '#22d3ee');
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-5, -5);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 2, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = player.hurtFlash > 0 ? '#f87171' : player.isSprinting ? '#7dd3fc' : '#38bdf8';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y - 12, 9, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (player.carryingCrate) {
    ctx.fillStyle = player.carryingCrate.color || '#ea580c';
    ctx.fillRect(pos.x - 9, pos.y - 24, 18, 13);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pos.x - 9, pos.y - 24, 18, 13);
  }

  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(
    pos.x + Math.cos(player.angle) * 14,
    pos.y - 10 + Math.sin(player.angle) * 9,
    3,
    0,
    Math.PI * 2
  );
  ctx.fill();
}

function drawCombatFx(ctx, camX, camY) {
  for (const fx of fxList) {
    const alpha = Math.max(0, fx.life / fx.maxLife);
    const from = worldToScreen(fx.fromX, fx.fromY, camX, camY);
    const to = worldToScreen(fx.toX, fx.toY, camX, camY);

    if (fx.type === 'ranged') {
      ctx.save();
      ctx.strokeStyle = `rgba(253, 224, 71, ${alpha})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y - 12);
      ctx.lineTo(to.x, to.y - 12);
      ctx.stroke();
      ctx.restore();
    } else if (fx.type === 'bite') {
      const rise = (1 - alpha) * 18;
      ctx.save();
      ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(to.x - 12, to.y - 24);
      ctx.lineTo(to.x + 12, to.y - 6);
      ctx.moveTo(to.x + 12, to.y - 24);
      ctx.lineTo(to.x - 12, to.y - 6);
      ctx.stroke();

      ctx.font = 'bold 14px -apple-system, sans-serif';
      ctx.fillStyle = `rgba(248, 113, 113, ${alpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(`-${fx.dmg || 12} HP`, to.x, to.y - 34 - rise);
      ctx.restore();
    } else {
      ctx.save();
      ctx.strokeStyle = `rgba(224, 242, 254, ${alpha * 0.85})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(from.x, from.y - 10, 46, fx.angle - 0.65, fx.angle + 0.65);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawJoysticks(ctx) {
  for (const side of ['move', 'look']) {
    const s = sticks[side];
    if (s.id !== null) {
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, MAX_STICK_R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(s.sx + s.dx * MAX_STICK_R, s.sy + s.dy * MAX_STICK_R, 20, 0, Math.PI * 2);
      ctx.fillStyle = side === 'move' ? 'rgba(56, 189, 248, 0.45)' : 'rgba(253, 224, 71, 0.45)';
      ctx.fill();
    }
  }
}

export function renderMinimap(mctx, player, activeChunks) {
  const w = 136;
  const h = 136;
  const scale = w / MAP_SIZE;
  mctx.clearRect(0, 0, w, h);

  mctx.fillStyle = '#14221a';
  mctx.fillRect(0, 0, w, h);

  mctx.fillStyle = 'rgba(100, 116, 139, 0.32)';
  mctx.fillRect(760 * scale, 580 * scale, 500 * scale, 480 * scale);
  mctx.fillStyle = 'rgba(100, 116, 139, 0.18)';
  mctx.fillRect(340 * scale, 620 * scale, 380 * scale, 440 * scale);
  mctx.fillRect(1420 * scale, 580 * scale, 380 * scale, 420 * scale);

  mctx.strokeStyle = '#2563eb';
  mctx.lineWidth = 1.8;
  mctx.beginPath();
  for (let wy = 0; wy <= MAP_SIZE; wy += 48) {
    const rx = getRiverCenterX(wy);
    if (wy === 0) mctx.moveTo(rx * scale, wy * scale);
    else mctx.lineTo(rx * scale, wy * scale);
  }
  mctx.stroke();

  mctx.strokeStyle = '#f97316';
  mctx.lineWidth = 1.8;
  mctx.beginPath();
  for (let wx = 0; wx <= MAP_SIZE; wx += 48) {
    const wy = 230 + Math.sin(wx * 0.0025) * 14;
    if (wx === 0) mctx.moveTo(wx * scale, wy * scale);
    else mctx.lineTo(wx * scale, wy * scale);
  }
  mctx.stroke();

  mctx.strokeStyle = '#94a3b8';
  mctx.lineWidth = 1.1;
  mctx.beginPath();
  for (let wx = 0; wx <= MAP_SIZE; wx += 48) {
    const wy = 515 + Math.sin(wx * 0.0035) * 16;
    if (wx === 0) mctx.moveTo(wx * scale, wy * scale);
    else mctx.lineTo(wx * scale, wy * scale);
  }
  mctx.moveTo(1140 * scale, 512 * scale);
  mctx.lineTo(1140 * scale, 1060 * scale);
  mctx.moveTo(1024 * scale, 1435 * scale);
  mctx.lineTo(1094 * scale, 515 * scale);
  mctx.moveTo(540 * scale, 515 * scale);
  mctx.lineTo(540 * scale, 1120 * scale);
  mctx.moveTo(1024 * scale, 1320 * scale);
  mctx.lineTo(1880 * scale, 1320 * scale);
  mctx.stroke();

  const qc = getQuarryCenter();
  mctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
  mctx.strokeStyle = '#4ade80';
  mctx.lineWidth = 1.2;
  mctx.beginPath();
  mctx.ellipse(qc.x * scale, qc.y * scale, QUARRY_RX * scale, QUARRY_RY * scale, -0.15, 0, Math.PI * 2);
  mctx.fill();
  mctx.stroke();

  mctx.fillStyle = '#38bdf8';
  mctx.fillRect(policePrecinct.x * scale - 2, policePrecinct.y * scale - 2, 4, 4);

  for (const c of activeChunks) {
    mctx.fillStyle = 'rgba(203, 213, 225, 0.55)';
    for (const b of c.buildings) {
      mctx.fillRect(
        b.x1 * scale,
        b.y1 * scale,
        Math.max(1.5, (b.x2 - b.x1) * scale),
        Math.max(1.5, (b.y2 - b.y1) * scale)
      );
    }
    for (const item of c.loot) {
      if (item.type === 'convoy' || item.type === 'heavy') {
        mctx.fillStyle = item.type === 'heavy' ? '#fb923c' : '#22d3ee';
        mctx.fillRect(item.x * scale - 1.5, item.y * scale - 1.5, 3, 3);
      }
    }
  }

  if (rescueEvent.active && !rescueEvent.following && rescueEvent.radioPingTimer > 0) {
    const pulse = 3 + Math.sin(performance.now() / 160) * 1.5;
    mctx.strokeStyle = '#f472b6';
    mctx.lineWidth = 1.5;
    mctx.beginPath();
    mctx.arc(rescueEvent.x * scale, rescueEvent.y * scale, pulse, 0, Math.PI * 2);
    mctx.stroke();
  }

  for (const rp of remotePlayers.values()) {
    mctx.fillStyle = '#4ade80';
    mctx.beginPath();
    mctx.arc(rp.x * scale, rp.y * scale, 2.5, 0, Math.PI * 2);
    mctx.fill();
  }

  mctx.fillStyle = '#ffffff';
  mctx.beginPath();
  mctx.arc(player.x * scale, player.y * scale, 2.8, 0, Math.PI * 2);
  mctx.fill();

  mctx.font = 'bold 9px -apple-system, sans-serif';
  mctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
  mctx.textAlign = 'right';
  mctx.fillText('N ▲', w - 6, 12);
}

export function renderFrame(ctx, player, activeChunks, nearbyLoot, nearbyDoor, objectiveTarget) {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  const pRot = rotateCoords(player.x, player.y);
  const camX = (pRot.rx - pRot.ry) * (TILE_W / 2);
  const camY = (pRot.rx + pRot.ry) * (TILE_H / 2);

  const minX = Math.max(0, Math.floor(player.x - 22));
  const maxX = Math.min(MAP_SIZE - 1, Math.ceil(player.x + 22));
  const minY = Math.max(0, Math.floor(player.y - 22));
  const maxY = Math.min(MAP_SIZE - 1, Math.ceil(player.y + 22));

  const revealedMap = {};
  for (const c of activeChunks) {
    for (const b of c.buildings) {
      revealedMap[b.id] = isBuildingRevealed(b, player, activeChunks);
    }
  }

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = getTileAt(x, y);
      if (t !== 2) {
        const rk = getRoadKindAt(x, y);
        const b = getBuildingAt(x + 0.5, y + 0.5, activeChunks);
        const hidden = b ? !revealedMap[b.id] : false;
        drawTile(ctx, x, y, camX, camY, t, rk, hidden);
      }
    }
  }

  const visibleZombies = getActiveZombies(activeChunks).filter((z) => {
    const b = getBuildingAt(z.x, z.y, activeChunks);
    return !b || revealedMap[b.id];
  });

  const renderables = [];
  const depthOf = (wx, wy) => {
    const r = rotateCoords(wx, wy);
    return r.rx + r.ry;
  };

  // Perimeter solid blocks (Quarry wall & map border)
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (getTileAt(x, y) === 2) {
        renderables.push({
          depth: depthOf(x + 0.5, y + 0.5),
          draw: () =>
            drawExtrudedBlock(
              ctx,
              x,
              y,
              camX,
              camY,
              42,
              { left: '#475569', right: '#334155', top: '#64748b' },
              1
            )
        });
      }
    }
  }

  // Thin 5-inch edge walls (exterior + interior room partitions), edge doors & solid furniture
  const seenEdges = new Set();
  for (const c of activeChunks) {
    for (const b of c.buildings) {
      const bRevealed = revealedMap[b.id];
      if (b.edgeWalls) {
        for (const w of b.edgeWalls) {
          if (!w.isExterior && !bRevealed) continue;
          if (w.x < minX || w.x > maxX + 1 || w.y < minY || w.y > maxY + 1) continue;
          if (seenEdges.has(w.key)) continue;
          seenEdges.add(w.key);
          const mx = w.orient === 'H' ? w.x + 0.5 : w.x;
          const my = w.orient === 'H' ? w.y : w.y + 0.5;
          renderables.push({
            depth: depthOf(mx, my),
            draw: () => drawThinWall(ctx, w, b, camX, camY, player)
          });
        }
      }

      if (bRevealed && b.props) {
        for (const prop of b.props) {
          if (prop.x >= minX && prop.x <= maxX && prop.y >= minY && prop.y <= maxY) {
            renderables.push({
              depth: depthOf(prop.x + (prop.w || 1) / 2, prop.y + (prop.d || 1) / 2),
              draw: () => drawInteriorProp(ctx, prop, camX, camY)
            });
          }
        }
      }
    }

    for (const d of c.doors) {
      if (d.interior && !revealedMap[d.buildingId]) continue;
      if (d.x >= minX && d.x <= maxX + 1 && d.y >= minY && d.y <= maxY + 1) {
        if (seenEdges.has(d.key)) continue;
        seenEdges.add(d.key);
        const mx = d.orient === 'H' ? d.x + 0.5 : d.x;
        const my = d.orient === 'H' ? d.y : d.y + 0.5;
        renderables.push({
          depth: depthOf(mx, my) + 0.01,
          draw: () => drawEdgeDoor(ctx, d, camX, camY, nearbyDoor === d)
        });
      }
    }

    if (c.props) {
      for (const prop of c.props) {
        if (prop.x >= minX && prop.x <= maxX && prop.y >= minY && prop.y <= maxY) {
          renderables.push({
            depth: depthOf(prop.x, prop.y),
            draw: () => drawEnvProp(ctx, prop, camX, camY, player)
          });
        }
      }
    }
  }

  drawQuarryLandmarks(ctx, camX, camY);

  const lootList = getNearbyLootList(activeChunks);
  for (const item of lootList) {
    if (item.x < minX || item.x > maxX || item.y < minY || item.y > maxY) continue;
    const b = getBuildingAt(item.x, item.y, activeChunks);
    if (b && !revealedMap[b.id]) continue;
    renderables.push({
      depth: depthOf(item.x, item.y) + 0.05,
      draw: () => drawLoot(ctx, item, camX, camY, nearbyLoot === item)
    });
  }

  if (rescueEvent.active) {
    renderables.push({
      depth: depthOf(rescueEvent.x, rescueEvent.y) + 0.09,
      draw: () => drawRescueNpc(ctx, rescueEvent, camX, camY, true)
    });
  }

  for (const spec of rescuedSpecialists) {
    if (spec.x < minX || spec.x > maxX || spec.y < minY || spec.y > maxY) continue;
    renderables.push({
      depth: depthOf(spec.x, spec.y) + 0.09,
      draw: () => drawRescueNpc(ctx, spec, camX, camY, false)
    });
  }

  for (const z of visibleZombies) {
    if (z.x < minX || z.x > maxX || z.y < minY || z.y > maxY) continue;
    renderables.push({
      depth: depthOf(z.x, z.y) + 0.08,
      draw: () => drawZombie(ctx, z, camX, camY)
    });
  }

  for (const rp of remotePlayers.values()) {
    if (rp.x < minX || rp.x > maxX || rp.y < minY || rp.y > maxY) continue;
    renderables.push({
      depth: depthOf(rp.x, rp.y) + 0.09,
      draw: () => drawRemotePlayer(ctx, rp, camX, camY)
    });
  }

  renderables.push({
    depth: depthOf(player.x, player.y) + 0.1,
    draw: () => drawPlayer(ctx, player, camX, camY, objectiveTarget)
  });

  renderables.sort((a, b) => a.depth - b.depth);
  for (const item of renderables) item.draw();

  const unrevealed = [];
  const seenIds = new Set();
  for (const c of activeChunks) {
    for (const b of c.buildings) {
      if (!revealedMap[b.id] && !seenIds.has(b.id)) {
        seenIds.add(b.id);
        unrevealed.push(b);
      }
    }
  }
  unrevealed.sort((a, b) => depthOf(a.x1, a.y1) - depthOf(b.x1, b.y1));
  for (const b of unrevealed) {
    drawRoofCap(ctx, b, camX, camY);
  }

  drawCombatFx(ctx, camX, camY);
  drawJoysticks(ctx);

  if (player.hurtFlash > 0) {
    const alpha = (player.hurtFlash / 0.35) * 0.42;
    const rad = Math.max(window.innerWidth, window.innerHeight) * 0.65;
    const vig = ctx.createRadialGradient(
      window.innerWidth / 2,
      window.innerHeight / 2,
      rad * 0.45,
      window.innerWidth / 2,
      window.innerHeight / 2,
      rad
    );
    vig.addColorStop(0, 'rgba(220, 38, 38, 0)');
    vig.addColorStop(1, `rgba(220, 38, 38, ${alpha})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  }
}
