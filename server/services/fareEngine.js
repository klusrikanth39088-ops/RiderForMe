const dataStore = require('./dataStore');

class FareEngine {
  constructor() {
    this.io = null;
  }

  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Get all active fare configurations
   */
  getAllFares() {
    return dataStore.getFares();
  }

  /**
   * Get fare configuration for specific service
   */
  getFare(serviceType) {
    const fares = dataStore.getFares();
    return fares[serviceType] || fares.bike;
  }

  /**
   * Calculate detailed fare for a ride
   * @param {string} serviceType - 'bike' | 'auto' | 'parcel'
   * @param {number} distanceKm - Road distance in kilometers
   * @param {number} durationMin - Estimated trip duration in minutes
   */
  calculateFare(serviceType, distanceKm, durationMin) {
    const config = this.getFare(serviceType);

    const baseFare = parseFloat(config.baseFare) || 25;
    const baseKm = parseFloat(config.baseKm) || 2.0;
    const perKm = parseFloat(config.perKm) || 8.0;
    const perMinute = parseFloat(config.perMinute) || 0.50;
    const commissionRate = parseFloat(config.commissionRate) || 10;
    const surgeMultiplier = parseFloat(config.surgeMultiplier) || 1.0;

    const extraKm = Math.max(0, distanceKm - baseKm);
    const distanceCharge = +(extraKm * perKm).toFixed(2);
    const timeCharge = +(durationMin * perMinute).toFixed(2);
    const subtotal = +(baseFare + distanceCharge + timeCharge).toFixed(2);
    const totalFare = Math.max(baseFare, Math.round(subtotal * surgeMultiplier));

    const platformCommission = +(totalFare * (commissionRate / 100)).toFixed(2);
    const driverEarnings = +(totalFare - platformCommission).toFixed(2);

    return {
      serviceType,
      name: config.name,
      icon: config.icon,
      distanceKm: +distanceKm.toFixed(2),
      durationMin: +durationMin.toFixed(1),
      baseFare,
      baseKm,
      perKm,
      perMinute,
      distanceCharge,
      timeCharge,
      subtotal,
      surgeMultiplier,
      totalFare,
      platformCommission,
      commissionRate,
      driverEarnings,
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * Calculate fares for all available services at once for comparison
   */
  calculateAllServices(distanceKm, durationMin) {
    const fares = dataStore.getFares();
    const results = {};
    for (const key of Object.keys(fares)) {
      results[key] = this.calculateFare(key, distanceKm, durationMin);
    }
    return results;
  }

  /**
   * Update fare rules dynamically from Admin Dashboard
   * Instantly propagates to active memory and notifies all connected apps
   */
  updatePricing(newFares) {
    const updated = dataStore.updateFares(newFares);

    // Broadcast to all connected customer apps, driver apps, and admin dashboards
    if (this.io) {
      this.io.emit('fare_rates_updated', {
        fares: updated,
        timestamp: new Date().toISOString(),
        message: 'Fare rates updated dynamically by Administrator'
      });
    }

    return updated;
  }
}

const fareEngine = new FareEngine();
module.exports = fareEngine;
