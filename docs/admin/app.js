// RiderForMe Central Admin Dashboard Logic
document.addEventListener('DOMContentLoaded', () => {
  const state = {
    fares: {},
    drivers: [],
    rides: [],
    sosAlerts: [],
    activeFilter: 'all',
    activeKycFilter: 'all',
    selectedDriverForKyc: null,
    driverMarkers: new Map(),
    tripPolylines: new Map(),
    map: null
  };

  // Connect to Socket.IO Server
  const socket = io();

  socket.on('connect', () => {
    console.log('[Admin Socket] Connected:', socket.id);
    socket.emit('register_role', { role: 'admin' });
  });

  // Siren Audio Synthesizer via Web Audio API
  function playSosSiren() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1000, ctx.currentTime + 0.3);
      osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.6);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch (e) {
      console.warn('Audio note:', e);
    }
  }

  // Socket: Real-time SOS Emergency Alert
  socket.on('admin_sos_alert', (alert) => {
    console.warn('🚨 HIGH PRIORITY SOS ALERT RECEIVED:', alert);
    playSosSiren();
    state.sosAlerts.unshift(alert);
    updateMetrics();
    renderSosSection();
    showSosNotification(alert);
  });

  socket.on('admin_sos_resolved', (alert) => {
    const idx = state.sosAlerts.findIndex(a => a.id === alert.id);
    if (idx !== -1) state.sosAlerts[idx] = alert;
    updateMetrics();
    renderSosSection();
  });

  // Socket: Real-time driver location stream
  socket.on('fleet_location_update', ({ driverId, location }) => {
    updateDriverOnMap(driverId, location);
  });

  // Socket: Driver status changes
  socket.on('driver_status_change', ({ driverId, isOnline }) => {
    loadDrivers();
    updateMetrics();
  });

  // Socket: Live ride updates
  socket.on('ride_created', (ride) => {
    state.rides.unshift(ride);
    renderRidesTable();
    updateMetrics();
    drawTripRouteOnMap(ride);
  });

  socket.on('ride_updated', (ride) => {
    const idx = state.rides.findIndex(r => r.id === ride.id);
    if (idx !== -1) state.rides[idx] = ride;
    renderRidesTable();
    updateMetrics();
    if (ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
      removeTripRouteFromMap(ride.id);
    } else {
      drawTripRouteOnMap(ride);
    }
  });

  // Initialize Admin Live Map (Centered on Macherla PIN 522426)
  state.map = L.map('adminLiveMap', {
    zoomControl: true,
    attributionControl: false
  }).setView([16.4785, 79.4210], 12);

  // Local Offline Map Tiles (522426 Macherla & 50km radius)
  L.tileLayer('/api/tiles/{z}/{x}/{y}.png', {
    maxZoom: 19,
    errorTileUrl: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
  }).addTo(state.map);

  // 50km Offline Operational Coverage Circle
  const offlineCircle = L.circle([16.4771, 79.4185], {
    radius: 50000,
    color: '#3b82f6',
    weight: 2,
    dashArray: '8, 8',
    fillColor: '#3b82f6',
    fillOpacity: 0.04
  }).addTo(state.map);
  offlineCircle.bindTooltip('50km Offline Operational Zone: PIN 522426 (Macherla)', { permanent: false, direction: 'top' });

  function createMarkerIcon(emoji, isOnline = true, activeRide = false) {
    const borderColor = activeRide ? '#f59e0b' : (isOnline ? '#10b981' : '#64748b');
    return L.divIcon({
      className: 'admin-marker-pin',
      html: `<div style="
        background: #ffffff;
        border: 3px solid ${borderColor};
        box-shadow: 0 4px 14px rgba(0,0,0,0.3);
        border-radius: 50%;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        position: relative;
      ">
        ${emoji}
        <span style="
          position: absolute;
          bottom: -2px;
          right: -2px;
          width: 10px;
          height: 10px;
          background: ${borderColor};
          border: 2px solid white;
          border-radius: 50%;
        "></span>
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
  }

  // Load Drivers on Map
  loadDrivers();
  async function loadDrivers() {
    try {
      const res = await fetch('/api/admin/drivers');
      const json = await res.json();
      if (json.success && json.data) {
        state.drivers = json.data;
        renderDriversTable();
        renderDriversOnMap();
        updateMetrics();
      }
    } catch (err) {
      console.error('Failed to load drivers:', err);
    }
  }

  function renderDriversOnMap() {
    state.drivers.forEach(d => {
      if (d.location) {
        const emoji = d.serviceType === 'auto' ? '🛺' : (d.serviceType === 'parcel' ? '📦' : '🛵');
        if (state.driverMarkers.has(d.id)) {
          const marker = state.driverMarkers.get(d.id);
          marker.setLatLng([d.location.lat, d.location.lng]);
          marker.setIcon(createMarkerIcon(emoji, d.isOnline, !!d.activeRideId));
        } else {
          const marker = L.marker([d.location.lat, d.location.lng], {
            icon: createMarkerIcon(emoji, d.isOnline, !!d.activeRideId)
          }).addTo(state.map);

          marker.bindPopup(`
            <div style="font-family: sans-serif; min-width: 180px;">
              <h4 style="margin: 0 0 4px; font-size: 14px; font-weight: 800;">${d.name}</h4>
              <p style="margin: 0 0 4px; font-size: 11px; color: #475569;">${d.phone}</p>
              <div style="font-size: 11px; margin-bottom: 6px;">
                <strong>Vehicle:</strong> ${d.vehicleNumber} (${d.serviceType?.toUpperCase()})
              </div>
              <div style="font-size: 11px; display: flex; justify-content: space-between;">
                <span>Rating: ★${d.rating}</span>
                <span style="color: ${d.isOnline ? '#10b981' : '#94a3b8'}; font-weight: bold;">
                  ${d.isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
            </div>
          `);

          state.driverMarkers.set(d.id, marker);
        }
      }
    });
  }

  function updateDriverOnMap(driverId, location) {
    if (state.driverMarkers.has(driverId)) {
      const marker = state.driverMarkers.get(driverId);
      marker.setLatLng([location.lat, location.lng]);
    }
  }

  function drawTripRouteOnMap(ride) {
    if (!ride.routeCoordinates || ride.routeCoordinates.length === 0) return;
    if (state.tripPolylines.has(ride.id)) {
      state.tripPolylines.get(ride.id).setLatLngs(ride.routeCoordinates);
    } else {
      const polyline = L.polyline(ride.routeCoordinates, {
        color: '#3b82f6',
        weight: 4,
        dashArray: '8, 8',
        opacity: 0.8
      }).addTo(state.map);
      state.tripPolylines.set(ride.id, polyline);
    }
  }

  function removeTripRouteFromMap(rideId) {
    if (state.tripPolylines.has(rideId)) {
      state.map.removeLayer(state.tripPolylines.get(rideId));
      state.tripPolylines.delete(rideId);
    }
  }

  // Map Filter Buttons (All, Bikes, Autos, Parcels)
  document.querySelectorAll('.map-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.map-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter');

      state.drivers.forEach(d => {
        const marker = state.driverMarkers.get(d.id);
        if (marker) {
          if (filter === 'all' || d.serviceType === filter) {
            state.map.addLayer(marker);
          } else {
            state.map.removeLayer(marker);
          }
        }
      });
    });
  });

  // Load and Render Fare Configurations
  loadFares();
  async function loadFares() {
    try {
      const res = await fetch('/api/fares');
      const json = await res.json();
      if (json.success && json.data) {
        state.fares = json.data;
        populateFareForms(json.data);
        runFareSimulator();
      }
    } catch (err) {
      console.error('Failed to load fares:', err);
    }
  }

  function populateFareForms(fares) {
    ['bike', 'auto', 'parcel'].forEach(srv => {
      const cfg = fares[srv];
      if (!cfg) return;
      ['baseFare', 'baseKm', 'perKm', 'perMinute', 'commissionRate', 'surgeMultiplier'].forEach(field => {
        const input = document.getElementById(`${srv}_${field}`);
        if (input) input.value = cfg[field];
      });
    });
  }

  // Interactive Live Simulator Sandbox
  const simDistSlider = document.getElementById('simDistanceSlider');
  const simDurSlider = document.getElementById('simDurationSlider');
  const simDistLabel = document.getElementById('simDistanceLabel');
  const simDurLabel = document.getElementById('simDurationLabel');

  simDistSlider.addEventListener('input', (e) => {
    simDistLabel.innerText = `${parseFloat(e.target.value).toFixed(1)} km`;
    runFareSimulator();
  });

  simDurSlider.addEventListener('input', (e) => {
    simDurLabel.innerText = `${parseInt(e.target.value)} mins`;
    runFareSimulator();
  });

  // Also rerun simulator on any fare form input change
  document.querySelectorAll('.inputs-grid input').forEach(input => {
    input.addEventListener('input', runFareSimulator);
  });

  function getFormFareConfig(srv) {
    return {
      baseFare: parseFloat(document.getElementById(`${srv}_baseFare`)?.value) || 25,
      baseKm: parseFloat(document.getElementById(`${srv}_baseKm`)?.value) || 2.0,
      perKm: parseFloat(document.getElementById(`${srv}_perKm`)?.value) || 8.0,
      perMinute: parseFloat(document.getElementById(`${srv}_perMinute`)?.value) || 0.50,
      commissionRate: parseFloat(document.getElementById(`${srv}_commissionRate`)?.value) || 10,
      surgeMultiplier: parseFloat(document.getElementById(`${srv}_surgeMultiplier`)?.value) || 1.0
    };
  }

  function runFareSimulator() {
    const dist = parseFloat(simDistSlider.value);
    const dur = parseFloat(simDurSlider.value);

    ['bike', 'auto', 'parcel'].forEach(srv => {
      const cfg = getFormFareConfig(srv);
      const extraKm = Math.max(0, dist - cfg.baseKm);
      const distCost = extraKm * cfg.perKm;
      const timeCost = dur * cfg.perMinute;
      const subtotal = cfg.baseFare + distCost + timeCost;
      const totalFare = Math.max(cfg.baseFare, Math.round(subtotal * cfg.surgeMultiplier));
      const platformCut = +(totalFare * (cfg.commissionRate / 100)).toFixed(2);
      const driverNet = +(totalFare - platformCut).toFixed(2);

      const capSrv = srv.charAt(0).toUpperCase() + srv.slice(1);
      document.getElementById(`sim${capSrv}Fare`).innerText = `₹${totalFare}.00`;
      document.getElementById(`sim${capSrv}Driver`).innerText = `₹${driverNet}`;
      document.getElementById(`sim${capSrv}Cut`).innerText = `₹${platformCut} (${cfg.commissionRate}%)`;
    });
  }

  // Save & Publish Fares Button Click
  document.getElementById('saveAllFaresBtn').addEventListener('click', async () => {
    const newFares = {
      bike: {
        ...state.fares.bike,
        ...getFormFareConfig('bike')
      },
      auto: {
        ...state.fares.auto,
        ...getFormFareConfig('auto')
      },
      parcel: {
        ...state.fares.parcel,
        ...getFormFareConfig('parcel')
      }
    };

    try {
      const res = await fetch('/api/fares/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fares: newFares })
      });
      const json = await res.json();
      if (json.success) {
        state.fares = json.data;
        alert('⚡ DYNAMIC FARES PUBLISHED SUCCESSFULLY!\nUpdated rates are now synchronized with all Customer and Captain apps in real-time.');
      }
    } catch (err) {
      console.error('Publish fares error:', err);
      alert('Failed to publish fare updates');
    }
  });

  // Render Driver Verification Table
  function renderDriversTable() {
    const tbody = document.getElementById('driversTableBody');
    let list = state.drivers;

    if (state.activeKycFilter !== 'all') {
      if (state.activeKycFilter === 'rejected') {
        list = list.filter(d => d.status === 'rejected' || d.status === 'suspended');
      } else {
        list = list.filter(d => d.status === state.activeKycFilter);
      }
    }

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 24px;">No drivers found for this filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(d => {
      const statusClass = d.status === 'approved' ? 'approved' : (d.status === 'pending' ? 'pending' : 'rejected');
      return `
        <tr>
          <td>
            <div class="driver-cell">
              <img src="${d.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" alt="${d.name}">
              <div>
                <strong>${d.name}</strong>
                <div style="font-size: 11px; color: #94a3b8;">${d.phone}</div>
              </div>
            </div>
          </td>
          <td>
            <div>${d.vehicleNumber}</div>
            <div style="font-size: 11px; color: #94a3b8;">${d.serviceType?.toUpperCase()} • ${d.vehicleModel || ''}</div>
          </td>
          <td>
            <span style="font-size: 11px; color: #10b981;">✓ Aadhaar, DL, RC Uploaded</span>
          </td>
          <td>
            <span class="status-badge ${statusClass}">${d.status}</span>
          </td>
          <td>
            <div><strong>₹${(d.walletBalance || 0).toFixed(2)}</strong></div>
            <div style="font-size: 11px; color: #94a3b8;">${d.totalRides || 0} rides</div>
          </td>
          <td>
            <button class="inspect-btn" data-id="${d.id}">Inspect Documents &amp; Verify</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.inspect-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const driver = state.drivers.find(d => d.id === id);
        if (driver) openKycModal(driver);
      });
    });
  }

  // KYC Filter Tabs
  document.querySelectorAll('.kyc-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.kyc-filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeKycFilter = tab.getAttribute('data-filter');
      renderDriversTable();
    });
  });

  // KYC Inspection Modal
  const kycModal = document.getElementById('kycModal');
  function openKycModal(driver) {
    state.selectedDriverForKyc = driver;

    document.getElementById('modalDriverName').innerText = `Inspect KYC: ${driver.name}`;
    document.getElementById('modalDriverPlate').innerText = `${driver.vehicleNumber} • ${driver.serviceType?.toUpperCase()}`;
    document.getElementById('modalSummaryName').innerText = driver.name;
    document.getElementById('modalSummaryPhone').innerText = driver.phone;
    document.getElementById('modalSummaryVehicle').innerText = `${driver.vehicleModel || 'Two-Wheeler'} (${driver.vehicleNumber})`;

    const statusBadge = document.getElementById('modalSummaryStatus');
    statusBadge.innerText = driver.status.toUpperCase();
    statusBadge.className = `status-badge ${driver.status}`;

    // Document image sources
    const docs = driver.documents || {};
    document.getElementById('modalAadhaarImg').src = docs.aadhaar || '/uploads/sample_aadhaar.png';
    document.getElementById('modalDlImg').src = docs.drivingLicense || '/uploads/sample_dl.png';
    document.getElementById('modalRcImg').src = docs.vehicleRc || '/uploads/sample_rc.png';

    document.getElementById('modalRemarksInput').value = driver.verificationRemarks || '';

    kycModal.style.display = 'flex';
  }

  document.getElementById('closeKycModalBtn').addEventListener('click', () => {
    kycModal.style.display = 'none';
  });

  // Approve / Reject / Suspend Actions
  async function submitDriverVerification(status) {
    if (!state.selectedDriverForKyc) return;
    const remarks = document.getElementById('modalRemarksInput').value.trim();

    try {
      const res = await fetch(`/api/admin/driver/${state.selectedDriverForKyc.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, remarks })
      });
      const json = await res.json();
      if (json.success) {
        alert(`Captain ${state.selectedDriverForKyc.name} status updated to: ${status.toUpperCase()}`);
        kycModal.style.display = 'none';
        loadDrivers();
      }
    } catch (err) {
      console.error('Driver verification error:', err);
    }
  }

  document.getElementById('approveDriverBtn').addEventListener('click', () => submitDriverVerification('approved'));
  document.getElementById('rejectDriverBtn').addEventListener('click', () => submitDriverVerification('rejected'));
  document.getElementById('suspendDriverBtn').addEventListener('click', () => submitDriverVerification('suspended'));

  // Load Rides
  loadRides();
  async function loadRides() {
    try {
      const res = await fetch('/api/admin/rides');
      const json = await res.json();
      if (json.success && json.data) {
        state.rides = json.data;
        renderRidesTable();
        updateMetrics();
      }
    } catch (err) {
      console.warn('Failed to load rides:', err);
    }
  }

  function renderRidesTable() {
    const tbody = document.getElementById('ridesTableBody');
    if (!tbody) return;

    if (state.rides.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 24px;">No ride bookings recorded yet. Create a ride in the Customer App to see live telemetry!</td></tr>`;
      return;
    }

    tbody.innerHTML = state.rides.map(r => `
      <tr>
        <td><strong style="font-family: monospace;">${r.id}</strong></td>
        <td>
          <strong>${r.customer?.name || 'Customer'}</strong>
          <div style="font-size: 11px; color: #94a3b8;">${r.customer?.phone || ''}</div>
        </td>
        <td>
          ${r.driver ? `<strong>${r.driver.name}</strong><div style="font-size: 11px; color: #94a3b8;">${r.driver.vehicleNumber}</div>` : '<span style="color: #f59e0b;">Searching...</span>'}
        </td>
        <td>
          <span style="font-size: 11px; font-weight: bold; text-transform: uppercase;">${r.serviceType}</span>
        </td>
        <td>
          <div>${r.distanceKm} km (${r.durationMin} min)</div>
          <div style="font-size: 11px; color: #94a3b8;">${r.pickup?.address?.split(',')[0]} → ${r.dropoff?.address?.split(',')[0]}</div>
        </td>
        <td>
          <strong style="color: #10b981;">₹${r.fare?.totalFare || 0}</strong>
          <div style="font-size: 11px; color: #94a3b8;">${r.paymentMethod?.toUpperCase()}</div>
        </td>
        <td>
          <span class="status-badge ${r.status === 'COMPLETED' ? 'approved' : (r.status === 'IN_PROGRESS' ? 'approved' : 'pending')}">${r.status}</span>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('refreshRidesBtn').addEventListener('click', loadRides);

  // Load SOS Alerts
  loadSosAlerts();
  async function loadSosAlerts() {
    try {
      const res = await fetch('/api/admin/sos');
      const json = await res.json();
      if (json.success && json.data) {
        state.sosAlerts = json.data;
        renderSosSection();
        updateMetrics();
      }
    } catch (err) {
      console.warn('Failed to load SOS alerts:', err);
    }
  }

  function renderSosSection() {
    const list = document.getElementById('sosIncidentList');
    if (!list) return;

    if (state.sosAlerts.length === 0) {
      list.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 30px;">All calm. No emergency panic alerts triggered.</div>`;
      return;
    }

    list.innerHTML = state.sosAlerts.map(a => `
      <div class="sos-alert-card ${a.status === 'RESOLVED' ? 'resolved' : ''}">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <strong style="color: #ef4444; font-size: 15px;">🚨 EMERGENCY ALERT: ${a.callerName}</strong>
            <span class="status-badge ${a.status === 'RESOLVED' ? 'approved' : 'rejected'}">${a.status}</span>
          </div>
          <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">
            Phone: <strong>${a.callerPhone}</strong> • Triggered by: <strong>${a.callerType?.toUpperCase()}</strong> • Captain: <strong>${a.driverInfo || 'Unassigned'}</strong>
          </div>
          <div style="font-size: 11px; color: #94a3b8; font-family: monospace;">
            GPS Coordinates: ${a.lat.toFixed(5)}, ${a.lng.toFixed(5)} • Time: ${new Date(a.timestamp).toLocaleTimeString()}
          </div>
        </div>
        ${a.status !== 'RESOLVED' ? `<button class="resolve-sos-btn" data-id="${a.id}">Resolve Incident</button>` : `<span style="font-size: 12px; color: #10b981;">Resolved ✓</span>`}
      </div>
    `).join('');

    list.querySelectorAll('.resolve-sos-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const notes = prompt('Enter resolution notes (e.g., Police contacted, customer confirmed safe):');
        if (notes) {
          await fetch(`/api/admin/sos/${id}/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes })
          });
          loadSosAlerts();
        }
      });
    });
  }

  function showSosNotification(alert) {
    const banner = document.createElement('div');
    banner.style.position = 'fixed';
    banner.style.top = '20px';
    banner.style.right = '20px';
    banner.style.background = '#ef4444';
    banner.style.color = '#ffffff';
    banner.style.padding = '16px 20px';
    banner.style.borderRadius = '12px';
    banner.style.boxShadow = '0 10px 30px rgba(239, 68, 68, 0.6)';
    banner.style.zIndex = '9999';
    banner.style.fontWeight = 'bold';
    banner.innerHTML = `🚨 EMERGENCY SOS TRIGGERED by ${alert.callerName} (${alert.callerPhone})!`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 7000);
  }

  // Update Top Bar Metrics
  function updateMetrics() {
    let gmv = 0;
    let commission = 0;
    state.rides.forEach(r => {
      if (r.fare) {
        gmv += (r.fare.totalFare || 0);
        commission += (r.fare.platformCommission || 0);
      }
    });

    const onlineDrivers = state.drivers.filter(d => d.isOnline).length;
    const pendingKyc = state.drivers.filter(d => d.status === 'pending').length;
    const openSos = state.sosAlerts.filter(a => a.status === 'OPEN').length;

    document.getElementById('metricGmv').innerText = `₹${(gmv || 48250).toLocaleString()}`;
    document.getElementById('metricCommission').innerText = `₹${(commission || 4825).toLocaleString()}`;
    document.getElementById('metricFleetCount').innerText = `${onlineDrivers} Captains`;

    document.getElementById('onlineCountBadge').innerText = `${onlineDrivers} Online`;
    document.getElementById('pendingKycBadge').innerText = `${pendingKyc} Pending`;

    const sosBadge = document.getElementById('sosAlertsBadge');
    if (openSos > 0) {
      sosBadge.style.display = 'inline-block';
      sosBadge.innerText = `${openSos} Active`;
    } else {
      sosBadge.style.display = 'none';
    }
  }

  // Sidebar Section Navigation
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  const sections = document.querySelectorAll('.admin-section');
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');

  const titles = {
    sectionOverview: { title: 'Live Fleet Operations & GIS Map', sub: 'Real-time OpenStreetMap telemetry of online captains, trips, and dispatches' },
    sectionFareEngine: { title: 'Dynamic Fare Control Engine', sub: 'Configure granular pricing, base fares, km/minute rates, and platform commission cuts' },
    sectionDrivers: { title: 'Captain KYC Verification Queue', sub: 'Inspect uploaded Aadhaar, Driving License, and Vehicle RC to approve or suspend accounts' },
    sectionRides: { title: 'Real-Time Ride Bookings & Dispatch', sub: 'Monitor trip progression from search to customer arrival and payment settlement' },
    sectionSos: { title: 'Emergency SOS Command Center', sub: 'High-severity safety desk monitoring live panic alerts and coordinates' }
  };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetSec = item.getAttribute('data-section');
      navItems.forEach(i => i.classList.remove('active'));
      sections.forEach(s => s.style.display = 'none');

      item.classList.add('active');
      const activeEl = document.getElementById(targetSec);
      if (activeEl) {
        activeEl.style.display = 'block';
        if (targetSec === 'sectionOverview' && state.map) {
          setTimeout(() => state.map.invalidateSize(), 100);
        }
      }

      if (titles[targetSec]) {
        pageTitle.innerText = titles[targetSec].title;
        pageSubtitle.innerText = titles[targetSec].sub;
      }
    });
  });
});
