# ⚡ RiderForMe | Hyper-Local On-Demand Mobility Platform

A full-stack, hyper-local on-demand bike-taxi, auto-hailing, and B2B/B2C parcel logistics platform engineered with **100% free, open-source GIS and mapping infrastructure** to eliminate Google Maps/Mapbox billing costs.

---

## 🗺️ 100% Free & Open-Source GIS Architecture

| Feature | Open-Source Technology Stack | Zero Cost Benefit |
| :--- | :--- | :--- |
| **Map Tiles & UI** | OpenStreetMap (OSM) styled with Carto Voyager & Carto Dark Matter raster/vector tiles via Leaflet.js / MapLibre GL SDK | **$0 / unlimited** map loads & tile rendering |
| **Geocoding & Search** | Komoot Photon API (OSM Elasticsearch engine) + Nominatim reverse geocoder fallback | **$0 / unlimited** address typeahead and reverse geocoding with no API key requirement |
| **Routing & Distance** | Open Source Routing Machine (OSRM) HTTP Engine (`/route/v1/driving`) | Exact road distance in Kilometers, ETA in minutes, step-by-step turn maneuvers, and road geometry GeoJSON |

---

## 📦 System Architecture & Core Modules

The platform is organized into three interconnected operational modules plus a multi-device simulation hub:

```
riderforme/
├── server/
│   ├── index.js                # Express REST + HTTP + Socket.IO Real-Time Gateway
│   ├── services/
│   │   ├── gisService.js       # Free Photon Geocoding + Nominatim + OSRM Road Router
│   │   ├── fareEngine.js       # Granular Dynamic Pricing Formula with Live Sync
│   │   ├── matchEngine.js      # Dispatcher, 15s Countdown Manager & GPS Simulator
│   │   └── dataStore.js        # Persistent Data Store (Fares, Drivers, Rides, SOS)
│   └── routes/                 # REST Endpoints (/api/gis, /api/fares, /api/rides, /api/driver, /api/admin)
├── apps/
│   ├── hub/                    # Unified Multi-Device Studio (Live side-by-side simulator)
│   ├── customer-app/           # Module 1: Customer Mobile Web/PWA App
│   ├── driver-app/             # Module 2: Driver / Captain Mobile Web/PWA App
│   └── admin-dashboard/        # Module 3: Central Admin Desktop Dashboard
├── mobile-native/              # Production React Native & Android Manifest configurations
│   ├── DriverBackgroundLocation.js # High-priority Foreground Service (Battery-saver killer proof)
│   ├── CustomerMapComponent.jsx    # React Native MapLibre component
│   └── AndroidManifestSnippet.xml  # Android 14 Foreground Service permissions
├── docker-compose.yml          # Optional self-hosted OSRM & Photon container stack
└── package.json
```

---

## 📱 Module 1: Customer Mobile App (`/customer`)

- **Phone + OTP Authentication**: Clean mobile onboarding with 1-click test OTP.
- **Service Selection**: One-tap toggle for:
  - 🛵 **Bike Taxi** (Fastest solo commuter ride, low fare)
  - 🛺 **Auto Ride** (Spacious 3-seater auto-rickshaw)
  - 📦 **Parcel Delivery** (Doorstep documents, packages, food items)
- **Interactive Leaflet/OSM Booking Interface**:
  - Live GPS location pin with draggable reverse-geocoded pickup.
  - Typeahead destination search powered by the free **Photon API**.
  - Live road route polyline rendered from **OSRM**.
  - Dynamic fare calculation breakdown (Base Fare + Extra Km + Ride Duration Charge).
- **Payment Method Selector**: Cash on Delivery (COD), In-App Wallet (with balance display), and Direct UPI intent.
- **Live Ride Status & Tracking**:
  - Radar pulse searching animation while dispatching.
  - Driver assigned card with photo, name, rating (4.88★), and vehicle plate.
  - **4-Digit Start OTP** for secure ride validation.
  - Real-time animated movement of Captain on the road map via WebSockets.
