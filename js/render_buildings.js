import { TILE_W, TILE_H, rotateCoords, worldToScreen } from './map.js';

export function drawIsoBox(ctx, x1, y1, x2, y2, baseZ, height, camX, camY, colors, alpha = 1) {
  const topN = worldToScreen(x1, y1, camX, camY);
  const topE = worldToScreen(x2, y1, camX, camY);
  const topS = worldToScreen(x2, y2, camX, camY);
  const topW = worldToScreen(x1, y2, camX, camY);

  const zTop = baseZ + height;
  const zBot = baseZ;

  ctx.save();
  ctx.globalAlpha = alpha;

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
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

export function drawExtrudedBlock(ctx, wx, wy, camX, camY, h, colors, alpha = 1) {
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

function isThinWallOccluding(wall, player, camX, camY) {
  const midX = wall.orient === 'H' ? wall.x + 0.5 : wall.x;
  const midY = wall.orient === 'H' ? wall.y : wall.y + 0.5;

  const wRot = rotateCoords(midX, midY);
  const pRot = rotateCoords(player.x, player.y);
  const wDepth = wRot.rx + wRot.ry;
  const pDepth = pRot.rx + pRot.ry;

  if (wDepth <= pDepth + 0.45) return false;

  const wScreen = worldToScreen(midX, midY, camX, camY);
  const pScreen = worldToScreen(player.x, player.y, camX, camY);
  const dy = wScreen.y - pScreen.y;
  const dx = Math.abs(wScreen.x - pScreen.x);
  return dy > 6 && dy < 48 && dx < 36;
}

export function drawThinWall(ctx, wall, building, camX, camY, player) {
  const pal = building?.palette;
  const colors = wall.isExterior
    ? pal
      ? { left: pal.wallL, right: pal.wallR, top: pal.trim || '#cbd5e1' }
      : { left: '#94a3b8', right: '#64748b', top: '#cbd5e1' }
    : { left: '#cbd5e1', right: '#94a3b8', top: '#f1f5f9' };

  const occluding = isThinWallOccluding(wall, player, camX, camY);
  const alpha = occluding ? 0.25 : 1;
  const h = wall.isExterior ? 42 : 34;
  const thick = 0.11;

  if (wall.orient === 'H') {
    drawIsoBox(
      ctx,
      wall.x,
      wall.y - thick / 2,
      wall.x + 1,
      wall.y + thick / 2,
      0,
      h,
      camX,
      camY,
      colors,
      alpha
    );
  } else {
    drawIsoBox(
      ctx,
      wall.x - thick / 2,
      wall.y,
      wall.x + thick / 2,
      wall.y + 1,
      0,
      h,
      camX,
      camY,
      colors,
      alpha
    );
  }

  // Rectangular isometric window & selective awning (fades to match wall alpha when occluded)
  if (wall.hasWindow) {
    const p1 =
      wall.orient === 'H'
        ? worldToScreen(wall.x + 0.22, wall.y, camX, camY)
        : worldToScreen(wall.x, wall.y + 0.22, camX, camY);
    const p2 =
      wall.orient === 'H'
        ? worldToScreen(wall.x + 0.78, wall.y, camX, camY)
        : worldToScreen(wall.x, wall.y + 0.78, camX, camY);

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y - 12);
    ctx.lineTo(p2.x, p2.y - 12);
    ctx.lineTo(p2.x, p2.y - 29);
    ctx.lineTo(p1.x, p1.y - 29);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = wall.isBoarded ? '#92400e' : '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(p1.x + (p2.x - p1.x) * 0.1, p1.y + (p2.y - p1.y) * 0.1 - 14);
    ctx.lineTo(p2.x - (p2.x - p1.x) * 0.1, p2.y - (p2.y - p1.y) * 0.1 - 14);
    ctx.lineTo(p2.x - (p2.x - p1.x) * 0.1, p2.y - (p2.y - p1.y) * 0.1 - 27);
    ctx.lineTo(p1.x + (p2.x - p1.x) * 0.1, p1.y + (p2.y - p1.y) * 0.1 - 27);
    ctx.closePath();
    ctx.fill();

    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx, my - 13);
    ctx.lineTo(mx, my - 28);
    ctx.stroke();

    // Only draw awnings on designated storefront windows (wall.hasAwning)
    if (wall.hasAwning && pal?.awning && (wall.outSide === 'S' || wall.outSide === 'E')) {
      const a1 =
        wall.orient === 'H'
          ? worldToScreen(wall.x + 0.05, wall.y, camX, camY)
          : worldToScreen(wall.x, wall.y + 0.05, camX, camY);
      const a2 =
        wall.orient === 'H'
          ? worldToScreen(wall.x + 0.95, wall.y, camX, camY)
          : worldToScreen(wall.x, wall.y + 0.95, camX, camY);

      const outA1 =
        wall.outSide === 'S'
          ? worldToScreen(wall.x + 0.05, wall.y + 0.45, camX, camY)
          : worldToScreen(wall.x + 0.45, wall.y + 0.05, camX, camY);
      const outA2 =
        wall.outSide === 'S'
          ? worldToScreen(wall.x + 0.95, wall.y + 0.45, camX, camY)
          : worldToScreen(wall.x + 0.45, wall.y + 0.95, camX, camY);

      ctx.fillStyle = pal.awning;
      ctx.beginPath();
      ctx.moveTo(a1.x, a1.y - 34);
      ctx.lineTo(a2.x, a2.y - 34);
      ctx.lineTo(outA2.x, outA2.y - 26);
      ctx.lineTo(outA1.x, outA1.y - 26);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawEdgeDoor(ctx, door, camX, camY, isHighlighted) {
  const midX = door.orient === 'H' ? door.x + 0.5 : door.x;
  const midY = door.orient === 'H' ? door.y : door.y + 0.5;
  const pos = worldToScreen(midX, midY, camX, camY);

  if (isHighlighted) {
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 2, 20, 10, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  const thick = 0.12;
  const palette =
    door.state === 'barricaded'
      ? { left: '#7f1d1d', right: '#991b1b', top: '#b91c1c' }
      : door.state === 'locked'
      ? { left: '#92400e', right: '#b45309', top: '#d97706' }
      : { left: '#78350f', right: '#92400e', top: '#b45309' };

  if (door.state === 'open') {
    if (door.orient === 'H') {
      drawIsoBox(ctx, door.x + 0.05, door.y, door.x + 0.18, door.y + 0.85, 0, 34, camX, camY, palette, 0.85);
    } else {
      drawIsoBox(ctx, door.x, door.y + 0.05, door.x + 0.85, door.y + 0.18, 0, 34, camX, camY, palette, 0.85);
    }
    return;
  }

  if (door.orient === 'H') {
    drawIsoBox(
      ctx,
      door.x + 0.06,
      door.y - thick / 2,
      door.x + 0.94,
      door.y + thick / 2,
      0,
      36,
      camX,
      camY,
      palette,
      1
    );
  } else {
    drawIsoBox(
      ctx,
      door.x - thick / 2,
      door.y + 0.06,
      door.x + thick / 2,
      door.y + 0.94,
      0,
      36,
      camX,
      camY,
      palette,
      1
    );
  }

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

export function drawInteriorProp(ctx, prop, camX, camY) {
  const w = prop.w || 1.5;
  const d = prop.d || 1.0;

  if (prop.kind === 'bed') {
    drawIsoBox(ctx, prop.x, prop.y, prop.x + w, prop.y + d, 0, 9, camX, camY, {
      left: '#1e3a8a',
      right: '#172554',
      top: '#2563eb'
    });
    drawIsoBox(ctx, prop.x + 0.12, prop.y + 0.12, prop.x + w - 0.12, prop.y + 0.55, 9, 3, camX, camY, {
      left: '#cbd5e1',
      right: '#94a3b8',
      top: '#f8fafc'
    });
  } else if (prop.kind === 'sofa') {
    drawIsoBox(ctx, prop.x, prop.y, prop.x + w, prop.y + d, 0, 8, camX, camY, {
      left: '#7c2d12',
      right: '#5c210e',
      top: '#9a3412'
    });
    drawIsoBox(ctx, prop.x, prop.y, prop.x + w, prop.y + 0.3, 8, 7, camX, camY, {
      left: '#5c210e',
      right: '#431407',
      top: '#7c2d12'
    });
  } else if (prop.kind === 'counter' || prop.kind === 'workbench') {
    drawIsoBox(ctx, prop.x, prop.y, prop.x + w, prop.y + d, 0, 14, camX, camY, {
      left: '#78350f',
      right: '#5c280b',
      top: prop.kind === 'workbench' ? '#d97706' : '#e2e8f0'
    });
  } else if (prop.kind === 'fridge') {
    drawIsoBox(ctx, prop.x, prop.y, prop.x + w, prop.y + d, 0, 26, camX, camY, {
      left: '#cbd5e1',
      right: '#94a3b8',
      top: '#f8fafc'
    });
  } else if (prop.kind === 'toilet') {
    drawIsoBox(ctx, prop.x, prop.y, prop.x + w, prop.y + d, 0, 8, camX, camY, {
      left: '#e2e8f0',
      right: '#cbd5e1',
      top: '#ffffff'
    });
    drawIsoBox(ctx, prop.x, prop.y, prop.x + w, prop.y + 0.3, 8, 7, camX, camY, {
      left: '#cbd5e1',
      right: '#94a3b8',
      top: '#f8fafc'
    });
  } else if (prop.kind === 'tub') {
    drawIsoBox(ctx, prop.x, prop.y, prop.x + w, prop.y + d, 0, 9, camX, camY, {
      left: '#cbd5e1',
      right: '#94a3b8',
      top: '#38bdf8'
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

export function drawRoofCap(ctx, building, camX, camY) {
  const pal = building.palette || {
    wallL: '#475569',
    wallR: '#334155',
    roofL: '#334155',
    roofR: '#1e293b'
  };

  const rects = building.rects || [{ x1: building.x1, y1: building.y1, x2: building.x2, y2: building.y2 }];
  const wallH = 42;

  if (building.roofStyle === 'parapet') {
    // Draw flat roof deck across full building footprint
    const bx1 = building.x1;
    const by1 = building.y1;
    const bx2 = building.x2 + 1;
    const by2 = building.y2 + 1;

    const nw = worldToScreen(bx1, by1, camX, camY);
    const ne = worldToScreen(bx2, by1, camX, camY);
    const se = worldToScreen(bx2, by2, camX, camY);
    const sw = worldToScreen(bx1, by2, camX, camY);

    ctx.fillStyle = pal.roofR;
    ctx.beginPath();
    ctx.moveTo(nw.x, nw.y - wallH);
    ctx.lineTo(ne.x, ne.y - wallH);
    ctx.lineTo(se.x, se.y - wallH);
    ctx.lineTo(sw.x, sw.y - wallH);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Raised 3D parapet walls rising 8px above the roof deck on guarded sides (leaving 1-2 open drop-off edges)
    const pSides = building.parapetSides || ['N', 'W', 'S'];
    const pColors = { left: pal.wallL, right: pal.wallR, top: pal.trim || '#cbd5e1' };
    const pH = 8;
    const pThick = 0.16;

    if (pSides.includes('N')) {
      drawIsoBox(ctx, bx1, by1, bx2, by1 + pThick, wallH, pH, camX, camY, pColors, 1);
    }
    if (pSides.includes('W')) {
      drawIsoBox(ctx, bx1, by1, bx1 + pThick, by2, wallH, pH, camX, camY, pColors, 1);
    }
    if (pSides.includes('E')) {
      drawIsoBox(ctx, bx2 - pThick, by1, bx2, by2, wallH, pH, camX, camY, pColors, 1);
    }
    if (pSides.includes('S')) {
      drawIsoBox(ctx, bx1, by2 - pThick, bx2, by2, wallH, pH, camX, camY, pColors, 1);
    }

    // Rooftop HVAC unit
    const cx = (bx1 + bx2) / 2;
    const cy = (by1 + by2) / 2;
    drawIsoBox(ctx, cx - 1.1, cy - 1.1, cx + 1.1, cy + 1.1, wallH, 7, camX, camY, {
      left: '#94a3b8',
      right: '#64748b',
      top: '#cbd5e1'
    });
  } else {
    for (const r of rects) {
      const x1 = r.x1;
      const y1 = r.y1;
      const x2 = r.x2 + 1;
      const y2 = r.y2 + 1;

      const nw = worldToScreen(x1, y1, camX, camY);
      const ne = worldToScreen(x2, y1, camX, camY);
      const se = worldToScreen(x2, y2, camX, camY);
      const sw = worldToScreen(x1, y2, camX, camY);

      const spanX = x2 - x1;
      const spanY = y2 - y1;
      const ridgeH = wallH + Math.min(24, Math.max(14, Math.min(spanX, spanY) * 2.0));

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

  const midX = (building.x1 + building.x2 + 1) / 2;
  const midY = (building.y1 + building.y2 + 1) / 2;
  const center = worldToScreen(midX, midY, camX, camY);
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.fillStyle = building.id === 'rockmart-pd' ? '#38bdf8' : 'rgba(241, 245, 249, 0.94)';
  ctx.textAlign = 'center';
  ctx.fillText(building.name.toUpperCase(), center.x, center.y - 68);
}
