import { MAP_SIZE } from './chunks.js';

// Rockmart, GA bounding box (1024 tiles x ~2.5m = ~2.56 km)
const DEFAULT_BOUNDS = {
  minLat: 33.990,
  maxLat: 34.025,
  minLon: -85.065,
  maxLon: -85.030
};

const DB_NAME = 'isowalk-osm-atlas';
const STORE_NAME = 'sectors';
const SECTOR_KEY = 'rockmart-ga-v1';

let atlasBounds = { ...DEFAULT_BOUNDS };

export const atlasState = {
  loaded: false,
  source: 'procedural',
  features: [],
  quarryPolygons: []
};

export function latLonToTile(lat, lon) {
  const tx = ((lon - atlasBounds.minLon) / (atlasBounds.maxLon - atlasBounds.minLon)) * MAP_SIZE;
  const ty = ((atlasBounds.maxLat - lat) / (atlasBounds.maxLat - atlasBounds.minLat)) * MAP_SIZE;
  return { x: tx, y: ty };
}

function openAtlasDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readCachedSector(key) {
  try {
    const db = await openAtlasDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeCachedSector(key, data) {
  try {
    const db = await openAtlasDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore storage quota issues on private browsing
  }
}

function parseOsmElementsToGeoJSON(elements) {
  const nodes = new Map();
  for (const el of elements) {
    if (el.type === 'node') {
      nodes.set(el.id, [el.lon, el.lat]);
    }
  }

  const features = [];
  for (const el of elements) {
    if (el.type !== 'way' || !el.nodes) continue;
    const coords = [];
    for (const nid of el.nodes) {
      const pt = nodes.get(nid);
      if (pt) coords.push(pt);
    }
    if (coords.length < 2) continue;

    const tags = el.tags || {};
    const first = coords[0];
    const last = coords[coords.length - 1];
    const isClosed = first[0] === last[0] && first[1] === last[1] && coords.length >= 4;
    const isArea =
      isClosed &&
      (Boolean(tags.building) || tags.natural === 'water' || tags.landuse === 'quarry');

    features.push({
      type: 'Feature',
      id: el.id,
      properties: tags,
      geometry: {
        type: isArea ? 'Polygon' : 'LineString',
        coordinates: isArea ? [coords] : coords
      }
    });
  }
  return { type: 'FeatureCollection', features };
}

function ingestFeatureCollection(gj) {
  const seenIds = new Set();
  for (const f of gj.features || []) {
    if (f.id && seenIds.has(f.id)) continue;
    if (f.id) seenIds.add(f.id);

    const geom = f.geometry;
    if (!geom) continue;

    if (geom.type === 'LineString') {
      const pts = geom.coordinates.map(([lon, lat]) => latLonToTile(lat, lon));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      atlasState.features.push({
        kind: 'line',
        props: f.properties || {},
        pts,
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys)
      });
    } else if (geom.type === 'Polygon' && geom.coordinates[0]) {
      const pts = geom.coordinates[0].map(([lon, lat]) => latLonToTile(lat, lon));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const poly = {
        kind: 'poly',
        props: f.properties || {},
        pts,
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys)
      };
      atlasState.features.push(poly);
      if (poly.props.landuse === 'quarry') {
        atlasState.quarryPolygons.push(poly);
      }
    }
  }
}

async function fetchAndCacheOverpassSector(bounds) {
  const { minLat, minLon, maxLat, maxLon } = bounds;
  const query = `
    [out:json][timeout:45];
    (
      way["highway"](${minLat},${minLon},${maxLat},${maxLon});
      way["building"](${minLat},${minLon},${maxLat},${maxLon});
      way["waterway"](${minLat},${minLon},${maxLat},${maxLon});
      way["natural"="water"](${minLat},${minLon},${maxLat},${maxLon});
      way["landuse"="quarry"](${minLat},${minLon},${maxLat},${maxLon});
    );
    out body;
    >;
    out skel qt;
  `;

  const resp = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `data=${encodeURIComponent(query)}`
  });
  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
  const raw = await resp.json();
  const gj = parseOsmElementsToGeoJSON(raw.elements || []);
  await writeCachedSector(SECTOR_KEY, { bounds, geojson: gj, savedAt: Date.now() });
  return gj;
}

export async function initAtlas(onReady) {
  // 1. Check static repo manifest first (if pre-sliced files exist)
  try {
    const res = await fetch('./atlas/manifest.json');
    if (res.ok) {
      const manifest = await res.json();
      if (manifest.origin) atlasBounds = { ...atlasBounds, ...manifest.origin };
      for (const tile of manifest.tiles || []) {
        const tRes = await fetch(`./atlas/${tile.file}`);
        if (tRes.ok) ingestFeatureCollection(await tRes.json());
      }
      if (atlasState.features.length > 0) {
        atlasState.loaded = true;
        atlasState.source = 'static-atlas';
        if (onReady) onReady(atlasState);
        return true;
      }
    }
  } catch {
    // Fall through to IndexedDB / Overpass auto-seed
  }

  // 2. Check iPad IndexedDB local cache
  const cached = await readCachedSector(SECTOR_KEY);
  if (cached && cached.geojson && cached.geojson.features?.length > 0) {
    atlasBounds = { ...DEFAULT_BOUNDS, ...(cached.bounds || {}) };
    ingestFeatureCollection(cached.geojson);
    atlasState.loaded = true;
    atlasState.source = 'indexeddb-cache';
    if (onReady) onReady(atlasState);
    return true;
  }

  // 3. Auto-fetch Rockmart, GA OSM square once and save permanently in IndexedDB
  try {
    const gj = await fetchAndCacheOverpassSector(DEFAULT_BOUNDS);
    if (gj.features.length > 0) {
      ingestFeatureCollection(gj);
      atlasState.loaded = true;
      atlasState.source = 'osm-live-seeded';
      if (onReady) onReady(atlasState);
      return true;
    }
  } catch {
    // Offline or Overpass busy: seamlessly keep procedural Rockmart map
  }

  return false;
}

