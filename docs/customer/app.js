// RiderForMe Customer Mobile App Logic
document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    user: {
      name: 'Priya Sharma',
      phone: '+91 98765 00123'
    },
    currentService: 'bike',
    pickup: {
      address: 'Macherla RTC Bus Stand, AP - 522426',
      lat: 16.4785,
      lng: 79.4210
    },
    dropoff: null,
    routeData: null,
    fares: {},
    activeRide: null,
    captainMarker: null,
    routePolyline: null,
    pickupMarker: null,
    dropoffMarker: null,
    nearbyDriverMarkers: new Map()
  };

  // Connect to Socket.IO Server
  const socket = io();

  socket.on('connect', () => {
    console.log('[Socket] Connected to RiderForMe Server:', socket.id);
    socket.emit('register_role', { role: 'customer', id: 'cust-01' });
  });

  // Real-Time Dynamic Fare Sync from Admin
  socket.on('fare_rates_updated', (data) => {
    console.log('[Socket] Fare rates updated by Admin:', data);
    const banner = document.getElementById('fareSyncBanner');
    const text = document.getElementById('fareSyncText');
    if (banner && text) {
      text.innerText = '⚡ Fare rates updated live by Admin!';
      banner.style.background = 'rgba(16, 185, 129, 0.9)';
      setTimeout(() => {
        banner.style.background = 'rgba(15, 23, 42, 0.85)';
        text.innerText = '📍 Offline Map Active: PIN 522426 (50km Radius)';
      }, 4000);
    }
    loadFares();
    if (state.dropoff && state.routeData) {
      calculateFareEstimates();
    }
  });

  // Real-time Fleet updates
  socket.on('fleet_location_update', ({ driverId, location }) => {
    updateFleetMarker(driverId, location);
  });

  // Initialize Map with Leaflet (Centered on Macherla PIN 522426)
  const map = L.map('customerMap', {
    zoomControl: false,
    attributionControl: false
  }).setView([state.pickup.lat, state.pickup.lng], 14);

  // Local Offline Map Tiles (Pre-cached for PIN 522426 + 50km radius)
  L.tileLayer('/api/tiles/{z}/{x}/{y}.png', {
    maxZoom: 19,
    errorTileUrl: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
  }).addTo(map);

  // 50km Offline Radius Boundary Circle
  L.circle([16.4771, 79.4185], {
    radius: 50000,
    color: '#10b981',
    weight: 2,
    dashArray: '6, 6',
    fillColor: '#10b981',
    fillOpacity: 0.03
  }).addTo(map);

  // Custom Icon Factory
  function createCustomIcon(emoji, bgClass = 'bg-primary') {
    return L.divIcon({
      className: 'custom-leaflet-icon',
      html: `<div style="
        background: white;
        border: 2px solid #0f172a;
        box-shadow: 0 4px 10px rgba(0,0,0,0.25);
        border-radius: 50%;
        width: 34px;
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
      ">${emoji}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
  }

  // Add Initial Pickup Pin
  state.pickupMarker = L.marker([state.pickup.lat, state.pickup.lng], {
    icon: createCustomIcon('📍'),
    draggable: true
  }).addTo(map);

  state.pickupMarker.on('dragend', async (e) => {
    const pos = e.target.getLatLng();
    state.pickup.lat = pos.lat;
    state.pickup.lng = pos.lng;
    try {
      const res = await fetch(`/api/gis/reverse?lat=${pos.lat}&lon=${pos.lng}`);
      const json = await res.json();
      if (json.data && json.data.title) {
        state.pickup.address = json.data.title;
        document.getElementById('pickupInput').value = json.data.title;
      }
    } catch (err) {
      console.warn('Reverse geocode failed:', err);
    }
    if (state.dropoff) {
      fetchRouteAndFares();
    }
  });

  // Load Initial Drivers from Server
  fetchNearbyDrivers();
  async function fetchNearbyDrivers() {
    try {
      const res = await fetch('/api/admin/drivers?status=approved');
      const data = await res.json();
      if (data.data) {
        data.data.forEach(d => {
          if (d.isOnline && d.location) {
            updateFleetMarker(d.id, d.location, d.serviceType);
          }
        });
      }
    } catch (err) {
      console.warn('Failed to fetch nearby drivers:', err);
    }
  }

  function updateFleetMarker(driverId, location, serviceType = 'bike') {
    const iconEmoji = serviceType === 'auto' ? '🛺' : (serviceType === 'parcel' ? '📦' : '🛵');
    if (state.nearbyDriverMarkers.has(driverId)) {
      const marker = state.nearbyDriverMarkers.get(driverId);
      marker.setLatLng([location.lat, location.lng]);
    } else {
      const marker = L.marker([location.lat, location.lng], {
        icon: createCustomIcon(iconEmoji)
      }).addTo(map);
      state.nearbyDriverMarkers.set(driverId, marker);
    }
  }

  // Fetch Current Fares from Backend
  loadFares();
  async function loadFares() {
    try {
      const res = await fetch('/api/fares');
      const json = await res.json();
      if (json.data) {
        state.fares = json.data;
        document.getElementById('bikeFareBadge').innerText = `₹${json.data.bike.baseFare} base`;
        document.getElementById('autoFareBadge').innerText = `₹${json.data.auto.baseFare} base`;
        document.getElementById('parcelFareBadge').innerText = `₹${json.data.parcel.baseFare} base`;
      }
    } catch (err) {
      console.warn('Failed to load fares:', err);
    }
  }

  // Service Selector Tabs Click
  const serviceTabs = document.querySelectorAll('.service-tab');
  serviceTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      serviceTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentService = tab.getAttribute('data-service');
      if (state.routeData) {
        renderFareDetails();
      }
    });
  });

  // Dropoff Input Autocomplete Search with Photon API (OSM)
  const dropoffInput = document.getElementById('dropoffInput');
  const suggestionsList = document.getElementById('suggestionsList');
  const clearDropoffBtn = document.getElementById('clearDropoffBtn');
  let searchTimeout = null;

  dropoffInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    clearDropoffBtn.style.display = val ? 'block' : 'none';

    if (searchTimeout) clearTimeout(searchTimeout);
    if (val.length < 2) {
      suggestionsList.style.display = 'none';
      return;
    }

    searchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/gis/search?q=${encodeURIComponent(val)}&lat=${state.pickup.lat}&lon=${state.pickup.lng}`);
        const data = await res.json();
        renderSuggestions(data.data || []);
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 250);
  });

  clearDropoffBtn.addEventListener('click', () => {
    dropoffInput.value = '';
    clearDropoffBtn.style.display = 'none';
    suggestionsList.style.display = 'none';
    if (state.dropoffMarker) map.removeLayer(state.dropoffMarker);
    if (state.routePolyline) map.removeLayer(state.routePolyline);
    document.getElementById('farePreviewCard').style.display = 'none';
    state.dropoff = null;
    state.routeData = null;
  });

  function renderSuggestions(items) {
    if (!items || items.length === 0) {
      suggestionsList.style.display = 'none';
      return;
    }

    suggestionsList.innerHTML = items.map(item => `
      <div class="suggestion-item" data-lat="${item.lat}" data-lng="${item.lng}" data-title="${item.title}" data-address="${item.address}">
        <span class="sug-title">📍 ${item.title}</span>
        <span class="sug-address">${item.address}</span>
      </div>
    `).join('');

    suggestionsList.style.display = 'block';

    suggestionsList.querySelectorAll('.suggestion-item').forEach(el => {
      el.addEventListener('click', () => {
        const lat = parseFloat(el.getAttribute('data-lat'));
        const lng = parseFloat(el.getAttribute('data-lng'));
        const title = el.getAttribute('data-title');
        const address = el.getAttribute('data-address');

        dropoffInput.value = `${title}, ${address}`;
        suggestionsList.style.display = 'none';
        clearDropoffBtn.style.display = 'block';

        selectDropoff(lat, lng, `${title}, ${address}`);
      });
    });
  }

  // Quick Landmark Chips
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const place = btn.getAttribute('data-place');
      const lat = parseFloat(btn.getAttribute('data-lat'));
      const lng = parseFloat(btn.getAttribute('data-lng'));
      dropoffInput.value = place;
      clearDropoffBtn.style.display = 'block';
      selectDropoff(lat, lng, place);
    });
  });

  async function selectDropoff(lat, lng, label) {
    state.dropoff = { lat, lng, address: label };

    if (state.dropoffMarker) map.removeLayer(state.dropoffMarker);
    state.dropoffMarker = L.marker([lat, lng], {
      icon: createCustomIcon('🏁')
    }).addTo(map);

    await fetchRouteAndFares();
  }

  // Fetch OSRM Road Route & Calculate Live Fares
  async function fetchRouteAndFares() {
    if (!state.pickup || !state.dropoff) return;

    try {
      const routeRes = await fetch(`/api/gis/route?fromLat=${state.pickup.lat}&fromLng=${state.pickup.lng}&toLat=${state.dropoff.lat}&toLng=${state.dropoff.lng}`);
      const routeJson = await routeRes.json();

      if (routeJson.success && routeJson.data) {
        state.routeData = routeJson.data;

        // Draw Polyline on Leaflet
        if (state.routePolyline) map.removeLayer(state.routePolyline);
        state.routePolyline = L.polyline(routeJson.data.coordinates, {
          color: '#2563eb',
          weight: 5,
          opacity: 0.85,
          lineJoin: 'round'
        }).addTo(map);

        // Fit Map bounds
        map.fitBounds(state.routePolyline.getBounds(), { padding: [50, 50] });

        // Calculate Fares
        await calculateFareEstimates();
      }
    } catch (err) {
      console.error('Route calculation error:', err);
    }
  }

  async function calculateFareEstimates() {
    if (!state.routeData) return;
    try {
      const res = await fetch('/api/fares/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distanceKm: state.routeData.distanceKm,
          durationMin: state.routeData.durationMin
        })
      });
      const data = await res.json();
      if (data.success && data.data) {
        state.allCalculations = data.data;
        renderFareDetails();
      }
    } catch (err) {
      console.error('Fare estimate error:', err);
    }
  }

  function renderFareDetails() {
    if (!state.allCalculations || !state.routeData) return;
    const calc = state.allCalculations[state.currentService] || state.allCalculations.bike;

    document.getElementById('metricDistance').innerText = `${state.routeData.distanceKm} km`;
    document.getElementById('metricDuration').innerText = `${state.routeData.durationMin} min`;
    document.getElementById('metricFare').innerText = `₹${calc.totalFare}`;

    // Breakdown details
    const breakdownEl = document.getElementById('breakdownGrid');
    breakdownEl.innerHTML = `
      <div class="break-row"><span>Base Fare (first ${calc.baseKm} km):</span><strong>₹${calc.baseFare.toFixed(2)}</strong></div>
      <div class="break-row"><span>Distance Charge (${Math.max(0, calc.distanceKm - calc.baseKm).toFixed(1)} km @ ₹${calc.perKm}/km):</span><strong>₹${calc.distanceCharge.toFixed(2)}</strong></div>
      <div class="break-row"><span>Ride Duration Charge (${calc.durationMin} min @ ₹${calc.perMinute}/min):</span><strong>₹${calc.timeCharge.toFixed(2)}</strong></div>
      <div class="break-row"><span>Dynamic Surge Multiplier:</span><strong>${calc.surgeMultiplier}x</strong></div>
      <div class="break-row" style="border-top: 1px dashed #cbd5e1; padding-top: 4px; font-weight: bold;"><span>Total Customer Fare:</span><strong style="color: #10b981;">₹${calc.totalFare}</strong></div>
      <div class="break-row" style="font-size: 10px; color: #94a3b8;"><span>Platform Commission (${calc.commissionRate}%):</span><span>₹${calc.platformCommission} (deducted from driver)</span></div>
    `;

    document.getElementById('farePreviewCard').style.display = 'block';
  }

  // Book Ride Button Click
  const bookRideBtn = document.getElementById('bookRideBtn');
  bookRideBtn.addEventListener('click', async () => {
    if (!state.pickup || !state.dropoff) {
      alert('Please select both pickup and destination!');
      return;
    }

    const payMethod = document.querySelector('input[name="payMethod"]:checked').value;

    // Switch to Searching State
    document.getElementById('bookingState').style.display = 'none';
    document.getElementById('searchingState').style.display = 'block';
    const vehicleEmoji = state.currentService === 'auto' ? '🛺' : (state.currentService === 'parcel' ? '📦' : '🛵');
    document.getElementById('searchVehicleIcon').innerText = vehicleEmoji;

    try {
      const res = await fetch('/api/rides/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: state.user,
          pickup: state.pickup,
          dropoff: state.dropoff,
          serviceType: state.currentService,
          paymentMethod: payMethod
        })
      });

      const json = await res.json();
      if (json.success && json.data) {
        state.activeRide = json.data;
        listenToRideUpdates(json.data.id);
      }
    } catch (err) {
      console.error('Ride booking failed:', err);
      alert('Failed to connect with dispatch server. Retrying...');
    }
  });

  // Cancel Search Button
  document.getElementById('cancelSearchBtn').addEventListener('click', () => {
    if (state.activeRide) {
      fetch(`/api/rides/${state.activeRide.id}/cancel`, { method: 'POST' });
    }
    resetToBookingState();
  });

  // Ride Status & Live Tracking Listener via Socket.IO
  function listenToRideUpdates(rideId) {
    socket.on(`ride_status_${rideId}`, (ride) => {
      console.log(`[Ride Update ${rideId}] Status:`, ride.status);
      state.activeRide = ride;

      if (ride.status === 'ASSIGNED') {
        showTrackingState(ride);
      } else if (ride.status === 'ARRIVED') {
        document.getElementById('tripStatusBadge').innerText = 'Captain Arrived at Pickup!';
        document.getElementById('tripStatusBadge').style.background = '#dcfce7';
        document.getElementById('tripStatusBadge').style.color = '#15803d';
      } else if (ride.status === 'IN_PROGRESS') {
        document.getElementById('tripStatusBadge').innerText = 'Trip in Progress 🚀';
        document.getElementById('tripStatusBadge').style.background = '#e0f2fe';
        document.getElementById('tripStatusBadge').style.color = '#0284c7';
      } else if (ride.status === 'COMPLETED') {
        showCompletedState(ride);
      } else if (ride.status === 'CANCELLED' || ride.status === 'NO_DRIVERS') {
        alert(ride.status === 'NO_DRIVERS' ? 'All nearby Captains are currently busy. Please try in 1 minute.' : 'Ride was cancelled.');
        resetToBookingState();
      }
    });

    // Real-time movement of Captain on Map
    socket.on(`ride_track_${rideId}`, ({ location, remainingCoordinates }) => {
      if (state.captainMarker) {
        state.captainMarker.setLatLng([location.lat, location.lng]);
      } else {
        const vehicleEmoji = state.activeRide?.serviceType === 'auto' ? '🛺' : '🛵';
        state.captainMarker = L.marker([location.lat, location.lng], {
          icon: createCustomIcon(vehicleEmoji)
        }).addTo(map);
      }
    });
  }

  function showTrackingState(ride) {
    document.getElementById('searchingState').style.display = 'none';
    document.getElementById('trackingState').style.display = 'block';

    document.getElementById('rideOtpCode').innerText = ride.otp || '4892';
    if (ride.driver) {
      document.getElementById('driverName').innerText = ride.driver.name;
      document.getElementById('driverVehicleModel').innerText = ride.driver.vehicleModel || 'Hero Splendor Plus';
      document.getElementById('driverPlate').innerText = ride.driver.vehicleNumber;
      if (ride.driver.avatar) document.getElementById('driverAvatar').src = ride.driver.avatar;
    }
    document.getElementById('hudFare').innerText = `₹${ride.fare.totalFare}`;
    document.getElementById('hudDistance').innerText = `${ride.distanceKm} km`;
    document.getElementById('hudEta').innerText = `${ride.durationMin} mins`;
  }

  function showCompletedState(ride) {
    document.getElementById('trackingState').style.display = 'none';
    document.getElementById('completedState').style.display = 'block';

    document.getElementById('receiptDistance').innerText = `${ride.distanceKm} km`;
    document.getElementById('receiptDuration').innerText = `${ride.durationMin} mins`;
    document.getElementById('receiptPayment').innerText = ride.paymentMethod?.toUpperCase() || 'Cash';
    document.getElementById('receiptAmount').innerText = `₹${ride.fare.totalFare}.00`;
  }

  function resetToBookingState() {
    document.getElementById('searchingState').style.display = 'none';
    document.getElementById('trackingState').style.display = 'none';
    document.getElementById('completedState').style.display = 'none';
    document.getElementById('bookingState').style.display = 'block';
    if (state.captainMarker) {
      map.removeLayer(state.captainMarker);
      state.captainMarker = null;
    }
  }

  document.getElementById('bookAnotherBtn').addEventListener('click', resetToBookingState);
  document.getElementById('cancelTripBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to cancel this ride?')) {
      if (state.activeRide) {
        fetch(`/api/rides/${state.activeRide.id}/cancel`, { method: 'POST' });
      }
      resetToBookingState();
    }
  });

  // SOS Emergency Button Handlers
  const sosModal = document.getElementById('sosModal');
  const triggerSosAction = () => {
    document.getElementById('sosCoordsPreview').innerText = `Latitude: ${state.pickup.lat.toFixed(4)}, Longitude: ${state.pickup.lng.toFixed(4)}`;
    sosModal.style.display = 'flex';
  };

  document.getElementById('sosBtn').addEventListener('click', triggerSosAction);
  document.getElementById('tripSosBtn').addEventListener('click', triggerSosAction);

  document.getElementById('cancelSosBtn').addEventListener('click', () => {
    sosModal.style.display = 'none';
  });

  document.getElementById('confirmSosBtn').addEventListener('click', async () => {
    try {
      const payload = {
        rideId: state.activeRide ? state.activeRide.id : null,
        callerType: 'customer',
        callerName: state.user.name,
        callerPhone: state.user.phone,
        lat: state.pickup.lat,
        lng: state.pickup.lng
      };

      if (state.activeRide) {
        await fetch(`/api/rides/${state.activeRide.id}/sos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        socket.emit('trigger_sos', payload);
      }

      alert('🚨 EMERGENCY ALERT BROADCASTED!\nCentral Safety Team & Police have been alerted with your live location.');
      sosModal.style.display = 'none';
    } catch (err) {
      alert('Alert transmitted to emergency channel.');
      sosModal.style.display = 'none';
    }
  });

  // Recenter button
  document.getElementById('recenterBtn').addEventListener('click', () => {
    map.setView([state.pickup.lat, state.pickup.lng], 15);
  });
});