- **🚨 Emergency SOS Panic Button**: Dispatches high-priority GPS payload directly to Central Admin operations with audible alarm.

---

## 🛵 Module 2: Driver / Captain Mobile App (`/driver`)

- **Profile & Document Onboarding (KYC)**:
  - Driver onboarding portal for uploading **Aadhaar Card**, **Driving License (DL)**, and **Vehicle RC**.
  - Status indicator: Displays **"Pending Approval"** until approved by Administrator.
- **Persistent "Go Online / Go Offline" Toggle**:
  - Top header toggle switch. Offline drivers are hidden from dispatch matching; going online starts broadcasting GPS coordinates via WebSockets.
- **15-Second Animated Booking Overlay Banner**:
  - Triggered automatically when a nearby ride is booked.
  - 15-second SVG circular countdown timer.
  - Audio alert chime synthesized via Web Audio API.
  - Shows pickup distance, drop-off location, and expected net earnings after platform commission cut.
  - Accept and Decline buttons.
- **Turn-by-Turn Navigation & In-Ride Controls**:
  - In-app maneuver directions (e.g., "Turn left onto 100 Feet Rd in 250m").
  - **Native Google Maps Launch Intent**: Launches Google Maps navigation app directly on the driver's phone with one tap.
  - "I Have Arrived" button.
  - "Verify Customer OTP & Start Trip" modal to eliminate fraudulent starts.
  - "Complete Trip & Settle" button.
- **Financial Ledger & In-App Wallet**:
  - Displays total wallet balance, today's earnings, and completed trips count.
  - Transparent ledger showing gross trip fare, platform commission cut deduction, and net earnings.
  - **Instant Payout Settlement Request**: Allows instant withdrawal to any Bank/UPI ID.

---

## 🖥️ Module 3: Central Admin Dashboard & Dynamic Fare Engine (`/admin`)

- **Real-Time Live Fleet Map**:
  - Dynamic GIS map powered by Leaflet.js showing all currently online captains, their vehicle types, availability states, and active trip routes.
- **Driver Verification Module (KYC)**:
  - Table of driver partners with filter tabs (All, Pending, Approved, Rejected).
  - **Document Inspection Modal**: Inspect high-resolution uploads of Aadhaar, DL, and RC.
  - 1-click **Approve**, **Reject**, or **Suspend** actions. Updates push immediately to the driver's phone app via WebSockets without page reload!
- **Granular Dynamic Fare Engine**:
  - Instant slider and numerical input controls for Bike, Auto, and Parcel:
    1. **Base Fare (₹)** (e.g. ₹25 for Bike, ₹40 for Auto, ₹30 for Parcel)
    2. **Base Distance (Km)** (e.g. first 2.0 km included in base)
    3. **Per-Kilometer Rate (₹/km)** (e.g. ₹8.00/km)
    4. **Per-Minute Ride Duration Charge (₹/min)** (e.g. ₹0.50/min)
    5. **Platform Commission Percentage (%)** (e.g. 10% deducted from driver wallet)
    6. **Surge Multiplier** (e.g. 1.0x to 2.5x peak pricing)
  - **Interactive Fare Sandbox Simulator**: Test any distance (e.g. 6.5 km) and time (e.g. 20 min) on sliders to see the exact resulting Customer Fare, Driver Net Earning, and Platform Profit in real time before publishing.
  - **Real-Time App Sync**: Clicking "Save & Publish" instantly updates the backend formula cache. The very next ride booked by any customer immediately uses the new pricing without requiring an app store update or server reboot!
- **🚨 Emergency SOS Incident Desk**:
  - Audio siren and visual flashing beacon when an SOS is triggered by any customer or captain.
  - Displays caller name, phone number, vehicle plate, live coordinates, and timestamp.
  - "Resolve Incident" action with audit notes.
