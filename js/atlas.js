const ATLAS_MAP_SIZE = 1024;

// Centered on Downtown Rockmart & Rockmart Slate Corp Quarry (34.0025° N, -85.0475° W)
// Uniform 1.60m per tile with cos(lat) longitude scaling -> 1,638m x 1,638m true-angle map
const CENTER_LAT = 34.0025;
const CENTER_LON = -85.0475;
const METERS_PER_TILE = 1.60;
const METERS_PER_DEG_LAT = 110922;
const METERS_PER_DEG_LON = 111320 * Math.cos((CENTER_LAT * Math.PI) / 180); // ~92,288m at 34°N

const HALF_SPAN_METERS = (ATLAS_MAP_SIZE * METERS_PER_TILE) / 2;
const DEFAULT_BOUNDS = {
  minLat: CENTER_LAT - HALF_SPAN_METERS / METERS_PER_DEG_LAT,
  maxLat: CENTER_LAT + HALF_SPAN_METERS / METERS_PER_DEG_LAT,
  minLon: CENTER_LON - HALF_SPAN_METERS / METERS_PER_DEG_LON,
  maxLon: CENTER_LON + HALF_SPAN_METERS / METERS_PER_DEG_LON
};

const DB_NAME = 'isowalk-osm-atlas';
const STORE_NAME = 'sectors';
const SECTOR_KEY = 'rockmart-ga-metric-v4';

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

export const atlasState = {
  loaded: false,
  status: 'loading',
  source: 'procedural',
  error: '',
  features: [],
  quarryPolygons: [],
  quarryCenter: { x: 540, y: 745 },
  policeLocation: null
};

export function latLonToTile(lat, lon) {
  const dxMeters = (lon - CENTER_LON) * METERS_PER_DEG_LON;
  const dyMeters = (CENTER_LAT - lat) * METERS_PER_DEG_LAT;
  return {
    x: ATLAS_MAP_SIZE / 2 + dxMeters / METERS_PER_TILE,
    y: ATLAS_MAP_SIZE / 2 + dyMeters / METERS_PER_TILE
  };
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
    // Ignore private browsing storage restrictions
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
  atlasState.features = [];
  atlasState.quarryPolygons = [];
  atlasState.policeLocation = null;
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
        id: f.id,
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
        id: f.id,
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
      if (poly.props.amenity === 'police') {
        atlasState.policeLocation = {
          x: Math.round((poly.minX + poly.maxX) / 2),
          y: Math.round((poly.minY + poly.maxY) / 2)
        };
      }
    }
  }

  if (atlasState.quarryPolygons.length > 0) {
    let best = atlasState.quarryPolygons[0];
    let bestArea = 0;
    for (const q of atlasState.quarryPolygons) {
      const area = (q.maxX - q.minX) * (q.maxY - q.minY);
      if (area > bestArea) {
        bestArea = area;
        best = q;
      }
    }
    atlasState.quarryCenter = {
      x: Math.round((best.minX + best.maxX) / 2),
      y: Math.round((best.minY + best.maxY) / 2)
    };
  }
}

