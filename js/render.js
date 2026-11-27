export function renderMinimap(mctx, player, activeChunks) {
  const w = 136;
  const h = 136;
  const scale = w / MAP_SIZE;
  mctx.clearRect(0, 0, w, h);

  mctx.fillStyle = '#14221a';
  mctx.fillRect(0, 0, w, h);

  if (atlasState.loaded) {
    // Draw real OSM polygons (water, quarry & building footprints)
    for (const f of atlasState.features) {
      if (f.kind === 'poly') {
        if (f.props.natural === 'water' || f.props.waterway) {
          mctx.fillStyle = '#2563eb';
        } else if (f.props.landuse === 'quarry') {
          mctx.fillStyle = 'rgba(74, 222, 128, 0.35)';
        } else if (f.props.building) {
          mctx.fillStyle = 'rgba(203, 213, 225, 0.45)';
        } else {
          continue;
        }
        mctx.beginPath();
        f.pts.forEach((pt, idx) => {
          if (idx === 0) mctx.moveTo(pt.x * scale, pt.y * scale);
          else mctx.lineTo(pt.x * scale, pt.y * scale);
        });
        mctx.closePath();
        mctx.fill();
      }
    }

    // Draw real OSM roads & waterways
    for (const f of atlasState.features) {
      if (f.kind !== 'line') continue;
      if (f.props.waterway) {
        mctx.strokeStyle = '#2563eb';
        mctx.lineWidth = 1.6;
      } else if (f.props.highway === 'primary' || f.props.highway === 'trunk') {
        mctx.strokeStyle = '#f59e0b';
        mctx.lineWidth = 1.6;
      } else if (f.props.highway) {
        mctx.strokeStyle = '#64748b';
        mctx.lineWidth = 1.0;
      } else {
        continue;
      }
      mctx.beginPath();
      f.pts.forEach((pt, idx) => {
        if (idx === 0) mctx.moveTo(pt.x * scale, pt.y * scale);
        else mctx.lineTo(pt.x * scale, pt.y * scale);
      });
      mctx.stroke();
    }
  } else {
    // Procedural fallback minimap
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
  }

  // Quarry Safe Hub perimeter
  mctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
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
