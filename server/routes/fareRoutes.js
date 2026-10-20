const express = require('express');
const router = express.Router();
const fareEngine = require('../services/fareEngine');

// Get all fare configs
router.get('/', (req, res) => {
  try {
    const fares = fareEngine.getAllFares();
    res.json({ success: true, data: fares });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve fares' });
  }
});

// Calculate fare preview for given distance and duration
router.post('/calculate', (req, res) => {
  try {
    const { distanceKm, durationMin, serviceType } = req.body;
    if (distanceKm === undefined || durationMin === undefined) {
      return res.status(400).json({ error: 'distanceKm and durationMin are required' });
    }

    if (serviceType) {
      const calculation = fareEngine.calculateFare(serviceType, parseFloat(distanceKm), parseFloat(durationMin));
      return res.json({ success: true, data: calculation });
    }

    const allServices = fareEngine.calculateAllServices(parseFloat(distanceKm), parseFloat(durationMin));
    res.json({ success: true, data: allServices });
  } catch (err) {
    res.status(500).json({ error: 'Failed to calculate fare', message: err.message });
  }
});

// Update dynamic fare settings from Admin Dashboard
router.post('/update', (req, res) => {
  try {
    const { fares } = req.body;
    if (!fares || typeof fares !== 'object') {
      return res.status(400).json({ error: 'fares object is required' });
    }

    const updated = fareEngine.updatePricing(fares);
    res.json({
      success: true,
      message: 'Fare configuration updated successfully and synced with all active apps in real-time.',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update fares', message: err.message });
  }
});

module.exports = router;
