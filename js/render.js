import {
  TILE_W,
  TILE_H,
  MAP_SIZE,
  QUARRY_X,
  QUARRY_Y,
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
import { getTileAt, getRoadKindAt } from './chunks.js';
import { sticks, MAX_STICK_R } from './input.js';
import { getActiveZombies, fxList, WEAPONS } from './combat.js';
import { remotePlayers } from './net.js';

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

function drawIsoBox(ctx, x1, y1, x2, y2, baseZ, height, camX, camY, colors) {
  const topN = worldToScreen(x1, y1, camX, camY);
  const topE = worldToScreen(x2, y1, camX, camY);
  const topS = worldToScreen(x2, y2, camX, camY);
  const topW = worldToScreen(x1, y2, camX, camY);

  const zTop = baseZ + height;
  const zBot = baseZ;

  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(topW.x, topW.y - zTop);
  ctx.lineTo(topS.x, topS.y - zTop);
  ctx.lineTo(topS.x, topS.y - zBot);
  ctx.lineTo(topW.x, topW.y - zBot);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(topS.x, topS.y - zTop);
  ctx.lineTo(topE.x, topE.y - zTop);
  ctx.lineTo(topE.x, topE.y - zBot);
  ctx.lineTo(topS.x, topS.y - zBot);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = colors.top;
  ctx.beginPath();
  ctx.moveTo(topN.x, topN.y - zTop);
  ctx.lineTo(topE.x, topE.y - zTop);
  ctx.lineTo(topS.x, topS.y - zTop);
  ctx.lineTo(topW.x, topW.y - zTop);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

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

function isWallOccludingUnit(wallScreen, unitScreen) {
  const dy = wallScreen.y - unitScreen.y;
  const dx = Math.abs(wallScreen.x - unitScreen.x);
  return dy > 4 && dy < 58 && dx < 46;
}

function drawWall(ctx, wx, wy, camX, camY, player, visibleZombies, building, wallMeta) {
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

  const pal = building?.palette;
  const colors = pal
    ? { left: pal.wallL, right: pal.wallR, top: pal.trim || '#64748b' }
    : { left: '#475569', right: '#334155', top: '#64748b' };

  const alpha = occluding ? 0.32 : 1;
  const h = 42;
  drawExtrudedBlock(ctx, wx, wy, camX, camY, h, colors, alpha);

  if (wallMeta && wallMeta.hasWindow && !occluding) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    const winColor = wallMeta.isBoarded ? '#92400e' : '#38bdf8';

    if (wallMeta.faceSouth) {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(p.x - 24, p.y + 12);
      ctx.lineTo(p.x - 8, p.y + 20);
      ctx.lineTo(p.x - 8, p.y + 4);
      ctx.lineTo(p.x - 24, p.y - 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = winColor;
      ctx.beginPath();
      ctx.moveTo(p.x - 22, p.y + 11);
      ctx.lineTo(p.x - 10, p.y + 17);
      ctx.lineTo(p.x - 10, p.y + 6);
      ctx.lineTo(p.x - 22, p.y);
      ctx.closePath();
      ctx.fill();
    } else if (wallMeta.faceEast) {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(p.x + 8, p.y + 20);
      ctx.lineTo(p.x + 24, p.y + 12);
      ctx.lineTo(p.x + 24, p.y - 4);
      ctx.lineTo(p.x + 8, p.y + 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = winColor;
      ctx.beginPath();
      ctx.moveTo(p.x + 10, p.y + 17);
      ctx.lineTo(p.x + 22, p.y + 11);
      ctx.lineTo(p.x + 22, p.y);
      ctx.lineTo(p.x + 10, p.y + 6);
      ctx.closePath();
      ctx.fill();
    }

    if (building?.category === 'commercial' && wallMeta.faceSouth && pal?.awning) {
      ctx.fillStyle = pal.awning;
      ctx.beginPath();
      ctx.moveTo(p.x - TILE_W / 2, p.y + TILE_H / 2 - 28);
      ctx.lineTo(p.x, p.y + TILE_H - 28);
      ctx.lineTo(p.x - 6, p.y + TILE_H - 20);
      ctx.lineTo(p.x - TILE_W / 2 - 6, p.y + TILE_H / 2 - 20);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
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

function drawInteriorProp(ctx, prop, camX, camY) {
  const w = prop.w || 2;
  const d = prop.d || 1;
  if (prop.kind === 'bed') {
    drawIsoBox(ctx, prop.x, prop.y, prop.x + w, prop.y + d, 0, 10, camX, camY, {
      left: '#1e3a8a',
      right: '#172554',
      top: '#2563eb'
    });
    drawIsoBox(ctx, prop.x + 0.15, prop.y + 0.15, prop.x + w - 0.15, prop.y + 0.65, 10, 3, camX, camY, {
      left: '#cbd5e1',
      right: '#94a3b8',
      top: '#f8fafc'
    });
  } else if (prop.kind === 'counter') {
    drawIsoBox(ctx, prop.x, prop.y, prop.x + w, prop.y + d, 0, 14, camX, camY, {
      left: '#78350f',
      right: '#5c280b',
      top: '#cbd5e1'
    });
  } else if (prop.kind === 'shelf') {
    drawIsoBox(ctx, prop.x, prop.y, prop.x + w, prop.y + d, 0, 22, camX, camY, {
      left: '#475569',
      right: '#334155',
      top: '#64748b'
    });
  } else {
    drawIsoBox(ctx, prop.x, prop.y, prop.x + w, prop.y + d, 0, 12, camX, camY, {
      left: '#92400e',
      right: '#78350f',
      top: '#b45309'
    });
  }
}

function drawRoofCap(ctx, building, camX, camY) {
  const pal = building.palette || {
    wallL: '#475569',
    wallR: '#334155',
    roofL: '#334155',
    roofR: '#1e293b'
  };

  const rects = building.rects || [{ x1: building.x1, y1: building.y1, x2: building.x2, y2: building.y2 }];
  const wallH = 42;

  for (const r of rects) {
    const x1 = r.x1;
    const y1 = r.y1;
    const x2 = r.x2 + 1;
    const y2 = r.y2 + 1;

    const nw = worldToScreen(x1, y1, camX, camY);
    const ne = worldToScreen(x2, y1, camX, camY);
    const se = worldToScreen(x2, y2, camX, camY);
    const sw = worldToScreen(x1, y2, camX, camY);

    if (building.roofStyle === 'parapet') {
      const rimH = wallH + 6;
      ctx.fillStyle = pal.roofR;
      ctx.beginPath();
      ctx.moveTo(nw.x, nw.y - rimH);
      ctx.lineTo(ne.x, ne.y - rimH);
      ctx.lineTo(se.x, se.y - rimH);
      ctx.lineTo(sw.x, sw.y - rimH);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = pal.wallL;
      ctx.lineWidth = 3;
      ctx.stroke();

      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      drawIsoBox(ctx, cx - 1.2, cy - 1.2, cx + 1.2, cy + 1.2, rimH - 2, 7, camX, camY, {
        left: '#94a3b8',
        right: '#64748b',
        top: '#cbd5e1'
      });
    } else {
      const spanX = x2 - x1;
      const spanY = y2 - y1;
      const ridgeH = wallH + Math.min(26, Math.max(16, Math.min(spanX, spanY) * 2.2));

      if (spanX >= spanY) {
        const midY = (y1 + y2) / 2;
        const rWest = worldToScreen(x1, midY, camX, camY);
        const rEast = worldToScreen(x2, midY, camX, camY);

        const eastFacesCamera = (ne.y + se.y) / 2 >= (nw.y + sw.y) / 2;
        if (!eastFacesCamera) {
          ctx.fillStyle = pal.wallL;
          ctx.beginPath();
          ctx.moveTo(nw.x, nw.y - wallH);
          ctx.lineTo(sw.x, sw.y - wallH);
          ctx.lineTo(rWest.x, rWest.y - ridgeH);
          ctx.closePath();
          ctx.fill();
        }

        ctx.fillStyle = pal.roofR;
        ctx.beginPath();
        ctx.moveTo(nw.x, nw.y - wallH);
        ctx.lineTo(ne.x, ne.y - wallH);
        ctx.lineTo(rEast.x, rEast.y - ridgeH);
        ctx.lineTo(rWest.x, rWest.y - ridgeH);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = pal.roofL;
        ctx.beginPath();
        ctx.moveTo(rWest.x, rWest.y - ridgeH);
        ctx.lineTo(rEast.x, rEast.y - ridgeH);
        ctx.lineTo(se.x, se.y - wallH);
        ctx.lineTo(sw.x, sw.y - wallH);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (eastFacesCamera) {
          ctx.fillStyle = pal.wallR;
          ctx.beginPath();
          ctx.moveTo(ne.x, ne.y - wallH);
          ctx.lineTo(se.x, se.y - wallH);
          ctx.lineTo(rEast.x, rEast.y - ridgeH);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        const midX = (x1 + x2) / 2;
        const rNorth = worldToScreen(midX, y1, camX, camY);
        const rSouth = worldToScreen(midX, y2, camX, camY);

        const southFacesCamera = (sw.y + se.y) / 2 >= (nw.y + ne.y) / 2;
        if (!southFacesCamera) {
          ctx.fillStyle = pal.wallR;
          ctx.beginPath();
          ctx.moveTo(nw.x, nw.y - wallH);
          ctx.lineTo(ne.x, ne.y - wallH);
          ctx.lineTo(rNorth.x, rNorth.y - ridgeH);
          ctx.closePath();
          ctx.fill();
        }

        ctx.fillStyle = pal.roofL;
        ctx.beginPath();
        ctx.moveTo(nw.x, nw.y - wallH);
        ctx.lineTo(rNorth.x, rNorth.y - ridgeH);
        ctx.lineTo(rSouth.x, rSouth.y - ridgeH);
        ctx.lineTo(sw.x, sw.y - wallH);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = pal.roofR;
        ctx.beginPath();
        ctx.moveTo(rNorth.x, rNorth.y - ridgeH);
        ctx.lineTo(ne.x, ne.y - wallH);
        ctx.lineTo(se.x, se.y - wallH);
        ctx.lineTo(rSouth.x, rSouth.y - ridgeH);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (southFacesCamera) {
          ctx.fillStyle = pal.wallL;
          ctx.beginPath();
          ctx.moveTo(sw.x, sw.y - wallH);
          ctx.lineTo(se.x, se.y - wallH);
          ctx.lineTo(rSouth.x, rSouth.y - ridgeH);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  if (building.category !== 'commercial') {
    const r0 = rects[0];
    drawIsoBox(ctx, r0.x1 + 1.5, r0.y1 + 1.5, r0.x1 + 2.4, r0.y1 + 2.4, wallH + 10, 14, camX, camY, {
      left: '#991b1b',
      right: '#7f1d1d',
      top: '#450a0a'
    });
  }

  const midX = (building.x1 + building.x2 + 1) / 2;
  const midY = (building.y1 + building.y2 + 1) / 2;
  const center = worldToScreen(midX, midY, camX, camY);
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.fillStyle = building.id === 'rockmart-pd' ? '#38bdf8' : 'rgba(241, 245, 249, 0.94)';
  ctx.textAlign = 'center';
  ctx.fillText(building.name.toUpperCase(), center.x, center.y - 68);
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

  mctx.fillStyle = 'rgba(100, 116, 139, 0.22)';
  mctx.fillRect(360 * scale, 290 * scale, 270 * scale, 250 * scale);
  mctx.fillRect(220 * scale, 340 * scale, 140 * scale, 160 * scale);

  mctx.strokeStyle = '#2563eb';
  mctx.lineWidth = 2;
  mctx.beginPath();
  for (let wy = 0; wy <= MAP_SIZE; wy += 32) {
    const cx = 655 + Math.sin(wy * 0.018) * 32 + Math.cos(wy * 0.045) * 14;
    if (wy === 0) mctx.moveTo(cx * scale, wy * scale);
    else mctx.lineTo(cx * scale, wy * scale);
  }
  mctx.stroke();

  mctx.strokeStyle = '#f97316';
  mctx.lineWidth = 2.2;
  mctx.beginPath();
  for (let wx = 0; wx <= MAP_SIZE; wx += 32) {
    const wy = 115 + Math.sin(wx * 0.005) * 8;
    if (wx === 0) mctx.moveTo(wx * scale, wy * scale);
    else mctx.lineTo(wx * scale, wy * scale);
  }
  mctx.stroke();

  mctx.strokeStyle = '#64748b';
  mctx.lineWidth = 1.2;
  mctx.beginPath();
  for (let wx = 0; wx <= MAP_SIZE; wx += 32) {
    const wy = 252 + Math.sin(wx * 0.007) * 10;
    if (wx === 0) mctx.moveTo(wx * scale, wy * scale);
    else mctx.lineTo(wx * scale, wy * scale);
  }
  for (const sy of [310, 358, 406, 454, 502]) {
    mctx.moveTo(360 * scale, sy * scale);
    mctx.lineTo(630 * scale, sy * scale);
  }
  for (const sx of [384, 448, 512, 576, 624]) {
    mctx.moveTo(sx * scale, 290 * scale);
    mctx.lineTo(sx * scale, 540 * scale);
  }
  mctx.moveTo(520 * scale, 625 * scale);
  mctx.lineTo(558 * scale, 245 * scale);
  mctx.moveTo(515 * scale, 485 * scale);
  mctx.lineTo(140 * scale, 645 * scale);
  mctx.moveTo(520 * scale, 605 * scale);
  mctx.lineTo(635 * scale, 1010 * scale);
  mctx.stroke();

  mctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
  mctx.strokeStyle = '#4ade80';
  mctx.lineWidth = 1.2;
  mctx.beginPath();
  mctx.ellipse(QUARRY_X * scale, QUARRY_Y * scale, 68 * scale, 54 * scale, -0.15, 0, Math.PI * 2);
  mctx.fill();
  mctx.stroke();

  mctx.fillStyle = '#38bdf8';
  mctx.fillRect(policePrecinct.x * scale - 2, policePrecinct.y * scale - 2, 4, 4);

  for (const c of activeChunks) {
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
  const wallLookup = new Map();
  for (const c of activeChunks) {
    for (const b of c.buildings) {
      revealedMap[b.id] = isBuildingRevealed(b, player, activeChunks);
      if (b.wallTiles) {
        for (const wt of b.wallTiles) {
          wallLookup.set(`${wt.x},${wt.y}`, { building: b, meta: wt });
        }
      }
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

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (getTileAt(x, y) === 2) {
        const entry = wallLookup.get(`${x},${y}`);
        renderables.push({
          depth: depthOf(x, y),
          draw: () =>
            drawWall(ctx, x, y, camX, camY, player, visibleZombies, entry?.building, entry?.meta)
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

    for (const b of c.buildings) {
      if (revealedMap[b.id] && b.props) {
        for (const prop of b.props) {
          if (prop.x >= minX && prop.x <= maxX && prop.y >= minY && prop.y <= maxY) {
            renderables.push({
              depth: depthOf(prop.x + (prop.w || 1) / 2, prop.y + (prop.d || 1) / 2) + 0.03,
              draw: () => drawInteriorProp(ctx, prop, camX, camY)
            });
          }
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
