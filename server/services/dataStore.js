const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'store.json');

const DEFAULT_FARES = {
  bike: {
    service: 'bike',
    name: 'Bike Taxi',
    icon: '🛵',
    baseFare: 25,
    baseKm: 2.0,
    perKm: 8.0,
    perMinute: 0.50,
    commissionRate: 10, // 10% platform cut
    surgeMultiplier: 1.0,
    description: 'Fastest through traffic, solo rider'
  },
  auto: {
    service: 'auto',
    name: 'Auto Rickshaw',
    icon: '🛺',
    baseFare: 40,
    baseKm: 2.0,
    perKm: 14.0,
    perMinute: 1.00,
    commissionRate: 10,
    surgeMultiplier: 1.0,
    description: 'Comfortable 3-seater, open breeze'
  },
  parcel: {
    service: 'parcel',
    name: 'Parcel Delivery',
    icon: '📦',
    baseFare: 30,
    baseKm: 2.0,
    perKm: 10.0,
    perMinute: 0.75,
    commissionRate: 12,
    surgeMultiplier: 1.0,
    description: 'Door-to-door documents & parcels'
  }
};

const DEFAULT_DRIVERS = [
  {
    id: 'drv-001',
    name: 'Venkatesh Naik',
    phone: '+91 98765 43210',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    serviceType: 'bike',
    vehicleNumber: 'AP-07-TA-4821',
    vehicleModel: 'Hero Splendor Plus',
    rating: 4.88,
    totalRides: 1420,
    status: 'approved', // 'pending' | 'approved' | 'rejected' | 'suspended'
    isOnline: true,
    location: { lat: 16.4785, lng: 79.4210, heading: 45, speed: 24 }, // Macherla RTC Bus Stand
    walletBalance: 2450.50,
    todayEarnings: 840.00,
    documents: {
      aadhaar: '/uploads/sample_aadhaar.png',
      drivingLicense: '/uploads/sample_dl.png',
      vehicleRc: '/uploads/sample_rc.png',
      uploadedAt: '2026-10-18T10:30:00Z'
    }
  },
  {
    id: 'drv-002',
    name: 'Shiva Prasad',
    phone: '+91 98234 11223',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    serviceType: 'auto',
    vehicleNumber: 'AP-07-UA-9932',
    vehicleModel: 'Bajaj RE Compact 4S',
    rating: 4.92,
    totalRides: 2890,
    status: 'approved',
    isOnline: true,
    location: { lat: 16.4820, lng: 79.4160, heading: 120, speed: 20 }, // Temple Street, Macherla
    walletBalance: 3120.00,
    todayEarnings: 1150.00,
    documents: {
      aadhaar: '/uploads/sample_aadhaar.png',
      drivingLicense: '/uploads/sample_dl.png',
      vehicleRc: '/uploads/sample_rc.png',
      uploadedAt: '2026-10-15T09:15:00Z'
    }
  },
  {
    id: 'drv-003',
    name: 'Koti Reddy',
    phone: '+91 97112 88440',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    serviceType: 'bike',
    vehicleNumber: 'AP-07-MK-7120',
    vehicleModel: 'Honda Activa 6G',
    rating: 4.79,
    totalRides: 870,
    status: 'approved',
    isOnline: true,
    location: { lat: 16.4900, lng: 79.4300, heading: 270, speed: 26 }, // Ethipothala Road, Macherla
    walletBalance: 1680.00,
    todayEarnings: 620.00,
    documents: {
      aadhaar: '/uploads/sample_aadhaar.png',
      drivingLicense: '/uploads/sample_dl.png',
      vehicleRc: '/uploads/sample_rc.png',
      uploadedAt: '2026-10-17T14:20:00Z'
    }
  },
  {
    id: 'drv-004',
    name: 'Ramesh Babu',
    phone: '+91 99001 55667',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
    serviceType: 'parcel',
    vehicleNumber: 'AP-07-TR-5544',
    vehicleModel: 'TVS Jupiter / Cargo Box',
    rating: 4.95,
    totalRides: 630,
    status: 'approved',
    isOnline: true,
    location: { lat: 16.4850, lng: 79.4050, heading: 90, speed: 18 }, // Nagarjuna Sagar Road Junction
    walletBalance: 1980.00,
    todayEarnings: 930.00,
    documents: {
      aadhaar: '/uploads/sample_aadhaar.png',
      drivingLicense: '/uploads/sample_dl.png',
      vehicleRc: '/uploads/sample_rc.png',
      uploadedAt: '2026-10-16T11:45:00Z'
    }
  },
  {
    id: 'drv-005',
    name: 'Baji Shaik',
    phone: '+91 91234 56789',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150',
    serviceType: 'bike',
    vehicleNumber: 'AP-07-ZZ-1204',
    vehicleModel: 'Yamaha FZ-S',
    rating: 5.0,
    totalRides: 0,
    status: 'pending', // Pending Admin Approval
    isOnline: false,
    location: { lat: 16.4650, lng: 79.4280, heading: 0, speed: 0 }, // Durgi Road, Macherla
    walletBalance: 500.00,
    todayEarnings: 0.00,
    documents: {
      aadhaar: '/uploads/sample_aadhaar.png',
      drivingLicense: '/uploads/sample_dl.png',
      vehicleRc: '/uploads/sample_rc.png',
      uploadedAt: '2026-10-20T08:00:00Z'
    }
  }
];