- **Platform Analytics**: Total GMV, Platform Commission Revenue, Completed Rides, Online Captains.

---

## 🔋 Android Battery-Saver Killer Prevention (Mobile Native)

Aggressive OEM battery managers (Xiaomi MIUI, Samsung OneUI, OnePlus OxygenOS, Vivo/Oppo ColorOS) terminate background GPS processes within 60 seconds if not configured properly.

The solution in [`mobile-native/DriverBackgroundLocation.js`](mobile-native/DriverBackgroundLocation.js) and [`mobile-native/AndroidManifestSnippet.xml`](mobile-native/AndroidManifestSnippet.xml) enforces:
1. **Android Foreground Service (`FOREGROUND_SERVICE_LOCATION`)** with persistent high-priority notification (`NOTIFICATION_PRIORITY_HIGH`).
2. **CPU WakeLock** during active trips to prevent deep sleep CPU throttling.
3. **`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`**: Directs the captain to exempt the app from Android Doze mode.
4. **`startOnBoot: true`**: Automatically revives the GPS tracking service if the device restarts.

---

## 🚀 Quick Start & Installation

### Prerequisites
- Node.js (v18 or higher)
- npm

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```

### 3. Open the Interfaces
Once running, open your web browser:
- 🎮 **Unified Multi-App Studio Hub**: [http://localhost:5000/](http://localhost:5000/) *(Test Customer, Captain, and Admin side-by-side in real-time)*
- 📱 **Customer Mobile App**: [http://localhost:5000/customer](http://localhost:5000/customer)
- 🛵 **Driver Captain App**: [http://localhost:5000/driver](http://localhost:5000/driver)
- 🖥️ **Central Admin Dashboard**: [http://localhost:5000/admin](http://localhost:5000/admin)

---

## 🧪 Interactive End-to-End Test Walkthrough

1. Open **[http://localhost:5000/](http://localhost:5000/)** to view the Trio Studio.
2. In the **Customer App (Left)**:
   - Notice the current pickup location (*Koramangala 5th Block*).
   - In "WHERE TO?", type `Indiranagar` or click the **Indiranagar Metro** shortcut chip.
   - The road route polyline is fetched from **OSRM** and drawn on the map.
   - Review the dynamic fare estimate (e.g., Bike Taxi ~ ₹65). Click *"View Dynamic Fare Breakdown"* to see the exact formula calculation.
   - Click **"Confirm & Book Ride"**.
3. In the **Captain App (Center)**:
   - An audible notification chime plays.
   - The **15-second animated countdown overlay** appears showing pickup distance (*1.2 km away*), drop-off area, and expected earnings (*₹58.50*).
   - Click **"ACCEPT RIDE"**.
4. In the **Admin Dashboard (Right)**:
   - The Admin Live Map displays the active trip route line and moving captain marker.
   - Go to **"Dynamic Fare Engine"**: change Bike Base Fare from ₹25 to ₹35, change per-km to ₹10, and click **"Save & Publish Pricing"**.
   - Notice how the next booking on the Customer App instantly reflects the updated pricing in real-time!
5. In the **Admin Dashboard**:
   - Go to **"Driver KYC Verification"**.
   - Select the pending driver (*Aniket Sharma*), click **"Inspect Documents & Verify"**.
   - Inspect the uploaded **Aadhaar**, **DL**, and **RC** photos, then click **"APPROVE CAPTAIN"**.
   - Watch the Captain App instantly unlock to **Approved** via WebSockets!
6. Click the **🚨 SOS Button** in the Customer App:
   - The siren alert triggers and the emergency incident flashes on the Central Admin SOS Desk with live GPS coordinates.

---

## 🐳 Optional: Self-Hosting OSRM & Photon with Docker

To run 100% on-premises without querying external public demo servers:
```bash
docker compose up -d
```
This launches a local OSRM routing engine on port `5001` and Photon geocoder on port `2322`.
