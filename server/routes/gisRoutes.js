const express = require('express');
const router = express.Router();
const gisService = require('../services/gisService');

// Address Autocomplete / Geocoding search (Photon + Nominatim fallback)
router.get('/search', async (req, res) => {
  try {
    const { q, lat, lon } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }
    const results = await gisService.search(
      q,
      lat ? parseFloat(lat) : 12.9716,
      lon ? parseFloat(lon) : 77.5946
    );
    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    console.error('GIS search error:', err.message);
    res.status(500).json({ error: 'Failed to search locations', message: err.message });
  }
});

// Reverse geocode
router.get('/reverse', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({ error: 'lat and lon are required' });
    }
    const result = await gisService.reverse(parseFloat(lat), parseFloat(lon));
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('GIS reverse error:', err.message);
    res.status(500).json({ error: 'Failed to reverse geocode', message: err.message });
  }
});

// OSRM Road Route, Distance, ETA & Navigation steps
router.get('/route', async (req, res) => {
  try {
    const { fromLat, fromLng, toLat, toLng } = req.query;
    if (!fromLat || !fromLng || !toLat || !toLng) {
      return res.status(400).json({ error: 'fromLat, fromLng, toLat, toLng are required' });
    }
    const route = await gisService.getRoute(
      parseFloat(fromLat), parseFloat(fromLng),
      parseFloat(toLat), parseFloat(toLng)
    );
    res.json({ success: true, data: route });
  } catch (err) {
    console.error('GIS route error:', err.message);
    res.status(500).json({ error: 'Failed to calculate route', message: err.message });
  }
});

module.exports = router;