class DataStore {
  constructor() {
    this.fares = { ...DEFAULT_FARES };
    this.drivers = [...DEFAULT_DRIVERS];
    this.rides = [];
    this.sosAlerts = [];
    this.walletLedgers = {};
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.fares) this.fares = parsed.fares;
        if (parsed.drivers) this.drivers = parsed.drivers;
        if (parsed.rides) this.rides = parsed.rides;
        if (parsed.sosAlerts) this.sosAlerts = parsed.sosAlerts;
        if (parsed.walletLedgers) this.walletLedgers = parsed.walletLedgers;
      } else {
        this.save();
      }
    } catch (err) {
      console.warn('DataStore load warning, using defaults:', err.message);
    }
  }

  save() {
    try {
      const data = {
        fares: this.fares,
        drivers: this.drivers,
        rides: this.rides,
        sosAlerts: this.sosAlerts,
        walletLedgers: this.walletLedgers
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('DataStore save error:', err.message);
    }
  }

  // Fares
  getFares() {
    return this.fares;
  }

  updateFares(newFares) {
    this.fares = { ...this.fares, ...newFares };
    this.save();
    return this.fares;
  }

  // Drivers
  getDrivers() {
    return this.drivers;
  }

  getDriverById(id) {
    return this.drivers.find(d => d.id === id);
  }

  updateDriver(id, updates) {
    const idx = this.drivers.findIndex(d => d.id === id);
    if (idx !== -1) {
      this.drivers[idx] = { ...this.drivers[idx], ...updates };
      this.save();
      return this.drivers[idx];
    }
    return null;
  }

  addDriver(driverData) {
    const newDriver = {
      id: `drv-${Date.now().toString(36)}`,
      status: 'pending',
      isOnline: false,
      rating: 5.0,
      totalRides: 0,
      walletBalance: 0,
      todayEarnings: 0,
      location: { lat: 12.9352, lng: 77.6245, heading: 0, speed: 0 },
      ...driverData
    };
    this.drivers.push(newDriver);
    this.save();
    return newDriver;
  }

  // Rides
  getRides() {
    return this.rides;
  }

  getRideById(id) {
    return this.rides.find(r => r.id === id);
  }

  addRide(ride) {
    this.rides.unshift(ride);
    // Keep max 200 in memory
    if (this.rides.length > 200) this.rides.pop();
    this.save();
    return ride;
  }

  updateRide(id, updates) {
    const idx = this.rides.findIndex(r => r.id === id);
    if (idx !== -1) {
      this.rides[idx] = { ...this.rides[idx], ...updates };
      this.save();
      return this.rides[idx];
    }
    return null;
  }

  // SOS Alerts
  getSosAlerts() {
    return this.sosAlerts;
  }

  addSosAlert(alert) {
    this.sosAlerts.unshift(alert);
    this.save();
    return alert;
  }

  resolveSosAlert(id, notes) {
    const alert = this.sosAlerts.find(a => a.id === id);
    if (alert) {
      alert.status = 'RESOLVED';
      alert.resolvedAt = new Date().toISOString();
      alert.notes = notes || 'Emergency handled by safety operations team.';
      this.save();
      return alert;
    }
    return null;
  }

  // Wallet Ledgers
  recordTransaction(driverId, tx) {
    if (!this.walletLedgers[driverId]) {
      this.walletLedgers[driverId] = [];
    }
    const entry = {
      id: `tx-${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      ...tx
    };
    this.walletLedgers[driverId].unshift(entry);
    this.save();
    return entry;
  }

  getLedger(driverId) {
    return this.walletLedgers[driverId] || [];
  }
}

const dataStore = new DataStore();
module.exports = dataStore;
