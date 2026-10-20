const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TILES_DIR = path.join(__dirname, '..', 'offline-tiles');

// Ensure offline tiles root directory exists
if (!fs.existsSync(TILES_DIR)) {
  fs.mkdirSync(TILES_DIR, { recursive: true });
}

class OfflineTileService {
  constructor() {
    this.centerLat = 16.47708;
    this.centerLng = 79.41854;
    this.pincode = '522426';
    this.locationName = 'Macherla, Palnadu District, Andhra Pradesh';
    this.radiusKm = 50;

    // Upstream tile providers (Carto Voyager raster + OSM fallback)
    this.upstreamServers = [
      'https://a.basemaps.cartocdn.com/rastertiles/voyager',
      'https://b.basemaps.cartocdn.com/rastertiles/voyager',
      'https://c.basemaps.cartocdn.com/rastertiles/voyager',
      'https://tile.openstreetmap.org'
    ];
  }

  // Math: Convert WGS84 Lat/Lon to Slippy Map Tile Coordinate X, Y
  lon2tile(lon, zoom) {
    return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
  }

  lat2tile(lat, zoom) {
    return Math.floor(
      (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) /
      2 * Math.pow(2, zoom)
    );
  }

  tile2lon(x, z) {
    return (x / Math.pow(2, z) * 360 - 180);
  }

  tile2lat(y, z) {
    const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
  }

  /**
   * Calculate Bounding Box coordinates for 50km radius around Macherla 522426
   */
  get50kmBoundingBox() {
    const dLat = this.radiusKm / 111.0; // ~0.45 deg
    const dLng = this.radiusKm / (111.0 * Math.cos(this.centerLat * Math.PI / 180)); // ~0.47 deg

    return {
      minLat: +(this.centerLat - dLat).toFixed(5),
      maxLat: +(this.centerLat + dLat).toFixed(5),
      minLng: +(this.centerLng - dLng).toFixed(5),
      maxLng: +(this.centerLng + dLng).toFixed(5)
    };
  }

  getTileFilePath(z, x, y) {
    return path.join(TILES_DIR, String(z), String(x), `${y}.png`);
  }

  hasOfflineTile(z, x, y) {
    return fs.existsSync(this.getTileFilePath(z, x, y));
  }

  /**
   * Serve tile from local offline cache or dynamically fetch and store on disk
   */
  async handleTileRequest(req, res) {
    const z = parseInt(req.params.z);
    const x = parseInt(req.params.x);
    const y = parseInt(req.params.y.replace('.png', ''));

    if (isNaN(z) || isNaN(x) || isNaN(y)) {
      return res.status(400).send('Invalid tile coordinates');
    }

    const filePath = this.getTileFilePath(z, x, y);

    // 1. If tile exists in local offline storage, serve immediately!
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Tile-Cache', 'OFFLINE_LOCAL');
      return res.sendFile(filePath);
    }

    // 2. Tile not yet cached locally, download dynamically from upstream
    try {
      const server = this.upstreamServers[Math.abs(x + y) % this.upstreamServers.length];
      const url = `${server}/${z}/${x}/${y}.png`;

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'RiderForMe-Offline-Importer/1.0 (admin@riderforme.local)'
        },
        timeout: 5000
      });

      if (response.status === 200 && response.data) {
        // Save to disk for future offline access
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, response.data);

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('X-Tile-Cache', 'FETCHED_AND_SAVED');
        return res.send(Buffer.from(response.data));
      }
    } catch (err) {
      // 3. Fallback: completely offline with missing tile
      // Generate lightweight transparent or neutral SVG placeholder tile so Leaflet doesn't display broken image
    }

    // Transparent 1x1 PNG fallback
    const fallbackPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-Tile-Cache', 'OFFLINE_FALLBACK');
    res.send(fallbackPng);
  }

  /**
   * Count offline tiles stored on disk
   */
  getOfflineStorageStats() {
    let totalCount = 0;
    let totalBytes = 0;

    function countDir(dir) {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const f of files) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) {
          countDir(full);
        } else if (f.name.endsWith('.png')) {
          totalCount++;
          try {
            totalBytes += fs.statSync(full).size;
          } catch (e) {}
        }
      }
    }

    countDir(TILES_DIR);

    return {
      pincode: this.pincode,
      locationName: this.locationName,
      centerLat: this.centerLat,
      centerLng: this.centerLng,
      radiusKm: this.radiusKm,
      totalTilesDownloaded: totalCount,
      diskUsageMb: +(totalBytes / (1024 * 1024)).toFixed(2),
      tilesDirectory: TILES_DIR
    };
  }
}

const offlineTileService = new OfflineTileService();
module.exports = offlineTileService;
