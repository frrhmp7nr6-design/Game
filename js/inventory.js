import {
  TILE_W,
  TILE_H,
  MAP_SIZE,
  CENTER,
  convoyGarage,
  quarryCampfire,
  rotateCoords,
  worldToScreen,
  getBuildingAt,
  isBuildingRevealed,
  getNearbyLootList
} from './map.js';
import { getTileAt } from './chunks.js';
import { sticks, MAX_STICK_R } from './input.js';
import { getActiveZombies, fxList, WEAPONS } from './combat.js';

function drawExtrudedBlock(ctx, wx, wy, camX, camY, h, colors, alpha = 1) {
  const p = worldToScreen(wx, wy, camX, camY);
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(p.x - TILE_W / 2, p.y + TILE_H / 2);
  ctx.lineTo(p.x, p.y + TILE_H);
  ctx.lineTo(p.x, p.y + TILE_H - h);
  ctx.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2 - h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(p.x + TILE_W / 2, p.y + TILE_H / 2);
  ctx.lineTo(p.x, p.y + TILE_H);
  ctx.lineTo(p.x, p.y + TILE_H - h);
  ctx.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2 - h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = colors.top;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - h);
  ctx.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2 - h);
  ctx.lineTo(p.x, p.y + TILE_H - h);
  ctx.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2 - h);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawTile(ctx, wx, wy, camX, camY, type, isHiddenInterior) {
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
    ctx.fillStyle = (wx + wy) % 2 === 0 ? '#334155' : '#2d3a4f';
  } else if (type === 3) {
    ctx.fillStyle = (wx + wy) % 2 === 0 ? '#27272a' : '#202023';
  } else {
    ctx.fillStyle = (wx + wy) % 2 === 0 ? '#1b2822' : '#17221d';
  }
  ctx.fill();
  ctx.strokeStyle = isHiddenInterior ? '#090d14' : 'rgba(15, 23, 42, 0.42)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function isWallOccludingUnit(wallScreen, unitScreen) {
  const dy = wallScreen.y - unitScreen.y;
  const dx = Math.abs(wallScreen.x - unitScreen.x);
  return dy > 4 && dy < 58 && dx < 46;
}

function drawWall(ctx, wx, wy, camX, camY, player, visibleZombies) {
  const p = worldToScreen(wx, wy, camX, camY);
  if (
    p.x < -TILE_W ||
    p.x > window.innerWidth + TILE_W ||
    p.y < -TILE_H * 2 ||
    p.y > window.innerHeight + TILE_H
  ) {
    return;
  }

  const wallBase = { x: p.x, y: p.y + TILE_H };
  const playerScreen = worldToScreen(player.x, player.y, camX, camY);
  let occluding = isWallOccludingUnit(wallBase, playerScreen);

  if (!occluding) {
    for (const z of visibleZombies) {
      const zScreen = worldToScreen(z.x, z.y, camX, camY);
      if (isWallOccludingUnit(wallBase, zScreen)) {
        occluding = true;
        break;
      }
    }
  }

  drawExtrudedBlock(
    ctx,
    wx,
    wy,
    camX,
    camY,
    42,
    { left: '#475569', right: '#334155', top: '#64748b' },
    occluding ? 0.32 : 1
  );
}

function drawDoor(ctx, door, camX, camY, isHighlighted) {
  const pos = worldToScreen(door.x + 0.5, door.y + 0.5, camX, camY);

  if (isHighlighted) {
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 2, 22, 11, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  if (door.state === 'open') {
    ctx.fillStyle = 'rgba(146, 64, 14, 0.55)';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const palette =
    door.state === 'barricaded'
      ? { left: '#7f1d1d', right: '#991b1b', top: '#b91c1c' }
      : door.state === 'locked'
      ? { left: '#92400e', right: '#b45309', top: '#d97706' }
      : { left: '#78350f', right: '#92400e', top: '#b45309' };

  drawExtrudedBlock(ctx, door.x, door.y, camX, camY, 36, palette, 1);

  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  if (door.state === 'locked') {
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('🔒', pos.x, pos.y - 40);
  } else if (door.state === 'barricaded') {
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('🪵', pos.x, pos.y - 40);
  }
}

function drawRoofCap(ctx, building, camX, camY) {
  for (let y = building.y1; y <= building.y2; y++) {
    for (let x = building.x1; x <= building.x2; x++) {
      const p = worldToScreen(x, y, camX, camY);
      if (
        p.x < -TILE_W ||
        p.x > window.innerWidth + TILE_W ||
        p.y < -TILE_H * 2 ||
        p.y > window.innerHeight + TILE_H
      ) {
        continue;
      }
      const h = 42;
      ctx.fillStyle = (x + y) % 2 === 0 ? 'rgba(30, 41, 59, 0.94)' : 'rgba(23, 32, 46, 0.94)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - h);
      ctx.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2 - h);
      ctx.lineTo(p.x, p.y + TILE_H - h);
      ctx.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2 - h);
      ctx.closePath();
      ctx.fill();
    }
  }

  const midX = (building.x1 + building.x2 + 1) / 2;
  const midY = (building.y1 + building.y2 + 1) / 2;
  const center = worldToScreen(midX, midY, camX, camY);
  ctx.font = 'bold 12px -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(203, 213, 225, 0.85)';
  ctx.textAlign = 'center';
  ctx.fillText(building.name.toUpperCase(), center.x, center.y - 42);
}

