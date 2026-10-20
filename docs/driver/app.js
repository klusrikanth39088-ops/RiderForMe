// RiderForMe Driver Captain Mobile App Logic
document.addEventListener('DOMContentLoaded', () => {
  // App State
  const state = {
    driverId: 'drv-001', // Default captain (Rajesh Kumar)
    driver: null,
    isOnline: true,
    activeRide: null,
    countdownTimer: null,
    secondsLeft: 15,
    map: null,
    captainMarker: null,
    routePolyline: null
  };

  // Connect to Socket.IO Server
  const socket = io();

  // Audio Chime Synthesizer via Web Audio API (Zero external MP3 dependencies)
  function playNotificationChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Pleasant alert chime (880Hz to 1320Hz)
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch (e) {
      console.warn('Audio chime note:', e);
    }
  }

  // Initialize Map (Centered on Macherla PIN 522426)
  state.map = L.map('driverMap', {
    zoomControl: false,
    attributionControl: false
  }).setView([16.4785, 79.4210], 14);

  // Local Offline Tiles (522426 Macherla & 50km radius)
  L.tileLayer('/api/tiles/{z}/{x}/{y}.png', {
    maxZoom: 19,
    errorTileUrl: 'https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png'
  }).addTo(state.map);

  // 50km Offline Operational Coverage Circle
  L.circle([16.4771, 79.4185], {
    radius: 50000,
    color: '#10b981',
    weight: 2,
    dashArray: '6, 6',
    fillColor: '#10b981',
    fillOpacity: 0.03
  }).addTo(state.map);

  function createCaptainIcon(emoji = '🛵') {
    return L.divIcon({
      className: 'driver-map-pin',
      html: `<div style="
        background: #10b981;
        border: 2px solid #ffffff;
        box-shadow: 0 0 15px rgba(16, 185, 129, 0.8);
        border-radius: 50%;
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
      ">${emoji}</div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });
  }

  // Load Driver Profile from Server
  loadDriverProfile(state.driverId);

  async function loadDriverProfile(id) {
    try {
      const res = await fetch(`/api/driver/${id}`);
      const json = await res.json();
      if (json.success && json.data) {
        state.driver = json.data;
        state.driverId = json.data.id;
        state.isOnline = json.data.isOnline;

        // Register role with Socket.IO
        socket.emit('register_role', { role: 'driver', id: state.driverId });

        renderDriverUI();
        loadWalletLedger();
      }
    } catch (err) {
      console.error('Failed to load driver profile:', err);
    }
  }

  function renderDriverUI() {
    const d = state.driver;
    if (!d) return;

    document.getElementById('captainName').innerText = d.name;
    document.getElementById('captainPlate').innerText = `${d.vehicleNumber} • ${d.vehicleModel || 'Two-Wheeler'}`;
    if (d.avatar) document.getElementById('captainAvatar').src = d.avatar;

    // Online toggle
    const toggle = document.getElementById('onlineToggle');
    const statusLabel = document.getElementById('statusLabel');
    const offlineOverlay = document.getElementById('offlineOverlay');

    toggle.checked = d.isOnline;
    statusLabel.innerText = d.isOnline ? 'ONLINE' : 'OFFLINE';
    statusLabel.style.color = d.isOnline ? '#10b981' : '#94a3b8';
    offlineOverlay.style.display = d.isOnline ? 'none' : 'flex';

    // Verification Banner
    const kycBanner = document.getElementById('kycBanner');
    const kycBadge = document.getElementById('kycStatusBadge');

    if (d.status === 'pending') {
      kycBanner.style.display = 'flex';
      kycBadge.innerText = 'PENDING APPROVAL';
      kycBadge.style.background = 'rgba(245, 158, 11, 0.2)';
      kycBadge.style.color = '#f59e0b';
    } else if (d.status === 'approved') {
      kycBanner.style.display = 'none';
      kycBadge.innerText = 'APPROVED';
      kycBadge.style.background = 'rgba(16, 185, 129, 0.2)';
      kycBadge.style.color = '#10b981';
    } else {
      kycBanner.style.display = 'flex';
      kycBadge.innerText = d.status.toUpperCase();
      kycBadge.style.background = 'rgba(239, 68, 68, 0.2)';
      kycBadge.style.color = '#ef4444';
    }

    // Update map pin
    if (d.location) {
      if (state.captainMarker) {
        state.captainMarker.setLatLng([d.location.lat, d.location.lng]);
      } else {
        const vehicleEmoji = d.serviceType === 'auto' ? '🛺' : (d.serviceType === 'parcel' ? '📦' : '🛵');
        state.captainMarker = L.marker([d.location.lat, d.location.lng], {
          icon: createCaptainIcon(vehicleEmoji)
        }).addTo(state.map);
      }
      state.map.setView([d.location.lat, d.location.lng], 14);
    }
  }

  // Persistent Go Online / Go Offline Toggle
  const onlineToggle = document.getElementById('onlineToggle');
  onlineToggle.addEventListener('change', async (e) => {
    try {
      const res = await fetch(`/api/driver/${state.driverId}/toggle-online`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        alert(json.message || 'Cannot go online. Account must be approved by Admin first.');
        onlineToggle.checked = false;
        return;
      }
      state.isOnline = json.isOnline;
      state.driver.isOnline = json.isOnline;
      renderDriverUI();
    } catch (err) {
      console.error('Online toggle error:', err);
    }
  });

  document.getElementById('goOnlineQuickBtn').addEventListener('click', () => {
    onlineToggle.click();
  });

  // Socket: Real-time verification status change from Admin Dashboard
  socket.on(`driver_verification_${state.driverId}`, (payload) => {
    console.log('[Socket] Driver verification status updated:', payload);
    state.driver.status = payload.status;
    renderDriverUI();
    alert(`🎉 Account Status Update!\nYour captain account has been marked: ${payload.status.toUpperCase()}`);
  });

  // Socket: Listen for incoming 15-second ride booking requests
  socket.on(`driver_request_${state.driverId}`, (req) => {
    show15SecondRequestOverlay(req);
  });

  // Also listen for broadcast fallback
  socket.on('driver_ride_request_broadcast', (req) => {
    if (req.driverId === state.driverId) {
      show15SecondRequestOverlay(req);
    }
  });

  // Show 15-Second Animated Booking Request Overlay
  function show15SecondRequestOverlay(req) {
    if (!state.isOnline) return;

    state.pendingRideRequest = req;
    playNotificationChime();

    const overlay = document.getElementById('bookingOverlay');
    const circle = document.getElementById('timerProgressCircle');
    const secondsText = document.getElementById('timerSecondsText');

    document.getElementById('reqEarnings').innerText = `Earn ₹${req.driverEarnings.toFixed(2)}`;
    document.getElementById('reqPickupDistance').innerText = `${req.pickupDistanceKm} km away (${req.pickupEtaMin} mins)`;
    document.getElementById('reqPickupAddress').innerText = req.pickup.address;
    document.getElementById('reqDropoffAddress').innerText = req.dropoff.address;

    const emoji = req.serviceType === 'auto' ? '🛺 Auto Ride' : (req.serviceType === 'parcel' ? '📦 Parcel Delivery' : '🛵 Bike Taxi');
    document.getElementById('reqServiceBadge').innerText = emoji;

    overlay.style.display = 'flex';

    // 15-Second countdown timer
    state.secondsLeft = req.expiresInSeconds || 15;
    const totalCircumference = 276.46; // 2 * PI * 44

    if (state.countdownTimer) clearInterval(state.countdownTimer);

    secondsText.innerText = `${state.secondsLeft}s`;
    circle.style.strokeDashoffset = 0;

    state.countdownTimer = setInterval(() => {
      state.secondsLeft--;
      secondsText.innerText = `${state.secondsLeft}s`;

      const progress = (15 - state.secondsLeft) / 15;
      circle.style.strokeDashoffset = totalCircumference * progress;

      if (state.secondsLeft <= 0) {
        clearInterval(state.countdownTimer);
        overlay.style.display = 'none';
      }
    }, 1000);
  }

  // Accept Ride Button
  document.getElementById('acceptRideBtn').addEventListener('click', async () => {
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    document.getElementById('bookingOverlay').style.display = 'none';

    if (!state.pendingRideRequest) return;

    try {
      const res = await fetch(`/api/driver/${state.driverId}/accept-ride`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rideId: state.pendingRideRequest.rideId })
      });
      const json = await res.json();
      if (json.success && json.data) {
        state.activeRide = json.data;
        startInRideNavigation(json.data);
      }
    } catch (err) {
      console.error('Accept ride error:', err);
    }
  });

  // Decline Ride Button
  document.getElementById('declineRideBtn').addEventListener('click', async () => {
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    document.getElementById('bookingOverlay').style.display = 'none';

    if (state.pendingRideRequest) {
      fetch(`/api/driver/${state.driverId}/decline-ride`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rideId: state.pendingRideRequest.rideId })
      });
    }
  });

  // Start In-Ride HUD & Navigation
  function startInRideNavigation(ride) {
    document.getElementById('navigationHud').style.display = 'flex';
    document.getElementById('tripCustomerName').innerText = ride.customer.name;
    document.getElementById('tripDestinationText').innerText = `Drop: ${ride.dropoff.address.split(',')[0]}`;

    // Display first turn maneuver step
    if (ride.navigationSteps && ride.navigationSteps.length > 0) {
      const step = ride.navigationSteps[0];
      document.getElementById('maneuverText').innerText = step.instruction;
      document.getElementById('maneuverDist').innerText = `In ${step.distanceMeters} meters`;
    }

    // Draw route on map
    if (ride.routeCoordinates && ride.routeCoordinates.length > 0) {
      if (state.routePolyline) state.map.removeLayer(state.routePolyline);
      state.routePolyline = L.polyline(ride.routeCoordinates, {
        color: '#10b981',
        weight: 6,
        opacity: 0.9
      }).addTo(state.map);
      state.map.fitBounds(state.routePolyline.getBounds(), { padding: [50, 50] });
    }

    // Progression buttons state
    document.getElementById('arrivedBtn').style.display = 'block';
    document.getElementById('startTripBtn').style.display = 'none';
    document.getElementById('completeTripBtn').style.display = 'none';

    // Configure External Google Maps Launch Intent Button
    const gmapsBtn = document.getElementById('googleMapsIntentBtn');
    gmapsBtn.onclick = () => {
      const destLat = ride.dropoff.lat;
      const destLng = ride.dropoff.lng;
      // Google Maps Intent URL works directly on Android & iOS devices!
      const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`;
      window.open(gmapsUrl, '_blank');
    };
  }

  // Progression: Arrived at Pickup
  document.getElementById('arrivedBtn').addEventListener('click', () => {
    document.getElementById('arrivedBtn').style.display = 'none';
    document.getElementById('startTripBtn').style.display = 'block';
  });

  // Progression: Start Trip (Opens Customer OTP input modal)
  const otpVerifyModal = document.getElementById('otpVerifyModal');
  document.getElementById('startTripBtn').addEventListener('click', () => {
    document.getElementById('captainOtpInput').value = '';
    otpVerifyModal.style.display = 'flex';
  });

  document.getElementById('cancelOtpBtn').addEventListener('click', () => {
    otpVerifyModal.style.display = 'none';
  });

  document.getElementById('confirmOtpBtn').addEventListener('click', async () => {
    const inputOtp = document.getElementById('captainOtpInput').value.trim();
    if (!inputOtp || inputOtp.length !== 4) {
      alert('Please enter the 4-digit OTP provided by customer');
      return;
    }

    try {
      const res = await fetch(`/api/rides/${state.activeRide.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: inputOtp })
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Invalid OTP. Ask customer for 4-digit start PIN.');
        return;
      }

      otpVerifyModal.style.display = 'none';
      document.getElementById('startTripBtn').style.display = 'none';
      document.getElementById('completeTripBtn').style.display = 'block';
      alert('Trip Started! Drive safely to customer destination.');
    } catch (err) {
      console.error('Start trip error:', err);
    }
  });

  // Progression: Complete Trip
  document.getElementById('completeTripBtn').addEventListener('click', async () => {
    try {
      const res = await fetch(`/api/rides/${state.activeRide.id}/complete`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        alert(`✅ Trip Completed!\nTotal Earned: ₹${json.data.fare.driverEarnings.toFixed(2)} (Platform cut 10% deducted)`);
        document.getElementById('navigationHud').style.display = 'none';
        if (state.routePolyline) state.map.removeLayer(state.routePolyline);
        state.activeRide = null;
        loadDriverProfile(state.driverId);
      }
    } catch (err) {
      console.error('Complete ride error:', err);
    }
  });

  // Wallet & Ledger Loading
  async function loadWalletLedger() {
    try {
      const res = await fetch(`/api/driver/${state.driverId}/wallet`);
      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        document.getElementById('walletBalance').innerText = `₹${d.walletBalance.toFixed(2)}`;
        document.getElementById('todayEarnings').innerText = `₹${d.todayEarnings.toFixed(2)}`;
        document.getElementById('totalRides').innerText = d.totalRides.toLocaleString();

        const listEl = document.getElementById('ledgerList');
        if (d.ledger && d.ledger.length > 0) {
          listEl.innerHTML = d.ledger.map(item => `
            <div class="ledger-entry">
              <div class="entry-details">
                <span class="entry-title">${item.note || 'Ride Completed'}</span>
                <span class="entry-date">${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Mode: ${item.paymentMethod || 'UPI'}</span>
              </div>
              <div class="entry-math">
                <div class="entry-net">${item.netEarnings >= 0 ? '+' : ''}₹${Math.abs(item.netEarnings).toFixed(2)}</div>
                ${item.commission ? `<div class="entry-cut">-₹${item.commission.toFixed(2)} platform fee</div>` : ''}
              </div>
            </div>
          `).join('');
        } else {
          listEl.innerHTML = `
            <div class="ledger-entry">
              <div class="entry-details">
                <span class="entry-title">Trip Completed • 5.2 km</span>
                <span class="entry-date">10:45 AM • UPI Payment</span>
              </div>
              <div class="entry-math">
                <div class="entry-net">+₹52.20</div>
                <div class="entry-cut">-₹5.80 fee (10%)</div>
              </div>
            </div>
            <div class="ledger-entry">
              <div class="entry-details">
                <span class="entry-title">Trip Completed • 8.1 km</span>
                <span class="entry-date">09:15 AM • Cash on Delivery</span>
              </div>
              <div class="entry-math">
                <div class="entry-net">+₹79.40</div>
                <div class="entry-cut">-₹8.80 fee (10%)</div>
              </div>
            </div>
          `;
        }
      }
    } catch (err) {
      console.warn('Wallet load warning:', err);
    }
  }

  // Instant Payout Settlement Modal Handlers
  const payoutModal = document.getElementById('payoutModal');
  document.getElementById('payoutModalBtn').addEventListener('click', () => {
    payoutModal.style.display = 'flex';
  });

  document.getElementById('closePayoutBtn').addEventListener('click', () => {
    payoutModal.style.display = 'none';
  });

  document.getElementById('confirmPayoutBtn').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('payoutAmountInput').value);
    const upi = document.getElementById('payoutUpiInput').value.trim();

    if (!amount || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      const res = await fetch(`/api/driver/${state.driverId}/payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, upiId: upi })
      });
      const json = await res.json();
      if (json.success) {
        alert(`⚡ Instant Settlement Successful!\n₹${amount} has been disbursed to ${upi}`);
        payoutModal.style.display = 'none';
        loadWalletLedger();
      } else {
        alert(json.error || 'Failed to process payout');
      }
    } catch (err) {
      console.error('Payout error:', err);
    }
  });

  // Bottom Nav Tab Switching
  const navBtns = document.querySelectorAll('.nav-btn');
  const tabs = document.querySelectorAll('.tab-view');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      navBtns.forEach(b => b.classList.remove('active'));
      tabs.forEach(t => t.style.display = 'none');

      btn.classList.add('active');
      const activeEl = document.getElementById(targetTab);
      if (activeEl) {
        activeEl.style.display = 'block';
        if (targetTab === 'mapTab' && state.map) {
          setTimeout(() => state.map.invalidateSize(), 100);
        }
      }
    });
  });

  document.getElementById('viewKycBtn').addEventListener('click', () => {
    document.querySelector('.nav-btn[data-tab="kycTab"]').click();
  });

  // Demo Switch Captain Account Chips
  document.querySelectorAll('.cap-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.cap-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const newId = chip.getAttribute('data-id');
      loadDriverProfile(newId);
    });
  });
});
