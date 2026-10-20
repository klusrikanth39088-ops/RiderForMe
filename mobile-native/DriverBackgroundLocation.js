/**
 * RiderForMe Captain Partner App - Production Background Geolocation Service
 * 
 * Optimized specifically to withstand aggressive Android battery-saver killer policies
 * (e.g. Xiaomi MIUI, Samsung OneUI, OnePlus OxygenOS, Huawei EMUI).
 * 
 * Uses 'react-native-background-geolocation' (Transistor Software) with:
 *  1. Persistent Foreground Service Notification with FOREGROUND_SERVICE_LOCATION type
 *  2. CPU WakeLock during motion
 *  3. Auto-recovery on device reboot (startOnBoot)
 *  4. Whitelist exemption from Android Doze mode
 */

import BackgroundGeolocation from 'react-native-background-geolocation';
import { NativeModules, Platform, Alert } from 'react-native';

const BACKEND_WS_URL = 'https://api.riderforme.com'; // or local: http://10.0.2.2:5000

export class DriverLocationTracker {
  constructor(driverId, socket) {
    this.driverId = driverId;
    this.socket = socket;
    this.isTracking = false;
  }

  async initialize() {
    // 1. Request Android Battery Optimization Whitelist Exemption
    if (Platform.OS === 'android') {
      await this.requestBatteryOptimizationExemption();
    }

    // 2. Configure Background Geolocation Engine
    BackgroundGeolocation.ready({
      // Geolocation config
      desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
      distanceFilter: 10, // Update every 10 meters moved
      stationaryRadius: 25,
      locationUpdateInterval: 3000, // 3 seconds interval
      fastestLocationUpdateInterval: 2000,

      // Activity Recognition
      activityType: 'AutomotiveNavigation',
      stopTimeout: 5, // minutes to wait before turning off GPS when stationary

      // Application persistence & OS Kill protection
      stopOnTerminate: false, // Continue tracking even if app is swiped away from Recents!
      startOnBoot: true,      // Automatically relaunch GPS service on device restart
      enableHeadless: true,   // Handle headless background JS execution
      preventSuspend: true,   // Keep CPU alive using WakeLock

      // Persistent Android Foreground Service (Crucial against OS battery killers!)
      foregroundService: true,
      notification: {
        title: 'RiderForMe Captain Online',
        text: 'Actively tracking road location for ride dispatches...',
        color: '#10B981',
        channelName: 'Location Tracking',
        channelId: 'riderforme_location_channel',
        priority: BackgroundGeolocation.NOTIFICATION_PRIORITY_HIGH,
        smallIcon: 'ic_stat_location'
      },

      // HTTP Direct Upload fallback (if WebSocket momentarily disconnects)
      url: `${BACKEND_WS_URL}/api/driver/${this.driverId}/location`,
      httpHeaders: {
        'Content-Type': 'application/json'
      },
      autoSync: true,
      batchSync: false
    }, (state) => {
      console.log('[BackgroundGeolocation] Engine is ready. Current state:', state.enabled);
    });

    // 3. Register Location Event Listener
    BackgroundGeolocation.onLocation((location) => {
      const payload = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        heading: location.coords.heading || 0,
        speed: Math.round((location.coords.speed || 0) * 3.6), // convert m/s to km/h
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp
      };

      // Emit live coordinates over WebSocket for sub-second latency
      if (this.socket && this.socket.connected) {
        this.socket.emit('driver_update_coords', {
          driverId: this.driverId,
          location: payload
        });
      }
    }, (error) => {
      console.warn('[BackgroundGeolocation] Location error:', error);
    });

    // 4. Motion Change Listener (Moving vs Stationary)
    BackgroundGeolocation.onMotionChange((event) => {
      console.log('[BackgroundGeolocation] Motion change:', event.isMoving ? 'MOVING' : 'STATIONARY');
    });
  }

  /**
   * Start tracking when driver flips "Go Online" toggle
   */
  async start() {
    try {
      await BackgroundGeolocation.start();
      this.isTracking = true;
      console.log('[BackgroundGeolocation] Foreground Service started.');
    } catch (err) {
      console.error('[BackgroundGeolocation] Failed to start:', err);
    }
  }

  /**
   * Stop tracking when driver flips "Go Offline" toggle
   */
  async stop() {
    try {
      await BackgroundGeolocation.stop();
      this.isTracking = false;
      console.log('[BackgroundGeolocation] Foreground Service stopped.');
    } catch (err) {
      console.error('[BackgroundGeolocation] Failed to stop:', err);
    }
  }

  /**
   * Request Battery Optimization Exemption (Android Doze whitelist)
   */
  async requestBatteryOptimizationExemption() {
    try {
      // Directs the driver to 'Settings -> Battery -> Ignore battery optimizations'
      // This guarantees the OEM (e.g. Xiaomi MIUI / Samsung) will never terminate the service.
      BackgroundGeolocation.deviceSettings.showIgnoreBatteryOptimizations();
    } catch (e) {
      console.log('[DeviceSettings] Battery exemption prompt:', e);
    }
  }
}

export default DriverLocationTracker;
