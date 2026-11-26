import { TILE_W, TILE_H, MAP_SIZE, map, worldLoot, radioTower, worldToScreen } from './map.js';
import { sticks, MAX_STICK_R } from './input.js';
import { zombies, fxList, WEAPONS } from './combat.js';

function drawTile(ctx, wx, wy, camX, camY, type) {
  const p = worldToScreen(wx, wy, camX, camY);

  if (p.x < -TILE_W || p.x > window.innerWidth + TILE_W || p.y < -TILE_H * 2 || p.y > window.innerHeight + TILE_H) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2);
  ctx.lineTo(p.x, p.y + TILE_H);
  ctx.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2);
  ctx.closePath();

  if (type === 1) {
    ctx.fillStyle = (wx + wy) % 2 === 0 ? '#334155' : '#2d3a4f';
  } else if (type === 3) {
    ctx.fillStyle = (wx + wy) % 2 === 0 ? '#27272a' : '#202023';
  } else {
    ctx.fillStyle = (wx + wy) % 2 === 0 ? '#1b2822' : '#17221d';
  }
  ctx.fill();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.42)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (type === 2) {
    const h = 42;
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(p.x - TILE_W / 2, p.y + TILE_H / 2);
    ctx.lineTo(p.x, p.y + TILE_H);
    ctx.lineTo(p.x, p.y + TILE_H - h);
    ctx.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2 - h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(p.x + TILE_W / 2, p.y + TILE_H / 2);
    ctx.lineTo(p.x, p.y + TILE_H);
    ctx.lineTo(p.x, p.y + TILE_H - h);
    ctx.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2 - h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - h);
    ctx.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2 - h);
    ctx.lineTo(p.x, p.y + TILE_H - h);
    ctx.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2 - h);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRadioTower(ctx, camX, camY) {
  const pos = worldToScreen(radioTower.x, radioTower.y, camX, camY);

  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 4, 28, 14, 0, 0, Math.PI * 2);
  ctx.strokeStyle = radioTower.evacActive ? '#22c55e' : '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#0284c7';
  ctx.fillRect(pos.x - 12, pos.y - 24, 24, 24);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.strokeRect(pos.x - 12, pos.y - 24, 24, 24);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y - 24);
  ctx.lineTo(pos.x, pos.y - 68);
  ctx.stroke();

  const pulse = Math.sin(performance.now() / 220) > 0;
  ctx.fillStyle = radioTower.evacActive ? '#4ade80' : pulse ? '#ef4444' : '#7f1d1d';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - 70, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawLoot(ctx, item, camX, camY, isHighlighted) {
  const pos = worldToScreen(item.x, item.y, camX, camY);

  if (item.type === 'part') {
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 4, 15, 7.5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.75)';
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
  ctx.arc(pos.x, pos.y - 3, item.type === 'part' ? 8 : 7, 0, Math.PI * 2);
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

  const phase = z.walkPhase || 0;
  const bob = Math.abs(Math.sin(phase)) * 4.5;
  const sway = Math.sin(phase) * 0.18;
  const stride = Math.sin(phase) * 5;

  const screenDir = worldToScreen(drawX + Math.cos(z.facing), drawY + Math.sin(z.facing), 0, 0);
  const screenOrig = worldToScreen(drawX, drawY, 0, 0);
  const sAng = Math.atan2(screenDir.y - screenOrig.y, screenDir.x - screenOrig.x);

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 3, 13, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Animated alternating feet
  ctx.fillStyle = '#1a2e05';
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

  // Outstretched zombie arms
  ctx.strokeStyle = z.lungeTimer > 0 ? '#ef4444' : '#84cc16';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y - 14 - bob);
  ctx.lineTo(pos.x + Math.cos(sAng - 0.35) * 15, pos.y - 14 - bob + Math.sin(sAng - 0.35) * 9.5);
  ctx.moveTo(pos.x, pos.y - 14 - bob);
  ctx.lineTo(pos.x + Math.cos(sAng + 0.35) * 15, pos.y - 14 - bob + Math.sin(sAng + 0.35) * 9.5);
  ctx.stroke();

  // Zombie capsule body
  ctx.fillStyle = z.hitFlash > 0 ? '#fca5a5' : z.lungeTimer > 0 ? '#a3e635' : '#4d7c0f';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y - 13 - bob, 9, 17, sway, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1a2e05';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Red "!" alert badge when aggroed onto player
  if (z.aggro && z.hp === z.maxHp) {
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.fillText('!', pos.x, pos.y - 35 - bob);
  }

  // Mini HP bar if damaged
  if (z.hp < z.maxHp) {
    const bw = 26;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(pos.x - bw / 2, pos.y - 38 - bob, bw, 4);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(pos.x - bw / 2, pos.y - 38 - bob, bw * (z.hp / z.maxHp), 4);
  }
}

function drawPlayer(ctx, player, camX, camY, objectiveTarget) {
  const pos = worldToScreen(player.x, player.y, camX, camY);
  const weapon = WEAPONS[player.equippedWeapon] || WEAPONS.fists;

  const coneRadius = weapon.type === 'ranged' ? 290 : 210;
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
      ctx.fillStyle = objectiveTarget.isTower ? '#4ade80' : '#22d3ee';
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
      ctx.fillText('-12 HP', to.x, to.y - 34 - rise);
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

export function renderFrame(ctx, player, nearbyLootIndex, objectiveTarget) {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  const camX = (player.x - player.y) * (TILE_W / 2);
  const camY = (player.x + player.y) * (TILE_H / 2);

  const minX = Math.max(0, Math.floor(player.x - 22));
  const maxX = Math.min(MAP_SIZE - 1, Math.ceil(player.x + 22));
  const minY = Math.max(0, Math.floor(player.y - 22));
  const maxY = Math.min(MAP_SIZE - 1, Math.ceil(player.y + 22));

  for (let sum = minX + minY; sum <= maxX + maxY; sum++) {
    for (let x = minX; x <= maxX; x++) {
      const y = sum - x;
      if (y >= minY && y <= maxY && map[y][x] !== 2) {
        drawTile(ctx, x, y, camX, camY, map[y][x]);
      }
    }
  }

  const renderables = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (map[y][x] === 2) {
        renderables.push({ depth: x + y, draw: () => drawTile(ctx, x, y, camX, camY, 2) });
      }
    }
  }

  renderables.push({
    depth: Math.floor(radioTower.x) + Math.floor(radioTower.y) + 0.06,
    draw: () => drawRadioTower(ctx, camX, camY)
  });

  worldLoot.forEach((item, idx) => {
    renderables.push({
      depth: Math.floor(item.x) + Math.floor(item.y) + 0.05,
      draw: () => drawLoot(ctx, item, camX, camY, idx === nearbyLootIndex)
    });
  });

  zombies.forEach((z) => {
    renderables.push({
      depth: Math.floor(z.x) + Math.floor(z.y) + 0.08,
      draw: () => drawZombie(ctx, z, camX, camY)
    });
  });

  renderables.push({
    depth: Math.floor(player.x) + Math.floor(player.y) + 0.1,
    draw: () => drawPlayer(ctx, player, camX, camY, objectiveTarget)
  });

  renderables.sort((a, b) => a.depth - b.depth);
  for (const item of renderables) item.draw();

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
