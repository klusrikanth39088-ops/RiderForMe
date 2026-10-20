const axios = require('axios');

class GisService {
  constructor() {
    this.searchCache = new Map();
    this.routeCache = new Map();
  }

  /**
   * Search address / location autocomplete using Photon (OSM) with Nominatim fallback
   */
  async search(query, lat = 12.9716, lon = 77.5946) {
    if (!query || query.trim().length < 2) return [];

    const cacheKey = `${query.toLowerCase().trim()}_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey);
    }

    try {
      // 1. Try Komoot Photon API (free, fast OSM typeahead)
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lat=${lat}&lon=${lon}`;
      const response = await axios.get(photonUrl, { timeout: 4000 });

      if (response.data && response.data.features && response.data.features.length > 0) {
        const results = response.data.features.map(f => {
          const props = f.properties || {};
          const title = props.name || props.street || query;
          const addressParts = [
            props.street,
            props.suburb || props.district,
            props.city || props.town || props.county,
            props.state,
            props.postcode
          ].filter(Boolean);
          const address = addressParts.length > 0 ? addressParts.join(', ') : (props.country || 'India');

          return {
            title,
            address,
            fullLabel: `${title}, ${address}`,
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
            source: 'photon'
          };
        });

        this.searchCache.set(cacheKey, results);
        return results;
      }
    } catch (photonErr) {
      console.warn('Photon search warning, trying Nominatim fallback:', photonErr.message);
    }