export function pointInPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function applyAtlasToChunk(chunk, baseX, baseY, CHUNK_SIZE, stampCompoundBuilding) {
  if (!atlasState.loaded) return false;

  const maxX = baseX + CHUNK_SIZE;
  const maxY = baseY + CHUNK_SIZE;

  const nearby = atlasState.features.filter(
    (f) => f.maxX >= baseX - 6 && f.minX <= maxX + 6 && f.maxY >= baseY - 6 && f.minY <= maxY + 6
  );

  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    const wy = baseY + ly + 0.5;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = baseX + lx + 0.5;
      const idx = ly * CHUNK_SIZE + lx;

      if (wx < 10 || wy < 10 || wx >= MAP_SIZE - 10 || wy >= MAP_SIZE - 10) {
        chunk.tiles[idx] = 2;
        continue;
      }

      let tile = 0;
      let roadKind = 'none';

      for (const f of nearby) {
        if (f.kind === 'poly') {
          if (
            wx >= f.minX &&
            wx <= f.maxX &&
            wy >= f.minY &&
            wy <= f.maxY &&
            pointInPolygon(wx, wy, f.pts)
          ) {
            if (f.props.natural === 'water' || f.props.waterway) {
              tile = 4;
            } else if (f.props.landuse === 'quarry') {
              tile = 1;
            }
          }
        } else if (f.kind === 'line') {
          const hw = f.props.highway;
          const ww = f.props.waterway;
          if (!hw && !ww) continue;

          let minD = Infinity;
          for (let i = 0; i < f.pts.length - 1; i++) {
            const d = distToSegment(
              wx,
              wy,
              f.pts[i].x,
              f.pts[i].y,
              f.pts[i + 1].x,
              f.pts[i + 1].y
            );
            if (d < minD) minD = d;
          }

          if (ww && minD <= 2.4) {
            tile = 4;
          } else if (hw) {
            if (hw === 'motorway' || hw === 'trunk') {
              if (minD <= 0.55) {
                tile = 2;
                roadKind = 'median';
              } else if (minD <= 3.4) {
                tile = 3;
                roadKind = 'freeway';
              }
            } else if (hw === 'primary' || hw === 'secondary') {
              if (minD <= 2.3) {
                tile = 3;
                roadKind = 'highway';
              } else if (minD <= 3.2 && tile === 0) {
                tile = 1;
                roadKind = 'sidewalk';
              }
            } else if (hw === 'residential' || hw === 'tertiary' || hw === 'unclassified') {
              if (minD <= 1.6) {
                tile = 3;
                roadKind = 'street';
              } else if (minD <= 2.4 && tile === 0) {
                tile = 1;
                roadKind = 'sidewalk';
              }
            } else if (hw === 'track' || hw === 'service' || hw === 'path') {
              if (minD <= 1.2 && tile === 0) {
                tile = 5;
                roadKind = 'dirt';
              }
            }
          }
        }
      }

      chunk.tiles[idx] = tile;
      chunk.roadKinds[idx] = roadKind;
    }
  }

  let bIdx = 0;
  for (const f of nearby) {
    if (f.kind !== 'poly' || !f.props.building) continue;
    const cx = (f.minX + f.maxX) / 2;
    const cy = (f.minY + f.maxY) / 2;
    if (cx < baseX || cx >= maxX || cy < baseY || cy >= maxY) continue;

    const x1 = Math.max(12, Math.floor(f.minX));
    const y1 = Math.max(12, Math.floor(f.minY));
    const x2 = Math.min(MAP_SIZE - 13, Math.max(x1 + 5, Math.ceil(f.maxX)));
    const y2 = Math.min(MAP_SIZE - 13, Math.max(y1 + 5, Math.ceil(f.maxY)));

    const bTag = f.props.building;
    const isCommercial =
      Boolean(f.props.shop || f.props.amenity) ||
      ['commercial', 'retail', 'industrial', 'warehouse', 'school', 'hospital'].includes(bTag);

    const bName =
      f.props.name ||
      (f.props.amenity === 'police'
        ? 'Police Precinct'
        : isCommercial
        ? 'Rockmart Storefront'
        : 'Local Residence');

    const doorX = Math.floor((x1 + x2) / 2);
    const doorY = y2;
    const seed = ((x1 * 31 + y1 * 17) % 100) / 100;

    stampCompoundBuilding(chunk, {
      id: `osm-b-${chunk.cx}-${chunk.cy}-${bIdx++}`,
      name: bName,
      category: isCommercial ? 'commercial' : 'house',
      rects: [{ x1, y1, x2, y2 }],
      doorSpecs: [
        { x: doorX, y: doorY, state: isCommercial ? 'locked' : 'unlocked', dir: { dx: 0, dy: 1 } }
      ],
      seed
    });
  }

  return true;
}
