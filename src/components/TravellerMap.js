import React, { useRef, useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { COLORS } from '../constants';

const MAP_HEIGHT = 140;
const EDGE_PADDING = { top: 30, right: 30, bottom: 30, left: 30 };

// Android (Google Maps): soft greys and pale water, so the app's colours
// lead. iPhone uses Apple's own muted style instead.
const MUTED_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#EEF2F4' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7F8D99' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F6F8F9' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#C9D3DA' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#D6E4EC' }] },
];

/**
 * A small map of the places a traveller has written about: one pin each,
 * framed to fit them all. Hidden when none has a location.
 *
 * @param {Array<{ key, label, lat, lng }>} places
 * @param {string} [activeKey]  the selected place (its dot is bigger and dark)
 * @param {(key) => void} [onPressPlace]
 */
export default function TravellerMap({ places, activeKey, onPressPlace }) {
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  // Explicit pixel size: a percentage can leave the native map at 0x0 on iOS.
  const [width, setWidth] = useState(0);

  const located = useMemo(
    () => places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [places]
  );
  const signature = located.map((p) => p.key).join(',');

  useEffect(() => {
    if (!ready || !mapRef.current || located.length === 0) return;
    const coords = located.map((p) => ({ latitude: p.lat, longitude: p.lng }));
    if (coords.length === 1) {
      // One place: show its city and surroundings.
      mapRef.current.animateToRegion({ ...coords[0], latitudeDelta: 1.5, longitudeDelta: 1.5 }, 300);
    } else {
      mapRef.current.fitToCoordinates(coords, { edgePadding: EDGE_PADDING, animated: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature]);

  if (located.length === 0) return null;

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w && w !== width) setWidth(w);
      }}
    >
      {width > 0 && (
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={{ width, height: MAP_HEIGHT }}
          initialRegion={{ latitude: located[0].lat, longitude: located[0].lng, latitudeDelta: 20, longitudeDelta: 20 }}
          onMapReady={() => setReady(true)}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          showsPointsOfInterest={false}
          mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
          customMapStyle={Platform.OS === 'android' ? MUTED_STYLE : undefined}
        >
          {located.map((p) => (
            <Marker
              key={`${p.key}-${p.key === activeKey ? 'on' : 'off'}`}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              title={p.label}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              onPress={onPressPlace ? () => onPressPlace(p.key) : undefined}
            >
              {/* A small dot: orange, bigger when its place is selected. */}
              <View style={[styles.dot, p.key === activeKey && styles.dotActive]} />
            </Marker>
          ))}
        </MapView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: MAP_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: COLORS.cardBackground,
    marginTop: 16,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.accent,
    borderWidth: 2.5,
    borderColor: COLORS.white,
  },
  dotActive: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
});
