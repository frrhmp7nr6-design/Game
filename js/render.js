import { TILE_W, TILE_H, MAP_SIZE, map, worldLoot, worldToScreen } from './map.js';
import { sticks, MAX_STICK_R } from './input.js';
import { zombies, fxList, WEAPONS } from './combat.js';

function drawTile(ctx, wx, wy, camX, camY, type) {
  const p = worldToScreen(wx, wy, camX, camY);

  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2);
  ctx.lineTo(p.x, p.y + TILE_H);
  ctx.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2);
  ctx.closePath();

  if (type === 1) {
    ctx.fillStyle = (wx + wy) % 2 === 0 ? '#334155' : '#2d3a4f';
  } else {
    ctx.fillStyle = (wx + wy) % 2 === 0 ? '#1b2822' : '#17221d';
  }
  ctx.fill();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
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

function drawLoot(ctx, item, camX, camY, isHighlighted) {
  const pos = worldToScreen(item.x, item.y, camX, camY);

  if (isHighlighted) {
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 4, 18, 9, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - 3, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawZombie(ctx, z, camX, camY) {
  const pos = worldToScreen(z.x, z.y, camX, camY);

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 2, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Zombie capsule
  ctx.fillStyle = z.hitFlash > 0 ? '#fca5a5' : '#4d7c0f';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y - 12, 9, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1a2e05';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Mini HP bar if damaged
  if (z.hp < z.maxHp) {
    const bw = 26;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(pos.x - bw / 2, pos.y - 36, bw, 4);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(pos.x - bw / 2, pos.y - 36, bw * (z.hp / z.maxHp), 4);
  }
}

function drawPlayer(ctx, player, camX, camY) {
  const pos = worldToScreen(player.x, player.y, camX, camY);
  const weapon = WEAPONS[player.equippedWeapon] || WEAPONS.fists;

  // Vision Cone (scales subtly with equipped weapon range)
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

  // Ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 2, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Survivor body
  ctx.fillStyle = player.isSprinting ? '#7dd3fc' : '#38bdf8';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y - 12, 9, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Facing dot
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
      // Bullet tracer line
      ctx.save();
      ctx.strokeStyle = `rgba(253, 224, 71, ${alpha})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y - 12);
      ctx.lineTo(to.x, to.y - 12);
      ctx.stroke();
      ctx.restore();
    } else {
      // Melee swing arc
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

export function renderFrame(ctx, player, nearbyLootIndex) {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  const camX = (player.x - player.y) * (TILE_W / 2);
  const camY = (player.x + player.y) * (TILE_H / 2);

  // Draw floors first
  for (let sum = 0; sum < MAP_SIZE * 2; sum++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const y = sum - x;
      if (y >= 0 && y < MAP_SIZE && map[y][x] !== 2) {
        drawTile(ctx, x, y, camX, camY, map[y][x]);
      }
    }
  }

  // Depth-sort walls, loot, zombies, and player
  const renderables = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (map[y][x] === 2) {
        renderables.push({ depth: x + y, draw: () => drawTile(ctx, x, y, camX, camY, 2) });
      }
    }
  }

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
    draw: () => drawPlayer(ctx, player, camX, camY)
  });

  renderables.sort((a, b) => a.depth - b.depth);
  for (const item of renderables) item.draw();

  drawCombatFx(ctx, camX, camY);
  drawJoysticks(ctx);
}