async function fetchWithMirrors(bounds) {
  const { minLat, minLon, maxLat, maxLon } = bounds;
  const ql = `[out:json][timeout:25];way(${minLat},${minLon},${maxLat},${maxLon})[~"^(highway|building|waterway|landuse|natural)$"~"."];(._;>;);out body;`;

  let lastErr = null;
  for (const base of OVERPASS_MIRRORS) {
    try {
      const url = `${base}?data=${encodeURIComponent(ql)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const raw = await resp.json();
      const gj = parseOsmElementsToGeoJSON(raw.elements || []);
      if (gj.features.length > 0) {
        await writeCachedSector(SECTOR_KEY, { bounds, geojson: gj, savedAt: Date.now() });
        return gj;
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Overpass unreachable');
}

export async function initAtlas(onReady, forceRefresh = false) {
  atlasState.status = 'loading';

  if (!forceRefresh) {
    try {
      const res = await fetch('./atlas/rockmart.json');
      if (res.ok) {
        const gj = await res.json();
        if (gj.features?.length > 0) {
          ingestFeatureCollection(gj);
          atlasState.loaded = true;
          atlasState.status = 'ready';
          atlasState.source = 'static-json';
          if (onReady) onReady(atlasState);
          return true;
        }
      }
    } catch {
      // Continue to IndexedDB
    }

    const cached = await readCachedSector(SECTOR_KEY);
    if (cached && cached.geojson && cached.geojson.features?.length > 0) {
      ingestFeatureCollection(cached.geojson);
      atlasState.loaded = true;
      atlasState.status = 'ready';
      atlasState.source = 'indexeddb';
      if (onReady) onReady(atlasState);
      return true;
    }
  }

  try {
    const gj = await fetchWithMirrors(DEFAULT_BOUNDS);
    ingestFeatureCollection(gj);
    atlasState.loaded = true;
    atlasState.status = 'ready';
    atlasState.source = 'osm-live';
    if (onReady) onReady(atlasState);
    return true;
  } catch (err) {
    atlasState.status = 'fallback';
    atlasState.error = err?.message || 'Offline';
    if (onReady) onReady(atlasState);
    return false;
  }
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

// Rasterize exact OSM polygons & polylines onto a 32x32 chunk without bounding-box bloat
export function applyAtlasToChunk(
  chunk,
  baseX,
  baseY,
  CHUNK_SIZE,
  stampPolygonBuilding,
  isInsideQuarryHub
) {
  if (!atlasState.loaded) return false;

  const maxX = baseX + CHUNK_SIZE;
  const maxY = baseY + CHUNK_SIZE;

  const nearby = atlasState.features.filter(
    (f) => f.maxX >= baseX - 8 && f.minX <= maxX + 8 && f.maxY >= baseY - 8 && f.minY <= maxY + 8
  );

  // Pass 1: Waterways, Quarry Basin & Street Network (streets always carve cleanly through terrain)
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    const wy = baseY + ly + 0.5;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = baseX + lx + 0.5;
      const idx = ly * CHUNK_SIZE + lx;

      if (wx < 10 || wy < 10 || wx >= ATLAS_MAP_SIZE - 10 || wy >= ATLAS_MAP_SIZE - 10) {
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

          if (ww && minD <= 2.6) {
            tile = 4;
          } else if (hw) {
            if (hw === 'motorway' || hw === 'trunk') {
              if (minD <= 0.55) {
                tile = 2;
                roadKind = 'median';
              } else if (minD <= 3.5) {
                tile = 3;
                roadKind = 'freeway';
              }
            } else if (hw === 'primary' || hw === 'secondary') {
              if (minD <= 2.4) {
                tile = 3;
                roadKind = 'highway';
              } else if (minD <= 3.3 && tile === 0) {
                tile = 1;
                roadKind = 'sidewalk';
              }
            } else if (hw === 'residential' || hw === 'tertiary' || hw === 'unclassified') {
              if (minD <= 1.7) {
                tile = 3;
                roadKind = 'street';
              } else if (minD <= 2.5 && tile === 0) {
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

  // Pass 2: Rasterize TRUE OSM Building Polygons (even across chunk edges, never overlapping roads)
  for (const f of nearby) {
    if (f.kind !== 'poly' || !f.props.building) continue;

    const cx = (f.minX + f.maxX) / 2;
    const cy = (f.minY + f.maxY) / 2;
    if (isInsideQuarryHub && isInsideQuarryHub(cx, cy)) continue;

    const bx1 = Math.max(12, Math.floor(f.minX));
    const by1 = Math.max(12, Math.floor(f.minY));
    const bx2 = Math.min(ATLAS_MAP_SIZE - 13, Math.ceil(f.maxX));
    const by2 = Math.min(ATLAS_MAP_SIZE - 13, Math.ceil(f.maxY));

    // Collect only tiles whose centers actually lie inside the real OSM polygon!
    const cellSet = new Set();
    for (let y = by1; y <= by2; y++) {
      for (let x = bx1; x <= bx2; x++) {
        if (isInsideQuarryHub && isInsideQuarryHub(x + 0.5, y + 0.5)) continue;
        if (pointInPolygon(x + 0.5, y + 0.5, f.pts)) {
          cellSet.add(`${x},${y}`);
        }
      }
    }

    // Ensure tiny sheds/garages still get at least a 3x3 walkable interior footprint
    if (cellSet.size < 9) {
      const sx = Math.floor(cx) - 1;
      const sy = Math.floor(cy) - 1;
      for (let y = sy; y <= sy + 2; y++) {
        for (let x = sx; x <= sx + 2; x++) {
          if (!isInsideQuarryHub || !isInsideQuarryHub(x + 0.5, y + 0.5)) {
            cellSet.add(`${x},${y}`);
          }
        }
      }
    }

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

    const seed = ((Math.floor(cx) * 31 + Math.floor(cy) * 17) % 100) / 100;

    stampPolygonBuilding(chunk, {
      id: `osm-b-${f.id || `${Math.floor(cx)}-${Math.floor(cy)}`}`,
      name: bName,
      category: isCommercial ? 'commercial' : 'house',
      cellSet,
      polygonPts: f.pts,
      doorState: isCommercial ? 'locked' : 'unlocked',
      seed
    });
  }

  return true;
}
