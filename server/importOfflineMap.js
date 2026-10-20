/**
 * RiderForMe Offline Map Importer
 * 
 * Imports offline map tiles for Pincode 522426 (Macherla, Palnadu District, AP)
 * and the surrounding 50 KM radius.
 * 
 * Coverage area:
 *  - Macherla (Center: 16.4771, 79.4185)
 *  - Nagarjuna Sagar Dam & Vijayapuri
 *  - Ethipothala Waterfalls
 *  - Gurazala & Rentachintala
 *  - Durgi & Karampudi
 *  - Daida & Dachapalli
 *  - Piduguralla & Vinukonda corridor
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const offlineTileService = require('./services/offlineTileService');

const TILES_DIR = path.join(__dirname, 'offline-tiles');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadSingleTile(z, x, y, serverIdx = 0) {
  const filePath = offlineTileService.getTileFilePath(z, x, y);
  if (fs.existsSync(filePath)) {
    return { status: 'skipped', path: filePath };
  }

  const servers = [
    'https://a.basemaps.cartocdn.com/rastertiles/voyager',
    'https://b.basemaps.cartocdn.com/rastertiles/voyager',
    'https://c.basemaps.cartocdn.com/rastertiles/voyager',
    'https://tile.openstreetmap.org'
  ];

  const server = servers[serverIdx % servers.length];
  const url = `${server}/${z}/${x}/${y}.png`;

  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'RiderForMe-Offline-Importer/1.0 (admin@riderforme.local)'
      },
      timeout: 6000
    });

    if (res.status === 200 && res.data) {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, res.data);
      return { status: 'downloaded', size: res.data.length };
    }
  } catch (err) {
    return { status: 'failed', error: err.message };
  }

  return { status: 'failed' };
}

async function runImporter() {
  console.log('=============================================================');
  console.log('🗺️ RiderForMe Offline Map Importer');
  console.log('📌 Location: Macherla, Palnadu District, Andhra Pradesh');
  console.log('📮 Pincode:  522426');
  console.log('⭕ Radius:   50 Kilometers');
  console.log('=============================================================');

  const bbox = offlineTileService.get50kmBoundingBox();
  console.log(`Bounding Box: Lat [${bbox.minLat} to ${bbox.maxLat}], Lng [${bbox.minLng} to ${bbox.maxLng}]`);

  // Define zoom coverage:
  // Zoom 10-12: Full 50km radius regional view
  // Zoom 13: Full 50km road network
  // Zoom 14: Core Macherla town (522426) & Nagarjuna Sagar detailed streets
  const zoomConfigs = [
    { zoom: 10, bbox },
    { zoom: 11, bbox },
    { zoom: 12, bbox },
    { zoom: 13, bbox },
    // Zoom 14 focused on Macherla town & surrounding 15km
    {
      zoom: 14,
      bbox: {
        minLat: 16.4200,
        maxLat: 16.5300,
        minLng: 79.3600,
        maxLng: 79.4800
      }
    }
  ];

  const tasks = [];
  for (const cfg of zoomConfigs) {
    const z = cfg.zoom;
    const minX = offlineTileService.lon2tile(cfg.bbox.minLng, z);
    const maxX = offlineTileService.lon2tile(cfg.bbox.maxLng, z);
    const minY = offlineTileService.lat2tile(cfg.bbox.maxLat, z);
    const maxY = offlineTileService.lat2tile(cfg.bbox.minLat, z);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tasks.push({ z, x, y });
      }
    }
  }

  console.log(`Total Tiles to Import: ${tasks.length}`);
  console.log('Starting parallel batch download...\n');

  let downloadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let totalBytes = 0;

  // Process in small controlled batches of 5 with polite delay
  const batchSize = 5;
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    await Promise.all(batch.map(async (t, idx) => {
      const res = await downloadSingleTile(t.z, t.x, t.y, i + idx);
      if (res.status === 'downloaded') {
        downloadedCount++;
        totalBytes += res.size;
      } else if (res.status === 'skipped') {
        skippedCount++;
      } else {
        failedCount++;
      }
    }));

    const done = Math.min(i + batchSize, tasks.length);
    const pct = ((done / tasks.length) * 100).toFixed(1);
    process.stdout.write(`\r[Progress: ${pct}%] (${done}/${tasks.length}) | Downloaded: ${downloadedCount} | Existing: ${skippedCount} | Failed: ${failedCount}`);

    // Polite 80ms breather between batches to respect tile servers
    await sleep(80);
  }

  console.log('\n\n=============================================================');
  console.log('✅ Offline Map Import Completed Successfully!');
  console.log(`📦 Newly Downloaded: ${downloadedCount} tiles (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`💾 Already in Cache:  ${skippedCount} tiles`);
  console.log(`📍 Offline Coverage: 522426 Macherla & 50km radius`);
  console.log('=============================================================');

  const stats = offlineTileService.getOfflineStorageStats();
  console.log('Storage Status:', JSON.stringify(stats, null, 2));
}

if (require.main === module) {
  runImporter().catch(err => console.error('Importer error:', err));
}

module.exports = { runImporter };
