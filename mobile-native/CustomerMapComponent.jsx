import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';

// Free OpenStreetMap Vector Style Specification (Zero Google/Mapbox API keys)
const OSM_VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/liberty'; // or self-hosted OpenMapTiles JSON

MapLibreGL.setAccessToken(null); // No API key required!

export const CustomerMapComponent = ({
  pickupLocation,
  dropoffLocation,
  routeCoordinates,
  nearbyDrivers = [],
  onSelectDropoff
}) => {
  const cameraRef = useRef(null);

  useEffect(() => {
    if (pickupLocation && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [pickupLocation.lng, pickupLocation.lat],
        zoomLevel: 14,
        animationDuration: 1000
      });
    }
  }, [pickupLocation]);

  // Fit route bounds when trip route coordinates change
  useEffect(() => {
    if (routeCoordinates && routeCoordinates.length > 1 && cameraRef.current) {
      const lngs = routeCoordinates.map(c => c[1]);
      const lats = routeCoordinates.map(c => c[0]);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);

      cameraRef.current.fitBounds([maxLng, maxLat], [minLng, minLat], [60, 60, 60, 60], 800);
    }
  }, [routeCoordinates]);

  // Route GeoJSON line feature
  const routeGeoJson = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: (routeCoordinates || []).map(coord => [coord[1], coord[0]]) // [lng, lat]
    }
  };

  return (
    <View style={styles.container}>
      <MapLibreGL.MapView
        style={styles.map}
        styleURL={OSM_VECTOR_STYLE}
        logoEnabled={false}
        attributionEnabled={false}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [77.6245, 12.9352],
            zoomLevel: 13
          }}
        />

        {/* Pickup Pin */}
        {pickupLocation && (
          <MapLibreGL.PointAnnotation
            id="pickupPin"
            coordinate={[pickupLocation.lng, pickupLocation.lat]}
          >
            <View style={[styles.markerCircle, styles.pickupMarker]}>
              <Text style={styles.markerText}>📍</Text>
            </View>
          </MapLibreGL.PointAnnotation>
        )}

        {/* Dropoff Pin */}
        {dropoffLocation && (
          <MapLibreGL.PointAnnotation
            id="dropoffPin"
            coordinate={[dropoffLocation.lng, dropoffLocation.lat]}
          >
            <View style={[styles.markerCircle, styles.dropoffMarker]}>
              <Text style={styles.markerText}>🏁</Text>
            </View>
          </MapLibreGL.PointAnnotation>
        )}

        {/* Nearby Captains / Fleet */}
        {nearbyDrivers.map(d => (
          <MapLibreGL.PointAnnotation
            key={d.id}
            id={d.id}
            coordinate={[d.location.lng, d.location.lat]}
          >
            <View style={styles.driverPin}>
              <Text style={styles.driverEmoji}>{d.serviceType === 'auto' ? '🛺' : '🛵'}</Text>
            </View>
          </MapLibreGL.PointAnnotation>
        ))}

        {/* OSRM Road Polyline Layer */}
        {routeCoordinates && routeCoordinates.length > 0 && (
          <MapLibreGL.ShapeSource id="routeSource" shape={routeGeoJson}>
            <MapLibreGL.LineLayer
              id="routeLine"
              style={{
                lineColor: '#2563EB',
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 0.85
              }}
            />
          </MapLibreGL.ShapeSource>
        )}
      </MapLibreGL.MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  markerCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4
  },
  pickupMarker: { borderColor: '#10B981' },
  dropoffMarker: { borderColor: '#EF4444' },
  markerText: { fontSize: 16 },
  driverPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5
  },
  driverEmoji: { fontSize: 16 }
});

export default CustomerMapComponent;
