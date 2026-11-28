import {
  CHUNK_SIZE,
  MAP_SIZE,
  QUARRY_X,
  QUARRY_Y,
  QUARRY_RX,
  QUARRY_RY,
  classifyRoad,
  isInsideQuarryHub,
  isCreekTile,
  getDistrictAt,
  clearChunkCache
} from './chunks.js';
import { stampThinWallBuilding } from './buildings.js';
import { policePrecinct, rescueEvent } from './map.js';
import { showToast } from './inventory.js';

const STORAGE_KEY = 'isowalk-map-edits-v1';

export const mapEdits = {
  tiles: {},
  buildings: [],
  props: []
};

function loadSavedEdits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      mapEdits.tiles = parsed.tiles || {};
      mapEdits.buildings = Array.isArray(parsed.buildings) ? parsed.buildings : [];
      mapEdits.props = Array.isArray(parsed.props) ? parsed.props : [];
    }
  } catch {
    // Ignore storage errors
  }
}

function saveEdits() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mapEdits));
  } catch {
    // Ignore storage errors
  }
}

loadSavedEdits();

export function applyEditorOverridesToChunk(chunk) {
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseY = chunk.cy * CHUNK_SIZE;
  const maxX = baseX + CHUNK_SIZE;
  const maxY = baseY + CHUNK_SIZE;

  // 1. Custom painted tiles
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    const wy = baseY + ly;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = baseX + lx;
      const override = mapEdits.tiles[`${wx},${wy}`];
      if (override !== undefined) {
        const idx = ly * CHUNK_SIZE + lx;
        chunk.tiles[idx] = override;
        chunk.roadKinds[idx] = override === 3 ? 'street' : override === 1 ? 'sidewalk' : 'none';
      }
    }
  }

  // 2. Custom stamped thin-wall buildings
  for (const b of mapEdits.buildings) {
    if (b.x + b.w < baseX || b.x >= maxX || b.y + b.h < baseY || b.y >= maxY) continue;
    const isShop = b.category === 'commercial';
    const midY = b.y + Math.floor(b.h / 2);
    const rooms = isShop
      ? [
          { name: 'Sales Floor', type: 'retail', x1: b.x, y1: midY + 1, x2: b.x + b.w - 1, y2: b.y + b.h - 1 },
          { name: 'Back Room', type: 'shed', x1: b.x, y1: b.y, x2: b.x + b.w - 1, y2: midY }
        ]
      : [
          { name: 'Living Area', type: 'living', x1: b.x, y1: midY + 1, x2: b.x + b.w - 1, y2: b.y + b.h - 1 },
          { name: 'Bedroom', type: 'bedroom', x1: b.x, y1: b.y, x2: b.x + Math.floor(b.w / 2), y2: midY },
          { name: 'Bath', type: 'bathroom', x1: b.x + Math.floor(b.w / 2) + 1, y1: b.y, x2: b.x + b.w - 1, y2: midY }
        ];

    const doorSpecs = [
      { x: b.x + Math.floor(b.w / 2), y: b.y + b.h - 1, side: 'S', state: 'unlocked', interior: false },
      { x: b.x + 2, y: midY, side: 'S', state: 'unlocked', interior: true }
    ];
    if (!isShop) {
      doorSpecs.push({ x: b.x + b.w - 2, y: midY, side: 'S', state: 'unlocked', interior: true });
    }

    stampThinWallBuilding(chunk, {
      id: b.id,
      name: b.name || (isShop ? 'Custom Shop' : 'Custom House'),
      category: b.category || 'house',
      rooms,
      doorSpecs,
      seed: ((b.x * 19 + b.y * 31) % 100) / 100
    });
  }

  // 3. Custom props
  for (const p of mapEdits.props) {
    if (p.x >= baseX && p.x < maxX && p.y >= baseY && p.y < maxY) {
      chunk.props.push({ ...p });
    }
  }
}

