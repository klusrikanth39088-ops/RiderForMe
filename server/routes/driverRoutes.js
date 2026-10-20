const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dataStore = require('../services/dataStore');
const matchEngine = require('../services/matchEngine');

// Setup multer storage for KYC document uploads
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const field = file.fieldname || 'doc';
    cb(null, `${field}-${Date.now()}-${Math.round(Math.random() * 1e4)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Register new driver
router.post('/register', upload.fields([
  { name: 'aadhaar', maxCount: 1 },
  { name: 'drivingLicense', maxCount: 1 },
  { name: 'vehicleRc', maxCount: 1 }
]), (req, res) => {
  try {
    const { name, phone, serviceType, vehicleNumber, vehicleModel } = req.body;

    const documents = {
      aadhaar: req.files && req.files.aadhaar ? `/uploads/${req.files.aadhaar[0].filename}` : '/uploads/sample_aadhaar.png',
      drivingLicense: req.files && req.files.drivingLicense ? `/uploads/${req.files.drivingLicense[0].filename}` : '/uploads/sample_dl.png',
      vehicleRc: req.files && req.files.vehicleRc ? `/uploads/${req.files.vehicleRc[0].filename}` : '/uploads/sample_rc.png',
      uploadedAt: new Date().toISOString()
    };

    const newDriver = dataStore.addDriver({
      name: name || 'Captain Partner',
      phone: phone || '+91 90000 00000',
      serviceType: serviceType || 'bike',
      vehicleNumber: vehicleNumber || 'KA-01-NEW-0001',
      vehicleModel: vehicleModel || 'Two-Wheeler',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      documents
    });

    if (req.app.get('io')) {
      req.app.get('io').emit('admin_new_driver', newDriver);
    }

    res.json({
      success: true,
      message: 'Driver registration submitted successfully. Status is Pending Approval.',
      data: newDriver
    });
  } catch (err) {
    console.error('Driver registration error:', err.message);
    res.status(500).json({ error: 'Failed to register driver' });
  }
});

// Get driver by ID
router.get('/:id', (req, res) => {
  const driver = dataStore.getDriverById(req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });
  res.json({ success: true, data: driver });
});

// Toggle Online / Offline status
router.post('/:id/toggle-online', (req, res) => {
  const driver = dataStore.getDriverById(req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  // Only approved drivers can go online
  if (driver.status !== 'approved' && !driver.isOnline) {
    return res.status(403).json({
      error: 'Account Pending Verification',
      message: `Your account is currently "${driver.status.toUpperCase()}". You can only go online after administrative verification.`
    });
  }

  const newOnlineState = !driver.isOnline;
  const updated = dataStore.updateDriver(driver.id, { isOnline: newOnlineState });

  if (req.app.get('io')) {
    req.app.get('io').emit('driver_status_change', {
      driverId: driver.id,
      isOnline: newOnlineState,
      location: driver.location
    });
  }

  res.json({ success: true, isOnline: newOnlineState, data: updated });
});

// Update driver GPS location
router.post('/:id/location', (req, res) => {
  const { lat, lng, heading, speed } = req.body;
  const driver = dataStore.getDriverById(req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  const updatedLoc = {
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    heading: parseFloat(heading) || 0,
    speed: parseFloat(speed) || 0
  };

  dataStore.updateDriver(driver.id, { location: updatedLoc });

  if (req.app.get('io')) {
    req.app.get('io').emit(`driver_location_${driver.id}`, updatedLoc);
    req.app.get('io').emit('fleet_location_update', { driverId: driver.id, location: updatedLoc });
  }

  res.json({ success: true, location: updatedLoc });
});

// Accept Ride (called from 15-second overlay banner)
router.post('/:id/accept-ride', async (req, res) => {
  const { rideId } = req.body;
  const ride = await matchEngine.acceptRide(rideId, req.params.id);
  if (!ride) return res.status(400).json({ error: 'Could not accept ride' });
  res.json({ success: true, data: ride });
});

// Decline Ride
router.post('/:id/decline-ride', (req, res) => {
  const { rideId } = req.body;
  matchEngine.declineRide(rideId, req.params.id);
  res.json({ success: true, message: 'Ride declined' });
});

// Driver Wallet & Financial Ledger
router.get('/:id/wallet', (req, res) => {
  const driver = dataStore.getDriverById(req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  const ledger = dataStore.getLedger(driver.id);
  res.json({
    success: true,
    data: {
      walletBalance: driver.walletBalance,
      todayEarnings: driver.todayEarnings,
      totalRides: driver.totalRides,
      ledger
    }
  });
});

// Request Instant Payout Settlement
router.post('/:id/payout', (req, res) => {
  const { amount, upiId } = req.body;
  const driver = dataStore.getDriverById(req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  const payoutAmount = parseFloat(amount) || driver.walletBalance;
  if (payoutAmount <= 0 || payoutAmount > driver.walletBalance) {
    return res.status(400).json({ error: 'Invalid payout amount requested' });
  }

  const remaining = +(driver.walletBalance - payoutAmount).toFixed(2);
  dataStore.updateDriver(driver.id, { walletBalance: remaining });

  const transaction = dataStore.recordTransaction(driver.id, {
    grossFare: 0,
    commission: 0,
    netEarnings: -payoutAmount,
    payoutUpi: upiId || 'driver@okhdfcbank',
    note: `Instant Payout settled: ₹${payoutAmount} transferred via UPI to ${upiId || 'driver@upi'}`
  });

  res.json({
    success: true,
    message: `Instant settlement of ₹${payoutAmount} processed successfully!`,
    newBalance: remaining,
    transaction
  });
});

module.exports = router;
