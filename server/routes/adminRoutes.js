const express = require('express');
const router = express.Router();
const dataStore = require('../services/dataStore');

// Get all drivers with optional status filtering
router.get('/drivers', (req, res) => {
  const { status } = req.query;
  let drivers = dataStore.getDrivers();
  if (status && status !== 'all') {
    drivers = drivers.filter(d => d.status.toLowerCase() === status.toLowerCase());
  }
  res.json({ success: true, count: drivers.length, data: drivers });
});

// Update driver verification status (Approve / Reject / Suspend)
router.post('/driver/:id/verify', (req, res) => {
  const { status, remarks } = req.body;
  if (!['approved', 'rejected', 'suspended', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid verification status' });
  }

  const driver = dataStore.getDriverById(req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  const updates = {
    status,
    verificationRemarks: remarks || `Status marked as ${status} by Administrator`,
    verifiedAt: new Date().toISOString()
  };

  // If rejecting or suspending, force driver offline
  if (status !== 'approved') {
    updates.isOnline = false;
  }

  const updatedDriver = dataStore.updateDriver(driver.id, updates);

  // Broadcast instant real-time notification to the driver's phone app
  if (req.app.get('io')) {
    req.app.get('io').emit(`driver_verification_${driver.id}`, {
      status,
      remarks: updates.verificationRemarks,
      driver: updatedDriver
    });
    req.app.get('io').emit('admin_feed_update', {
      type: 'DRIVER_STATUS_CHANGED',
      driverId: driver.id,
      status
    });
  }

  res.json({
    success: true,
    message: `Driver ${driver.name} is now ${status.toUpperCase()}`,
    data: updatedDriver
  });
});

// Get all rides
router.get('/rides', (req, res) => {
  const rides = dataStore.getRides();
  res.json({ success: true, count: rides.length, data: rides });
});

// Get SOS emergency alerts
router.get('/sos', (req, res) => {
  const alerts = dataStore.getSosAlerts();
  res.json({ success: true, count: alerts.length, data: alerts });
});

// Resolve SOS emergency alert
router.post('/sos/:id/resolve', (req, res) => {
  const { notes } = req.body;
  const alert = dataStore.resolveSosAlert(req.params.id, notes);
  if (!alert) return res.status(404).json({ error: 'SOS alert not found' });

  if (req.app.get('io')) {
    req.app.get('io').emit('admin_sos_resolved', alert);
  }

  res.json({ success: true, message: 'SOS alert resolved successfully', data: alert });
});

// Platform Overview Analytics & Metrics
router.get('/metrics', (req, res) => {
  const drivers = dataStore.getDrivers();
  const rides = dataStore.getRides();
  const sosAlerts = dataStore.getSosAlerts();

  const totalRides = rides.length;
  const completedRides = rides.filter(r => r.status === 'COMPLETED').length;

  let totalGmv = 0;
  let totalCommission = 0;
  rides.forEach(r => {
    if (r.fare) {
      totalGmv += (r.fare.totalFare || 0);
      totalCommission += (r.fare.platformCommission || 0);
    }
  });

  const onlineDrivers = drivers.filter(d => d.isOnline).length;
  const pendingApprovals = drivers.filter(d => d.status === 'pending').length;
  const activeSosCount = sosAlerts.filter(a => a.status === 'OPEN').length;

  res.json({
    success: true,
    data: {
      totalRides,
      completedRides,
      totalGmv: Math.round(totalGmv),
      totalCommission: Math.round(totalCommission),
      onlineDrivers,
      totalDrivers: drivers.length,
      pendingApprovals,
      activeSosCount
    }
  });
});

module.exports = router;
