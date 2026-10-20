const express = require('express');
const router = express.Router();
const offlineTileService = require('../services/offlineTileService');

// Serve offline map tile (with dynamic caching)
router.get('/:z/:x/:y', (req, res) => {
  offlineTileService.handleTileRequest(req, res);
});

// Offline coverage statistics
router.get('/status/info', (req, res) => {
  try {
    const stats = offlineTileService.getOfflineStorageStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get offline tile status' });
  }
});

// Trigger background tile import
router.post('/import', (req, res) => {
  try {
    const { runImporter } = require('../importOfflineMap');
    runImporter();
    res.json({
      success: true,
      message: 'Offline map import triggered for Pincode 522426 and 50km radius.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start tile import', message: err.message });
  }
});

module.exports = router;
