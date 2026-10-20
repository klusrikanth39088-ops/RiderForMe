const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const dataStore = require('./services/dataStore');
const fareEngine = require('./services/fareEngine');
const matchEngine = require('./services/matchEngine');

const gisRoutes = require('./routes/gisRoutes');
const fareRoutes = require('./routes/fareRoutes');
const rideRoutes = require('./routes/rideRoutes');
const driverRoutes = require('./routes/driverRoutes');
const adminRoutes = require('./routes/adminRoutes');
const tileRoutes = require('./routes/tileRoutes');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Pass Socket.IO instance to engines
fareEngine.setSocketIO(io);
matchEngine.setSocketIO(io);
app.set('io', io);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Uploaded Documents
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount API Endpoints
app.use('/api/gis', gisRoutes);
app.use('/api/fares', fareRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tiles', tileRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    platform: 'RiderForMe Hyper-Local Open-Source Mobility',
    activeOnlineCaptains: dataStore.getDrivers().filter(d => d.isOnline).length,
    timestamp: new Date().toISOString()
  });
});

// Serve Client Web & Mobile Apps
app.use('/customer', express.static(path.join(__dirname, '..', 'apps', 'customer-app')));
app.use('/driver', express.static(path.join(__dirname, '..', 'apps', 'driver-app')));
app.use('/admin', express.static(path.join(__dirname, '..', 'apps', 'admin-dashboard')));
app.use('/', express.static(path.join(__dirname, '..', 'apps', 'hub')));

// Socket.IO Real-time Coordination
io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Register client role (customer, driver, admin)
  socket.on('register_role', (data) => {
    socket.role = data.role;
    socket.entityId = data.id;
    if (data.role === 'driver') {
      socket.join(`driver_${data.id}`);
    } else if (data.role === 'admin') {
      socket.join('admin_desk');
    }
    console.log(`[Socket Registered] ${data.role} ${data.id || ''}`);
  });

  // Driver broadcasts real-time GPS position
  socket.on('driver_update_coords', ({ driverId, location }) => {
    if (!driverId || !location) return;
    dataStore.updateDriver(driverId, { location });
    io.emit('fleet_location_update', { driverId, location });
    io.emit(`driver_location_${driverId}`, location);
  });

  // Driver toggles online state
  socket.on('driver_toggle_online', ({ driverId, isOnline }) => {
    dataStore.updateDriver(driverId, { isOnline });
    io.emit('driver_status_change', { driverId, isOnline });
  });

  // Driver responds to 15-second overlay request
  socket.on('driver_accept_ride', async ({ rideId, driverId }) => {
    await matchEngine.acceptRide(rideId, driverId);
  });

  socket.on('driver_decline_ride', ({ rideId, driverId }) => {
    matchEngine.declineRide(rideId, driverId);
  });

  // Customer or Driver triggers emergency SOS panic button
  socket.on('trigger_sos', (payload) => {
    matchEngine.triggerSos(payload);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
=============================================================
🚀 RiderForMe Hyper-Local Open-Source Mobility Platform
=============================================================
📡 Backend Server running on: http://localhost:${PORT}
🗺️ Free Open-Source GIS: OpenStreetMap + Komoot Photon + OSRM
📱 Customer Mobile App:      http://localhost:${PORT}/customer
🛵 Driver Captain App:       http://localhost:${PORT}/driver
🖥️ Central Admin Dashboard:   http://localhost:${PORT}/admin
🎮 Unified Multi-Device Hub:  http://localhost:${PORT}/
=============================================================
  `);
});
