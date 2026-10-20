const { v4: uuidv4 } = require('uuid');
const dataStore = require('./dataStore');
const gisService = require('./gisService');
const fareEngine = require('./fareEngine');

class MatchEngine {
  constructor() {
    this.io = null;
    this.activeSimulations = new Map(); // rideId -> intervalId
    this.pendingTimeouts = new Map(); // rideId -> timer
  }

  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Helper to calculate straight distance in km between two lat/lng points
   */
  getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Create a new ride booking request from customer
   */
  async createRideRequest({ customer, pickup, dropoff, serviceType, paymentMethod }) {
    // 1. Get exact OSRM road route & distance
    const routeData = await gisService.getRoute(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    const fare = fareEngine.calculateFare(serviceType, routeData.distanceKm, routeData.durationMin);

    // 2. Generate 4-digit ride verification OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    const rideId = `ride-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
    const ride = {
      id: rideId,
      customer: {
        name: customer.name || 'Priya Sharma',
        phone: customer.phone || '+91 98765 00123'
      },
      serviceType,
      pickup,
      dropoff,
      distanceKm: routeData.distanceKm,
      durationMin: routeData.durationMin,
      routeCoordinates: routeData.coordinates,
      navigationSteps: routeData.steps,
      fare,
      paymentMethod: paymentMethod || 'cod',
      paymentStatus: 'pending',
      otp,
      status: 'SEARCHING', // 'SEARCHING' | 'REQUESTED' | 'ASSIGNED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
      driverId: null,
      driver: null,
      createdAt: new Date().toISOString()
    };

    dataStore.addRide(ride);

    // Notify Admin of new ride request
    if (this.io) {
      this.io.emit('ride_created', ride);
    }

    // 3. Dispatch to nearest approved online driver
    this.dispatchToDriver(ride);

    return ride;
  }

  /**
   * Find nearest online & approved driver and send 15s countdown request
   */
  dispatchToDriver(ride) {
    const drivers = dataStore.getDrivers();
    const candidateDrivers = drivers.filter(d =>
      d.status === 'approved' &&
      d.isOnline &&
      (!d.activeRideId || d.activeRideId === null) &&
      (d.serviceType === ride.serviceType || (!d.serviceType && ride.serviceType === 'bike'))
    );

    if (candidateDrivers.length === 0) {
      // If no strict matching vehicle, find ANY approved online driver for demonstration resilience
      const anyOnline = drivers.filter(d => d.status === 'approved' && d.isOnline && !d.activeRideId);
      if (anyOnline.length > 0) {
        candidateDrivers.push(anyOnline[0]);
      }
    }

    if (candidateDrivers.length === 0) {
      ride.status = 'NO_DRIVERS';
      dataStore.updateRide(ride.id, { status: 'NO_DRIVERS' });
      if (this.io) {
        this.io.emit(`ride_status_${ride.id}`, ride);
        this.io.emit('ride_updated', ride);
      }
      return;
    }

    // Sort by distance to pickup
    candidateDrivers.sort((a, b) => {
      const distA = this.getDistance(a.location.lat, a.location.lng, ride.pickup.lat, ride.pickup.lng);
      const distB = this.getDistance(b.location.lat, b.location.lng, ride.pickup.lat, ride.pickup.lng);
      return distA - distB;
    });

    const chosenDriver = candidateDrivers[0];
    const pickupDistKm = +(this.getDistance(chosenDriver.location.lat, chosenDriver.location.lng, ride.pickup.lat, ride.pickup.lng)).toFixed(1);
    const pickupEtaMin = Math.max(1, Math.round(pickupDistKm * 2.5));

    // Update ride status to REQUESTED
    dataStore.updateRide(ride.id, {
      status: 'REQUESTED',
      candidateDriverId: chosenDriver.id
    });

    const requestPayload = {
      rideId: ride.id,
      serviceType: ride.serviceType,
      customer: ride.customer,
      pickup: ride.pickup,
      dropoff: ride.dropoff,
      distanceKm: ride.distanceKm,
      durationMin: ride.durationMin,
      totalFare: ride.fare.totalFare,
      driverEarnings: ride.fare.driverEarnings,
      commissionCut: ride.fare.platformCommission,
      pickupDistanceKm: pickupDistKm,
      pickupEtaMin,
      expiresInSeconds: 15
    };

    // Emit 15-second overlay banner to the targeted driver & broadcast on driver channel
    if (this.io) {
      this.io.emit(`driver_request_${chosenDriver.id}`, requestPayload);
      this.io.emit('driver_ride_request_broadcast', { driverId: chosenDriver.id, ...requestPayload });
      this.io.emit('ride_updated', ride);
    }

    // Set 15-second expiration timer
    const timeout = setTimeout(() => {
      const currentRide = dataStore.getRideById(ride.id);
      if (currentRide && currentRide.status === 'REQUESTED') {
        console.log(`Ride ${ride.id} request expired for driver ${chosenDriver.id}. Auto-assigning fallback...`);
        // In interactive demo, auto-accept so testing flow continues effortlessly!
        this.acceptRide(ride.id, chosenDriver.id);
      }
    }, 15000);

    this.pendingTimeouts.set(ride.id, timeout);
  }

  /**
   * Driver accepts ride booking
   */
  async acceptRide(rideId, driverId) {
    if (this.pendingTimeouts.has(rideId)) {
      clearTimeout(this.pendingTimeouts.get(rideId));
      this.pendingTimeouts.delete(rideId);
    }

    const ride = dataStore.getRideById(rideId);
    const driver = dataStore.getDriverById(driverId);

    if (!ride || !driver) return null;

    ride.status = 'ASSIGNED';
    ride.driverId = driver.id;
    ride.driver = {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      avatar: driver.avatar,
      rating: driver.rating,
      vehicleNumber: driver.vehicleNumber,
      vehicleModel: driver.vehicleModel,
      serviceType: driver.serviceType
    };

    dataStore.updateRide(ride.id, ride);
    dataStore.updateDriver(driver.id, { activeRideId: ride.id });

    // Fetch pickup route from driver's current location to pickup point
    const driverToPickupRoute = await gisService.getRoute(
      driver.location.lat, driver.location.lng,
      ride.pickup.lat, ride.pickup.lng
    );

    const eventPayload = {
      ride,
      driverToPickupRoute: driverToPickupRoute.coordinates,
      driverLocation: driver.location
    };

    if (this.io) {
      this.io.emit(`ride_status_${ride.id}`, ride);
      this.io.emit(`driver_assigned_${ride.id}`, eventPayload);
      this.io.emit('ride_updated', ride);
      this.io.emit('admin_feed_update', { type: 'RIDE_ASSIGNED', ride });
    }

    // Simulate driver moving towards pickup
    this.startDriverSimulation(ride.id, driver.id, driverToPickupRoute.coordinates, 'ARRIVED');

    return ride;
  }

  /**
   * Driver declines ride
   */
  declineRide(rideId, driverId) {
    if (this.pendingTimeouts.has(rideId)) {
      clearTimeout(this.pendingTimeouts.get(rideId));
      this.pendingTimeouts.delete(rideId);
    }

    const ride = dataStore.getRideById(rideId);
    if (!ride) return;

    // Dispatch to another driver
    const otherDrivers = dataStore.getDrivers().filter(d => d.id !== driverId && d.isOnline && d.status === 'approved');
    if (otherDrivers.length > 0) {
      this.acceptRide(rideId, otherDrivers[0].id);
    } else {
      ride.status = 'NO_DRIVERS';
      dataStore.updateRide(ride.id, { status: 'NO_DRIVERS' });
      if (this.io) {
        this.io.emit(`ride_status_${ride.id}`, ride);
      }
    }
  }

  /**
   * Start ride once Captain inputs valid customer 4-digit OTP
   */
  startRide(rideId, inputOtp) {
    const ride = dataStore.getRideById(rideId);
    if (!ride) return { success: false, message: 'Ride not found' };

    if (ride.otp && inputOtp && ride.otp.trim() !== inputOtp.trim()) {
      return { success: false, message: 'Invalid OTP. Ask customer for 4-digit start PIN.' };
    }

    ride.status = 'IN_PROGRESS';
    ride.startedAt = new Date().toISOString();
    dataStore.updateRide(ride.id, ride);

    if (this.io) {
      this.io.emit(`ride_status_${ride.id}`, ride);
      this.io.emit('ride_updated', ride);
      this.io.emit('admin_feed_update', { type: 'RIDE_STARTED', ride });
    }

    // Animate driver moving along the drop-off route coordinates
    if (ride.routeCoordinates && ride.routeCoordinates.length > 0) {
      this.startDriverSimulation(ride.id, ride.driverId, ride.routeCoordinates, 'COMPLETED');
    }

    return { success: true, ride };
  }

  /**
   * Complete trip, settle ledger and deduct platform commission
   */
  completeRide(rideId) {
    const ride = dataStore.getRideById(rideId);
    if (!ride) return null;

    ride.status = 'COMPLETED';
    ride.completedAt = new Date().toISOString();
    ride.paymentStatus = 'paid';
    dataStore.updateRide(ride.id, ride);

    const driver = dataStore.getDriverById(ride.driverId);
    if (driver) {
      const grossFare = ride.fare.totalFare;
      const commission = ride.fare.platformCommission;
      const netEarnings = ride.fare.driverEarnings;

      // Update driver financial ledger
      const newWalletBalance = +(driver.walletBalance + netEarnings).toFixed(2);
      const newTodayEarnings = +(driver.todayEarnings + netEarnings).toFixed(2);
      const newTotalRides = (driver.totalRides || 0) + 1;

      dataStore.updateDriver(driver.id, {
        activeRideId: null,
        walletBalance: newWalletBalance,
        todayEarnings: newTodayEarnings,
        totalRides: newTotalRides,
        location: {
          lat: ride.dropoff.lat,
          lng: ride.dropoff.lng,
          heading: 0,
          speed: 0
        }
      });

      // Record transaction
      dataStore.recordTransaction(driver.id, {
        rideId: ride.id,
        service: ride.serviceType,
        grossFare,
        commission,
        netEarnings,
        paymentMethod: ride.paymentMethod,
        note: `Trip ${ride.id} completed. Platform cut ${ride.fare.commissionRate}% deducted.`
      });
    }

    if (this.io) {
      this.io.emit(`ride_status_${ride.id}`, ride);
      this.io.emit('ride_updated', ride);
      this.io.emit(`driver_wallet_${ride.driverId}`, dataStore.getDriverById(ride.driverId));
      this.io.emit('admin_feed_update', { type: 'RIDE_COMPLETED', ride });
    }

    return ride;
  }

  /**
   * Simulate smooth driver movement along coordinate path
   */
  startDriverSimulation(rideId, driverId, coordinates, targetStatusOnArrival) {
    if (!coordinates || coordinates.length === 0) return;

    if (this.activeSimulations.has(rideId)) {
      clearInterval(this.activeSimulations.get(rideId));
    }

    let currentIndex = 0;
    const stepDuration = Math.max(1200, Math.floor(20000 / coordinates.length)); // finish in ~15-20s for snappy demo

    const interval = setInterval(() => {
      if (currentIndex >= coordinates.length) {
        clearInterval(interval);
        this.activeSimulations.delete(rideId);

        const currentRide = dataStore.getRideById(rideId);
        if (currentRide) {
          if (targetStatusOnArrival === 'ARRIVED') {
            currentRide.status = 'ARRIVED';
            dataStore.updateRide(rideId, { status: 'ARRIVED' });
            if (this.io) {
              this.io.emit(`ride_status_${rideId}`, currentRide);
              this.io.emit('ride_updated', currentRide);
            }
          } else if (targetStatusOnArrival === 'COMPLETED') {
            this.completeRide(rideId);
          }
        }
        return;
      }

      const point = coordinates[currentIndex];
      const nextPoint = coordinates[currentIndex + 1] || point;
      const heading = Math.round(
        (Math.atan2(nextPoint[1] - point[1], nextPoint[0] - point[0]) * 180 / Math.PI + 360) % 360
      );

      const updatedLoc = {
        lat: point[0],
        lng: point[1],
        heading,
        speed: 28
      };

      dataStore.updateDriver(driverId, { location: updatedLoc });

      if (this.io) {
        // Broadcast location to customer app & admin dashboard
        this.io.emit(`driver_location_${driverId}`, updatedLoc);
        this.io.emit(`ride_track_${rideId}`, {
          location: updatedLoc,
          remainingCoordinates: coordinates.slice(currentIndex)
        });
      }

      currentIndex++;
    }, stepDuration);

    this.activeSimulations.set(rideId, interval);
  }

  /**
   * Trigger SOS Emergency Alert
   */
  triggerSos({ rideId, callerType, callerName, callerPhone, lat, lng }) {
    const alertId = `sos-${Date.now().toString(36)}`;
    const ride = rideId ? dataStore.getRideById(rideId) : null;

    const alert = {
      id: alertId,
      rideId: rideId || 'DIRECT_TRIGGER',
      callerType: callerType || 'customer',
      callerName: callerName || (ride ? ride.customer.name : 'Unknown User'),
      callerPhone: callerPhone || (ride ? ride.customer.phone : 'Not provided'),
      lat: lat || (ride ? ride.pickup.lat : 12.9716),
      lng: lng || (ride ? ride.pickup.lng : 77.5946),
      status: 'OPEN',
      driverInfo: ride && ride.driver ? `${ride.driver.name} (${ride.driver.vehicleNumber})` : 'Unassigned',
      timestamp: new Date().toISOString()
    };

    dataStore.addSosAlert(alert);

    if (this.io) {
      // High-priority audio-visual siren broadcast to Admin Dashboard
      this.io.emit('admin_sos_alert', alert);
      if (rideId) {
        this.io.emit(`ride_sos_${rideId}`, alert);
      }
    }

    return alert;
  }
}

const matchEngine = new MatchEngine();
module.exports = matchEngine;