function drawQuarryLandmarks(ctx, camX, camY) {
  // 1. Iron Convoy Armored Bus Chassis at (501.5, 501.5)
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

  // 2. Central Quarry Campfire Healing Ring at (512.5, 512.5)
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

function drawLoot(ctx, item, camX, camY, isHighlighted) {
  const pos = worldToScreen(item.x, item.y, camX, camY);

  if (item.type === 'convoy') {
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 4, 15, 7.5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (isHighlighted) {
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 4, 19, 9.5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - 3, item.type === 'convoy' ? 8 : 7, 0, Math.PI * 2);
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

  if (z.aggro && z.hp === z.maxHp) {
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.fillText('!', pos.x, pos.y - 36 * s - bob);
  }

  if (z.hp < z.maxHp) {
    const bw = 26 * s;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(pos.x - bw / 2, pos.y - 39 * s - bob, bw, 4);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(pos.x - bw / 2, pos.y - 39 * s - bob, bw * (z.hp / z.maxHp), 4);
  }
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
      ctx.fillStyle = objectiveTarget.isGarage ? '#4ade80' : '#22d3ee';
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

  // Threat Ring bands
  const drawRingBox = (radius, fill, stroke) => {
    const x = (CENTER - radius) * scale;
    const size = radius * 2 * scale;
    mctx.fillStyle = fill;
    mctx.fillRect(x, x, size, size);
    if (stroke) {
      mctx.strokeStyle = stroke;
      mctx.lineWidth = 1;
      mctx.strokeRect(x, x, size, size);
    }
  };

  drawRingBox(504, 'rgba(239, 68, 68, 0.14)', '#ef4444'); // Ring 3
  drawRingBox(370, 'rgba(245, 158, 11, 0.16)', '#f59e0b'); // Ring 2
  drawRingBox(210, 'rgba(56, 189, 248, 0.16)', '#38bdf8'); // Ring 1
  drawRingBox(64, 'rgba(34, 197, 94, 0.35)', '#4ade80'); // 128x128 Quarry Safe Hub

  // Highway 9 loop & cardinal arteries
  mctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  mctx.lineWidth = 1;
  mctx.strokeRect((CENTER - 242) * scale, (CENTER - 242) * scale, 484 * scale, 484 * scale);
  mctx.beginPath();
  mctx.moveTo(CENTER * scale, 0);
  mctx.lineTo(CENTER * scale, h);
  mctx.moveTo(0, CENTER * scale);
  mctx.lineTo(w, CENTER * scale);
  mctx.stroke();

  // Nearby Convoy Supply dots in active chunks
  for (const c of activeChunks) {
    for (const item of c.loot) {
      if (item.type === 'convoy') {
        mctx.fillStyle = '#22d3ee';
        mctx.fillRect(item.x * scale - 1.5, item.y * scale - 1.5, 3, 3);
      }
    }
  }

  // Player dot
  mctx.fillStyle = '#ffffff';
  mctx.beginPath();
  mctx.arc(player.x * scale, player.y * scale, 2.8, 0, Math.PI * 2);
  mctx.fill();
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
        const b = getBuildingAt(x + 0.5, y + 0.5, activeChunks);
        const hidden = b ? !revealedMap[b.id] : false;
        drawTile(ctx, x, y, camX, camY, t, hidden);
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

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (getTileAt(x, y) === 2) {
        renderables.push({
          depth: depthOf(x, y),
          draw: () => drawWall(ctx, x, y, camX, camY, player, visibleZombies)
        });
      }
    }
  }

  for (const c of activeChunks) {
    for (const d of c.doors) {
      if (d.x >= minX && d.x <= maxX && d.y >= minY && d.y <= maxY) {
        renderables.push({
          depth: depthOf(d.x, d.y) + 0.02,
          draw: () => drawDoor(ctx, d, camX, camY, nearbyDoor === d)
        });
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

  for (const z of visibleZombies) {
    if (z.x < minX || z.x > maxX || z.y < minY || z.y > maxY) continue;
    renderables.push({
      depth: depthOf(z.x, z.y) + 0.08,
      draw: () => drawZombie(ctx, z, camX, camY)
    });
  }

  renderables.push({
    depth: depthOf(player.x, player.y) + 0.1,
    draw: () => drawPlayer(ctx, player, camX, camY, objectiveTarget)
  });

  renderables.sort((a, b) => a.depth - b.depth);
  for (const item of renderables) item.draw();

  for (const c of activeChunks) {
    for (const b of c.buildings) {
      if (!revealedMap[b.id]) {
        drawRoofCap(ctx, b, camX, camY);
      }
    }
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
