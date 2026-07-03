import { Router } from 'express';
import { InMemoryTwinDataProvider } from '../twin/provider';
import { executeQuery } from '../databricks/sql';

/*
 * Geospatial GA showcase.
 *
 * Surfaces REAL Databricks spatial SQL (H3 + ST_ functions, GA) behind the map:
 *   1. H3 hexagon density — well count and avg oil per H3 cell (h3_longlatash3)
 *   2. Lease AOI spatial join — wells inside a lease polygon (ST_Contains)
 *   3. Facility proximity — nearest wells to the central processing facility (ST_Distance)
 *
 * The well_locations table is self-seeded from the app's own well coordinates,
 * so nothing is hardcoded in SQL and it re-seeds cleanly for a pod reset.
 */

const router = Router();
const provider = new InMemoryTwinDataProvider();

const SCHEMA = process.env.DEMO_SCHEMA || 'oil_pump_monitor_catalog.production_optimizer';
const TABLE = `${SCHEMA}.well_locations`;

// Central processing facility coordinate (BASE_LON + ~0.5, BASE_LAT) from the field layout.
const CPF = { lon: -103.5 + 0.5 * 0.09, lat: 31.9 };

let seeded = false;

async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  const state = await provider.loadState();
  const rows = state.wells
    .filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lon))
    .map((w) =>
      `('${w.id}', '${(w.name || '').replace(/'/g, '')}', '${w.type}', ` +
      `'${w.patternId || ''}', ${w.lat}, ${w.lon}, ${Math.round((w as any).oilRate || 0)})`,
    );

  await executeQuery(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
       well_id STRING, well_name STRING, well_type STRING, pattern_id STRING,
       lat DOUBLE, lon DOUBLE, oil_rate DOUBLE
     ) USING DELTA`,
  );
  await executeQuery(`DELETE FROM ${TABLE}`);
  if (rows.length) {
    // batch inserts to stay under statement size
    for (let i = 0; i < rows.length; i += 20) {
      await executeQuery(`INSERT INTO ${TABLE} VALUES ${rows.slice(i, i + 20).join(',')}`);
    }
  }
  seeded = true;
}

// Apache lease area of interest, a rectangle around the Apache pads (WKT polygon).
const AOI_WKT =
  'POLYGON((-103.6 32.05, -103.35 32.05, -103.35 31.75, -103.6 31.75, -103.6 32.05))';

const QUERIES: { key: string; title: string; description: string; sql: string }[] = [
  {
    key: 'h3_density',
    title: 'H3 hex density',
    description: 'Wells and average oil rate aggregated into H3 resolution-7 hexagons.',
    sql:
      `SELECT h3_longlatash3(lon, lat, 7) AS h3_cell,\n` +
      `       count(*) AS wells,\n` +
      `       round(avg(oil_rate)) AS avg_oil_bopd\n` +
      `FROM ${TABLE}\n` +
      `GROUP BY 1\n` +
      `ORDER BY wells DESC`,
  },
  {
    key: 'lease_aoi',
    title: 'Lease AOI spatial join',
    description: 'Wells that fall inside the Apache lease polygon via ST_Contains.',
    sql:
      `SELECT well_id, well_name, well_type\n` +
      `FROM ${TABLE}\n` +
      `WHERE ST_Contains(\n` +
      `        ST_GeomFromText('${AOI_WKT}'),\n` +
      `        ST_Point(lon, lat)\n` +
      `      )\n` +
      `ORDER BY well_id`,
  },
  {
    key: 'facility_proximity',
    title: 'Facility proximity',
    description: 'Nearest wells to the central processing facility ranked by ST_Distance (km).',
    sql:
      `SELECT well_id, well_name,\n` +
      `       round(ST_Distance(\n` +
      `         ST_Point(lon, lat),\n` +
      `         ST_Point(${CPF.lon}, ${CPF.lat})\n` +
      `       ) * 111.0, 2) AS approx_km\n` +
      `FROM ${TABLE}\n` +
      `ORDER BY approx_km ASC\n` +
      `LIMIT 8`,
  },
];

// ── H3 hexes as GeoJSON for a map choropleth layer ──────────────────────────
router.get('/geospatial/h3-hexes', async (_req, res) => {
  try {
    await ensureSeeded()
    const rows = await executeQuery(
      `SELECT h3_boundaryasgeojson(cell) AS geojson, wells, avg_oil\n` +
      `FROM (\n` +
      `  SELECT h3_longlatash3(lon, lat, 6) AS cell, count(*) AS wells, round(avg(oil_rate)) AS avg_oil\n` +
      `  FROM ${TABLE} GROUP BY 1\n` +
      `)`,
    )
    const features = rows.map((r: any) => {
      let geometry: any = null
      try { geometry = JSON.parse(r.geojson) } catch { /* skip */ }
      return geometry ? { type: 'Feature', geometry, properties: { wells: Number(r.wells), avg_oil: Number(r.avg_oil) } } : null
    }).filter(Boolean)
    res.json({ type: 'FeatureCollection', features, resolution: 6, sql: 'h3_longlatash3(lon,lat,6) + h3_boundaryasgeojson(cell)' })
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

// ── CO2 plume polygons (per injector) + producers inside via ST_Contains ─────
function plumePolygon(lon: number, lat: number, rx: number, ry: number, rot: number): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * 2 * Math.PI
    const px = Math.cos(a) * rx, py = Math.sin(a) * ry
    const c = Math.cos(rot), s = Math.sin(rot)
    pts.push([lon + (px * c - py * s), lat + (px * s + py * c)])
  }
  pts.push(pts[0])
  return pts
}

router.get('/geospatial/plumes', async (_req, res) => {
  try {
    await ensureSeeded()
    const state = await provider.loadState()
    const injectors = state.wells.filter((w: any) =>
      (w.type === 'injector' || w.type === 'WAG') && Number.isFinite(w.lat) && Number.isFinite(w.lon))
    const features: any[] = []
    for (const inj of injectors as any[]) {
      // Plume size scaled by CO2 injection; oriented NE (regional migration direction).
      const scale = Math.max(0.5, Math.min(1.6, (inj.co2InjRate || 40) / 50))
      const ring = plumePolygon(inj.lon, inj.lat, 0.075 * scale, 0.045 * scale, 0.5)
      const wkt = 'POLYGON((' + ring.map(([x, y]) => `${x} ${y}`).join(', ') + '))'
      let inside: string[] = []
      try {
        const r = await executeQuery(
          `SELECT well_id FROM ${TABLE}\n` +
          `WHERE well_type = 'producer' AND ST_Contains(ST_GeomFromText('${wkt}'), ST_Point(lon, lat))`,
        )
        inside = r.map((x: any) => x.well_id)
      } catch { /* leave empty */ }
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { injector: inj.id, pattern: inj.patternId || '', producers_in_front: inside.length, wells_inside: inside.join(',') },
      })
    }
    res.json({ type: 'FeatureCollection', features, method: "ST_Contains(ST_GeomFromText(plume), ST_Point(well))" })
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

router.get('/geospatial/spatial-sql', async (_req, res) => {
  try {
    await ensureSeeded();
    const results = [];
    for (const q of QUERIES) {
      try {
        const rows = await executeQuery(q.sql);
        results.push({ ...q, rows, error: null });
      } catch (e: any) {
        results.push({ ...q, rows: [], error: String(e?.message || e).slice(0, 200) });
      }
    }
    res.json({ table: TABLE, functions: ['h3_longlatash3', 'ST_Point', 'ST_Contains', 'ST_GeomFromText', 'ST_Distance'], results });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

export default router;