export function initMapEditor(player, onWorldMutated) {
  const miniCanvas = document.getElementById('minimap');
  if (!miniCanvas) return;

  const BUF_SIZE = 1024;
  const SCALE = BUF_SIZE / MAP_SIZE;
  const offCanvas = document.createElement('canvas');
  offCanvas.width = BUF_SIZE;
  offCanvas.height = BUF_SIZE;
  const octx = offCanvas.getContext('2d');

  function rebuildOverviewBuffer() {
    const img = octx.createImageData(BUF_SIZE, BUF_SIZE);
    const data = img.data;

    for (let py = 0; py < BUF_SIZE; py++) {
      const wy = py * 2;
      for (let px = 0; px < BUF_SIZE; px++) {
        const wx = px * 2;
        const pIdx = (py * BUF_SIZE + px) * 4;

        let r = 28;
        let g = 45;
        let b = 33;

        const override = mapEdits.tiles[`${wx},${wy}`];
        if (override !== undefined) {
          if (override === 1) {
            r = 100; g = 116; b = 139;
          } else if (override === 2) {
            r = 226; g = 232; b = 240;
          } else if (override === 3) {
            r = 39; g = 39; b = 42;
          } else if (override === 4) {
            r = 29; g = 78; b = 216;
          } else if (override === 5) {
            r = 107; g = 76; b = 53;
          }
        } else {
          const road = classifyRoad(wx, wy);
          if (road.kind !== 'none') {
            if (road.tile === 2) {
              r = 249; g = 115; b = 22;
            } else if (road.tile === 3) {
              r = road.kind === 'freeway' ? 24 : 52;
              g = road.kind === 'freeway' ? 24 : 52;
              b = road.kind === 'freeway' ? 27 : 58;
            } else if (road.tile === 1) {
              r = 100; g = 116; b = 139;
            } else if (road.tile === 5) {
              r = 107; g = 76; b = 53;
            }
          } else if (isInsideQuarryHub(wx, wy)) {
            r = 34; g = 197; b = 94;
          } else if (isCreekTile(wx, wy)) {
            r = 29; g = 78; b = 216;
          } else {
            const dist = getDistrictAt(wx, wy);
            if (dist === 'downtown') {
              r = 45; g = 55; b = 72;
            } else if (dist === 'suburb_west' || dist === 'suburb_east') {
              r = 36; g = 56; b = 48;
            } else if (dist === 'wilderness') {
              r = 20; g = 35; b = 25;
            }
          }
        }

        data[pIdx] = r;
        data[pIdx + 1] = g;
        data[pIdx + 2] = b;
        data[pIdx + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);

    for (const b of mapEdits.buildings) {
      octx.fillStyle = b.category === 'commercial' ? '#38bdf8' : '#f8fafc';
      octx.fillRect(b.x * SCALE, b.y * SCALE, Math.max(2, b.w * SCALE), Math.max(2, b.h * SCALE));
    }
  }

  const overlay = document.createElement('div');
  overlay.id = 'world-editor-modal';
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:9999',
    'background:rgba(9,13,20,0.96)',
    'display:none',
    'flex-direction:column',
    'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
    'color:#f8fafc',
    'user-select:none',
    '-webkit-user-select:none'
  ].join(';');

  overlay.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#0f172a;border-bottom:1px solid #1e293b;gap:8px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-weight:800;font-size:14px;letter-spacing:0.5px;color:#38bdf8;">🗺️ WORLD ATLAS & EDITOR (2048×2048)</span>
        <span id="ed-cursor-label" style="font-size:12px;color:#94a3b8;font-variant-numeric:tabular-nums;">1024, 1460 • Rockmart Quarry Safe Hub</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <button id="ed-zoom-out" style="background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:8px;padding:6px 11px;font-weight:700;">−</button>
        <button id="ed-zoom-in" style="background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:8px;padding:6px 11px;font-weight:700;">+</button>
        <button id="ed-teleport-btn" style="background:#0284c7;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-weight:700;font-size:12px;">⚡ TELEPORT HERE</button>
        <button id="ed-export-btn" style="background:#334155;color:#e2e8f0;border:none;border-radius:8px;padding:6px 10px;font-weight:700;font-size:12px;">📋 COPY JSON</button>
        <button id="ed-clear-btn" style="background:#7f1d1d;color:#fecaca;border:none;border-radius:8px;padding:6px 10px;font-weight:700;font-size:12px;">RESET</button>
        <button id="ed-close-btn" style="background:#ef4444;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-weight:800;font-size:12px;">✕ CLOSE</button>
      </div>
    </div>

    <div style="position:relative;flex:1;overflow:hidden;touch-action:none;">
      <canvas id="ed-canvas" style="width:100%;height:100%;display:block;"></canvas>
      <div style="position:absolute;top:10px;left:10px;background:rgba(15,23,42,0.85);border:1px solid #1e293b;border-radius:8px;padding:6px 10px;font-size:11px;color:#cbd5e1;pointer-events:none;">
        <div>🟢 Quarry Hub (1024,1460) • 🔵 Police PD (1125,916)</div>
        <div>🟠 I-20 Freeway • ⬜ Downtown & Suburbs • 💧 Euharlee River</div>
      </div>
    </div>

    <div id="ed-toolbar" style="display:flex;align-items:center;gap:6px;padding:10px 12px;background:#0f172a;border-top:1px solid #1e293b;overflow-x:auto;">
      <span style="font-size:11px;font-weight:700;color:#64748b;margin-right:4px;">TOOL:</span>
      <button class="ed-tool active" data-tool="pan">🖐️ Inspect / Pan</button>
      <button class="ed-tool" data-tool="road">🛣️ Road (3×3)</button>
      <button class="ed-tool" data-tool="sidewalk">⬜ Sidewalk</button>
      <button class="ed-tool" data-tool="wall">🧱 Wall</button>
      <button class="ed-tool" data-tool="water">💧 Water</button>
      <button class="ed-tool" data-tool="grass">🌿 Grass</button>
      <button class="ed-tool" data-tool="house">🏠 House</button>
      <button class="ed-tool" data-tool="shop">🏪 Storefront</button>
      <button class="ed-tool" data-tool="tree">🌲 Pine Tree</button>
      <button class="ed-tool" data-tool="car">🚗 Parked Car</button>
      <button class="ed-tool" data-tool="erase">🧹 Erase Edit</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const style = document.createElement('style');
  style.textContent = `
    .ed-tool {
      background: #1e293b;
      color: #cbd5e1;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 7px 11px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      cursor: pointer;
    }
    .ed-tool.active {
      background: #0284c7;
      color: #ffffff;
      border-color: #38bdf8;
    }
  `;
  document.head.appendChild(style);

  const edCanvas = overlay.querySelector('#ed-canvas');
  const ectx = edCanvas.getContext('2d');
  const cursorLabel = overlay.querySelector('#ed-cursor-label');

  let isOpen = false;
  let activeTool = 'pan';
  let viewX = player.x;
  let viewY = player.y;
  let zoom = 0.55;
  let selectedWx = Math.floor(player.x);
  let selectedWy = Math.floor(player.y);

  let dragPointerId = null;
  let lastPx = 0;
  let lastPy = 0;
  let dirtyWorld = false;

  overlay.querySelectorAll('.ed-tool').forEach((btn) => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.ed-tool').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeTool = btn.dataset.tool;
    });
  });

  function screenToWorld(sx, sy) {
    const rect = edCanvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    return {
      wx: Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(viewX + (sx - cx) / zoom))),
      wy: Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(viewY + (sy - cy) / zoom)))
    };
  }

  function updateCursorReadout(wx, wy) {
    selectedWx = wx;
    selectedWy = wy;
    const dist = getDistrictAt(wx, wy).replace('_', ' ').toUpperCase();
    cursorLabel.textContent = `${wx}, ${wy} • ${dist}`;
  }

  function applyToolAt(wx, wy) {
    if (activeTool === 'road' || activeTool === 'sidewalk' || activeTool === 'wall' || activeTool === 'water' || activeTool === 'grass') {
      const tileCode =
        activeTool === 'road'
          ? 3
          : activeTool === 'sidewalk'
          ? 1
          : activeTool === 'wall'
          ? 2
          : activeTool === 'water'
          ? 4
          : 0;
      const radius = activeTool === 'road' ? 1 : 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const tx = wx + dx;
          const ty = wy + dy;
          if (tx >= 12 && ty >= 12 && tx < MAP_SIZE - 12 && ty < MAP_SIZE - 12) {
            mapEdits.tiles[`${tx},${ty}`] = tileCode;
          }
        }
      }
      dirtyWorld = true;
    } else if (activeTool === 'house' || activeTool === 'shop') {
      const exists = mapEdits.buildings.some((b) => Math.hypot(b.x - wx, b.y - wy) < 6);
      if (!exists) {
        mapEdits.buildings.push({
          id: `ed-b-${Date.now()}-${Math.floor(Math.random() * 999)}`,
          name: activeTool === 'shop' ? 'Custom Storefront' : 'Custom Residence',
          category: activeTool === 'shop' ? 'commercial' : 'house',
          x: wx - 4,
          y: wy - 4,
          w: 8,
          h: 7
        });
        dirtyWorld = true;
        showToast(`Placed ${activeTool === 'shop' ? 'Storefront' : 'House'} at (${wx}, ${wy})`);
      }
    } else if (activeTool === 'tree') {
      const exists = mapEdits.props.some((p) => Math.hypot(p.x - wx, p.y - wy) < 2);
      if (!exists) {
        mapEdits.props.push({ kind: 'pine', x: wx + 0.5, y: wy + 0.5, w: 0.7, d: 0.7, scale: 1.05, solid: true });
        dirtyWorld = true;
      }
    } else if (activeTool === 'car') {
      const exists = mapEdits.props.some((p) => Math.hypot(p.x - wx, p.y - wy) < 2.5);
      if (!exists) {
        mapEdits.props.push({
          kind: 'car',
          x: wx + 0.5,
          y: wy + 0.5,
          w: 2.2,
          d: 1.2,
          color: '#38bdf8',
          solid: true
        });
        dirtyWorld = true;
      }
    } else if (activeTool === 'erase') {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          delete mapEdits.tiles[`${wx + dx},${wy + dy}`];
        }
      }
      mapEdits.buildings = mapEdits.buildings.filter((b) => Math.hypot(b.x + 4 - wx, b.y + 4 - wy) > 7);
      mapEdits.props = mapEdits.props.filter((p) => Math.hypot(p.x - wx, p.y - wy) > 3);
      dirtyWorld = true;
    }

    if (dirtyWorld) {
      saveEdits();
      rebuildOverviewBuffer();
    }
  }

  function renderEditorCanvas() {
    if (!isOpen) return;
    const rect = edCanvas.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    if (edCanvas.width !== Math.floor(rect.width * dpr) || edCanvas.height !== Math.floor(rect.height * dpr)) {
      edCanvas.width = Math.floor(rect.width * dpr);
      edCanvas.height = Math.floor(rect.height * dpr);
    }
    ectx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ectx.fillStyle = '#090d14';
    ectx.fillRect(0, 0, rect.width, rect.height);

    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const drawX = cx - viewX * zoom;
    const drawY = cy - viewY * zoom;
    const drawSize = MAP_SIZE * zoom;

    ectx.imageSmoothingEnabled = zoom < 1.5;
    ectx.drawImage(offCanvas, drawX, drawY, drawSize, drawSize);

    ectx.strokeStyle = '#475569';
    ectx.lineWidth = 2;
    ectx.strokeRect(drawX, drawY, drawSize, drawSize);

    ectx.strokeStyle = '#4ade80';
    ectx.lineWidth = 2;
    ectx.beginPath();
    ectx.ellipse(
      drawX + QUARRY_X * zoom,
      drawY + QUARRY_Y * zoom,
      QUARRY_RX * zoom,
      QUARRY_RY * zoom,
      0,
      0,
      Math.PI * 2
    );
    ectx.stroke();

    ectx.fillStyle = '#38bdf8';
    ectx.beginPath();
    ectx.arc(drawX + policePrecinct.x * zoom, drawY + policePrecinct.y * zoom, 5, 0, Math.PI * 2);
    ectx.fill();

    if (rescueEvent.active) {
      ectx.fillStyle = '#f472b6';
      ectx.beginPath();
      ectx.arc(drawX + rescueEvent.x * zoom, drawY + rescueEvent.y * zoom, 5, 0, Math.PI * 2);
      ectx.fill();
    }

    ectx.fillStyle = '#ffffff';
    ectx.beginPath();
    ectx.arc(drawX + player.x * zoom, drawY + player.y * zoom, 5.5, 0, Math.PI * 2);
    ectx.fill();
    ectx.strokeStyle = '#0284c7';
    ectx.lineWidth = 2;
    ectx.stroke();

    const selX = drawX + (selectedWx + 0.5) * zoom;
    const selY = drawY + (selectedWy + 0.5) * zoom;
    ectx.strokeStyle = '#fbbf24';
    ectx.lineWidth = 2;
    ectx.strokeRect(selX - Math.max(5, zoom * 1.5), selY - Math.max(5, zoom * 1.5), Math.max(10, zoom * 3), Math.max(10, zoom * 3));

    requestAnimationFrame(renderEditorCanvas);
  }

  edCanvas.addEventListener('pointerdown', (e) => {
    dragPointerId = e.pointerId;
    lastPx = e.clientX;
    lastPy = e.clientY;
    edCanvas.setPointerCapture(e.pointerId);

    const { wx, wy } = screenToWorld(e.clientX, e.clientY);
    updateCursorReadout(wx, wy);
    if (activeTool !== 'pan') {
      applyToolAt(wx, wy);
    }
  });

  edCanvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragPointerId) return;
    const dx = e.clientX - lastPx;
    const dy = e.clientY - lastPy;
    lastPx = e.clientX;
    lastPy = e.clientY;

    if (activeTool === 'pan') {
      viewX = Math.max(0, Math.min(MAP_SIZE, viewX - dx / zoom));
      viewY = Math.max(0, Math.min(MAP_SIZE, viewY - dy / zoom));
    } else {
      const { wx, wy } = screenToWorld(e.clientX, e.clientY);
      updateCursorReadout(wx, wy);
      applyToolAt(wx, wy);
    }
  });

  edCanvas.addEventListener('pointerup', (e) => {
    if (e.pointerId === dragPointerId) dragPointerId = null;
  });

  overlay.querySelector('#ed-zoom-in').addEventListener('click', () => {
    zoom = Math.min(6, zoom * 1.45);
  });
  overlay.querySelector('#ed-zoom-out').addEventListener('click', () => {
    zoom = Math.max(0.22, zoom / 1.45);
  });

  overlay.querySelector('#ed-teleport-btn').addEventListener('click', () => {
    player.x = selectedWx + 0.5;
    player.y = selectedWy + 0.5;
    closeEditor();
    showToast(`⚡ Teleported to (${selectedWx}, ${selectedWy})`);
  });

  overlay.querySelector('#ed-export-btn').addEventListener('click', async () => {
    const json = JSON.stringify(mapEdits, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      showToast('📋 Copied map edits JSON to clipboard!');
    } catch {
      showToast(`Edits saved locally (${Object.keys(mapEdits.tiles).length} tiles, ${mapEdits.buildings.length} buildings)`);
    }
  });

  overlay.querySelector('#ed-clear-btn').addEventListener('click', () => {
    mapEdits.tiles = {};
    mapEdits.buildings = [];
    mapEdits.props = [];
    saveEdits();
    dirtyWorld = true;
    rebuildOverviewBuffer();
    showToast('Reset all custom map edits');
  });

  function openEditor() {
    rebuildOverviewBuffer();
    viewX = player.x;
    viewY = player.y;
    updateCursorReadout(Math.floor(player.x), Math.floor(player.y));
    dirtyWorld = false;
    isOpen = true;
    overlay.style.display = 'flex';
    requestAnimationFrame(renderEditorCanvas);
  }

  function closeEditor() {
    isOpen = false;
    overlay.style.display = 'none';
    if (dirtyWorld) {
      clearChunkCache();
      if (onWorldMutated) onWorldMutated();
      dirtyWorld = false;
    }
  }

  overlay.querySelector('#ed-close-btn').addEventListener('click', closeEditor);

  miniCanvas.style.pointerEvents = 'auto';
  miniCanvas.style.cursor = 'pointer';
  miniCanvas.title = 'Tap to inspect & edit the 2048×2048 world map';
  miniCanvas.addEventListener('click', openEditor);
}