    try {
      // 2. Nominatim fallback with compliant User-Agent
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1`;
      const response = await axios.get(nominatimUrl, {
        headers: { 'User-Agent': 'RiderForMe-OpenSource-Logistics/1.0 (contact: admin@riderforme.local)' },
        timeout: 4000
      });

      if (response.data && response.data.length > 0) {
        const results = response.data.map(item => {
          const title = item.name || item.display_name.split(',')[0];
          return {
            title,
            address: item.display_name,
            fullLabel: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            source: 'nominatim'
          };
        });

        this.searchCache.set(cacheKey, results);
        return results;
      }
    } catch (nomErr) {
      console.warn('Nominatim fallback error:', nomErr.message);
    }

    // 3. Built-in curated popular landmarks focusing on PIN 522426 (Macherla & 50km radius)
    const curated = [
      { title: 'Macherla RTC Bus Stand', address: 'Main Road, Macherla, Palnadu Dist, AP - 522426', lat: 16.4785, lng: 79.4210 },
      { title: 'Macherla Railway Station', address: 'Station Road, Macherla, Palnadu Dist, AP - 522426', lat: 16.4812, lng: 79.4245 },
      { title: 'Sri Laxmi Chennakesava Temple', address: 'Temple Street, Macherla, AP - 522426', lat: 16.4822, lng: 79.4162 },
      { title: 'Macherla Market Yard', address: 'Guntur Road, Macherla, AP - 522426', lat: 16.4755, lng: 79.4190 },
      { title: 'Ethipothala Waterfalls', address: 'Chandravanka River, Macherla Mandal, AP (11km)', lat: 16.5312, lng: 79.4285 },
      { title: 'Nagarjuna Sagar Dam View Point', address: 'Pylon Colony, Vijayapuri South, AP (24km)', lat: 16.5744, lng: 79.3146 },
      { title: 'Rentachintala Town Center', address: 'Macherla-Guntur Highway, Rentachintala (18km)', lat: 16.5510, lng: 79.5440 },
      { title: 'Gurazala Clock Tower', address: 'Main Road, Gurazala, Palnadu Dist (28km)', lat: 16.5820, lng: 79.5710 },
      { title: 'Durgi Main Road', address: 'Durgi Mandal Center, Palnadu Dist (16km)', lat: 16.4150, lng: 79.5080 },
      { title: 'Karampudi War Memorial', address: 'Guntur Highway, Karampudi (32km)', lat: 16.4380, lng: 79.7210 },
      { title: 'Piduguralla White Marble Market', address: 'Main Road, Piduguralla (48km)', lat: 16.4830, lng: 79.8890 },
      { title: 'Dachapalli Junction', address: 'Hyderabad-Guntur Highway, Dachapalli (38km)', lat: 16.6020, lng: 79.7340 },
      // Secondary metropolitan landmarks
      { title: 'Koramangala 5th Block', address: 'Sony World Signal, Bengaluru', lat: 12.9352, lng: 77.6245 },
      { title: 'Indiranagar 100 Feet Road', address: 'Indiranagar, Bengaluru', lat: 12.9716, lng: 77.6412 }
    ].filter(item => item.title.toLowerCase().includes(query.toLowerCase()) || item.address.toLowerCase().includes(query.toLowerCase()));

    return curated.map(item => ({ ...item, fullLabel: `${item.title}, ${item.address}`, source: 'curated_offline' }));
  }

  /**
   * Reverse Geocode (Lat, Lng to address string)
   */
  async reverse(lat, lon) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'RiderForMe-OpenSource-Logistics/1.0' },
        timeout: 4000
      });
      if (res.data && res.data.display_name) {
        return {
          address: res.data.display_name,
          title: res.data.name || res.data.display_name.split(',')[0],
          lat,
          lng: lon
        };
      }
    } catch (err) {
      console.warn('Reverse geocoding warning:', err.message);
    }
    return {
      address: `Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
      title: 'Current Pin Location',
      lat,
      lng: lon
    };
  }

  /**
   * Calculate exact Road Route, Distance (Kms), Duration (Mins) & Waypoints via OSRM
   */
  async getRoute(fromLat, fromLng, toLat, toLng) {
    const key = `${fromLat.toFixed(4)},${fromLng.toFixed(4)}_${toLat.toFixed(4)},${toLng.toFixed(4)}`;
    if (this.routeCache.has(key)) {
      return this.routeCache.get(key);
    }

    try {
      // OSRM expects coordinates as {longitude},{latitude}
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`;
      const response = await axios.get(osrmUrl, { timeout: 6000 });

      if (response.data && response.data.routes && response.data.routes.length > 0) {
        const route = response.data.routes[0];
        const distanceKm = +(route.distance / 1000).toFixed(2);
        const durationMin = +(route.duration / 60).toFixed(1);

        // Convert OSRM GeoJSON [lon, lat] coordinates to Leaflet [lat, lon] coordinates
        const coordinates = (route.geometry.coordinates || []).map(coord => [coord[1], coord[0]]);

        // Extract clean navigation step maneuvers
        const steps = [];
        if (route.legs && route.legs[0] && route.legs[0].steps) {
          route.legs[0].steps.forEach(st => {
            const maneuver = st.maneuver || {};
            const streetName = st.name ? ` onto ${st.name}` : '';
            let instruction = '';

            switch (maneuver.type) {
              case 'depart':
                instruction = `Head ${maneuver.modifier || 'straight'}${streetName}`;
                break;
              case 'turn':
                instruction = `Turn ${maneuver.modifier || 'right'}${streetName}`;
                break;
              case 'roundabout':
                instruction = `Take exit ${maneuver.exit || 1} at the roundabout`;
                break;
              case 'arrive':
                instruction = 'Arrive at destination';
                break;
              default:
                instruction = `${maneuver.type || 'Proceed'}${streetName}`;
            }

            if (instruction) {
              steps.push({
                instruction,
                distanceMeters: Math.round(st.distance),
                durationSeconds: Math.round(st.duration)
              });
            }
          });
        }

        const result = {
          distanceKm: Math.max(distanceKm, 0.5),
          durationMin: Math.max(durationMin, 2),
          coordinates,
          steps: steps.length > 0 ? steps : [{ instruction: 'Proceed along main road to destination', distanceMeters: Math.round(distanceKm * 1000), durationSeconds: Math.round(durationMin * 60) }],
          source: 'osrm'
        };

        this.routeCache.set(key, result);
        return result;
      }
    } catch (osrmErr) {
      console.warn('OSRM router warning, falling back to simulated road calculation:', osrmErr.message);
    }

    // Mathematical Fallback with Haversine + 1.28x road tortuosity
    return this.calculateFallbackRoute(fromLat, fromLng, toLat, toLng);
  }

  /**
   * Haversine mathematical fallback with interpolated road curve
   */
  calculateFallbackRoute(fromLat, fromLng, toLat, toLng) {
    const R = 6371; // km
    const dLat = (toLat - fromLat) * Math.PI / 180;
    const dLon = (toLng - fromLng) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(fromLat * Math.PI / 180) * Math.cos(toLat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightDist = R * c;

    // Apply urban road factor of 1.28x for Indian city traffic
    const distanceKm = +(Math.max(straightDist * 1.28, 0.5)).toFixed(2);
    // Average urban speed ~ 24 km/h => 2.5 min per km + 3 min fixed traffic buffer
    const durationMin = +(Math.max(distanceKm * 2.5 + 3, 3)).toFixed(1);

    // Generate 10-point smooth bezier-like road polyline
    const points = [];
    const stepsCount = 10;
    for (let i = 0; i <= stepsCount; i++) {
      const t = i / stepsCount;
      const lat = fromLat + (toLat - fromLat) * t + Math.sin(t * Math.PI) * 0.002;
      const lng = fromLng + (toLng - fromLng) * t + Math.cos(t * Math.PI) * 0.002;
      points.push([lat, lng]);
    }

    return {
      distanceKm,
      durationMin,
      coordinates: points,
      steps: [
        { instruction: 'Start towards destination via main thoroughfare', distanceMeters: Math.round(distanceKm * 500), durationSeconds: Math.round(durationMin * 30) },
        { instruction: 'Continue on main road and watch for traffic', distanceMeters: Math.round(distanceKm * 500), durationSeconds: Math.round(durationMin * 30) },
        { instruction: 'Arrive at destination', distanceMeters: 50, durationSeconds: 10 }
      ],
      source: 'fallback_math'
    };
  }
}

const gisService = new GisService();
module.exports = gisService;
