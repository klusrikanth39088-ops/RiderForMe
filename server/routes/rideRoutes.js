const express = require('express');
const router = express.Router();
const matchEngine = require('../services/matchEngine');
const dataStore = require('../services/dataStore');

// Create new ride booking
router.post('/create', async (req, res) => {
  try {
    const { customer, pickup, dropoff, serviceType, paymentMethod } = req.body;
    if (!pickup || !dropoff || !serviceType) {
      return res.status(400).json({ error: 'pickup, dropoff, and serviceType are required' });
    }

    const ride = await matchEngine.createRideRequest({
      customer: customer || {},
      pickup,
      dropoff,
      serviceType,
      paymentMethod: paymentMethod || 'cod'
    });

    res.json({ success: true, data: ride });
  } catch (err) {
    console.error('Ride creation error:', err.message);
    res.status(500).json({ error: 'Failed to create ride', message: err.message });
  }
});

// Get all active / recent rides
router.get('/', (req, res) => {
  try {
    const rides = dataStore.getRides();
    res.json({ success: true, count: rides.length, data: rides });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve rides' });
  }
});

// Get single ride details
router.get('/:id', (req, res) => {
  try {
    const ride = dataStore.getRideById(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    res.json({ success: true, data: ride });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve ride' });
  }
});

// Start trip with 4-digit OTP verification
router.post('/:id/start', (req, res) => {
  try {
    const { otp } = req.body;
    const result = matchEngine.startRide(req.params.id, otp);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    res.json({ success: true, data: result.ride });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start ride', message: err.message });
  }
});

// Complete trip
router.post('/:id/complete', (req, res) => {
  try {
    const ride = matchEngine.completeRide(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    res.json({ success: true, data: ride });
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete ride', message: err.message });
  }
});

// Emergency SOS Trigger
router.post('/:id/sos', (req, res) => {
  try {
    const { callerType, callerName, callerPhone, lat, lng } = req.body;
    const alert = matchEngine.triggerSos({
      rideId: req.params.id,
      callerType,
      callerName,
      callerPhone,
      lat,
      lng
    });
    res.json({ success: true, message: 'SOS emergency broadcast dispatched to safety control desk', data: alert });
  } catch (err) {
    res.status(500).json({ error: 'Failed to trigger SOS', message: err.message });
  }
});

// Cancel ride
router.post('/:id/cancel', (req, res) => {
  try {
    const ride = dataStore.getRideById(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    ride.status = 'CANCELLED';
    ride.cancelledAt = new Date().toISOString();
    dataStore.updateRide(ride.id, ride);

    if (ride.driverId) {
      dataStore.updateDriver(ride.driverId, { activeRideId: null });
    }

    if (req.app.get('io')) {
      req.app.get('io').emit(`ride_status_${ride.id}`, ride);
      req.app.get('io').emit('ride_updated', ride);
    }

    res.json({ success: true, data: ride });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel ride' });
  }
});

module.exports = router;
