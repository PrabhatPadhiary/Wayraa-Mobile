import React, { useRef, useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { COLORS, SIZES } from '../constants';

/** Pin colors by place kind, matching the website's trip map. */
const KIND_META = {
  stays: { label: 'Stays', color: '#2563eb' },
  food: { label: 'Restaurants', color: '#dc2626' },
  activities: { label: 'Activities', color: '#16a34a' },
};

const MAP_HEIGHT = 260;
const EDGE_PADDING = { top: 60, right: 60, bottom: 60, left: 60 };

/**
 * Map of a trip's saved places, one colored pin per place, framed to fit all
 * of them. Places without coordinates are skipped.
 *
 * @param {Array<{ id, name, latitude, longitude, rating?, kind: 'stays'|'food'|'activities' }>} places
 * @param {(place) => void} [onPressPlace] called when a pin's callout is tapped
 */
export default function TripMap({ places, onPressPlace }) {
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  // MapView gets explicit pixel dimensions (like PlaceDetailScreen's map);
  // a percentage/absolute-fill size can leave the native map at 0x0 on iOS.
  const [width, setWidth] = useState(0);

  const located = useMemo(
    () => places.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)),
    [places]
  );
  const signature = located.map((p) => p.id).join(',');

  // Frame every pin whenever the set of places changes.
  useEffect(() => {
    if (!ready || !mapRef.current || located.length === 0) return;
    const coords = located.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    if (coords.length === 1) {
      mapRef.current.animateToRegion({ ...coords[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }, 300);
    } else {
      mapRef.current.fitToCoordinates(coords, { edgePadding: EDGE_PADDING, animated: true });
    }
    // `signature` captures changes to the list; `located` itself changes identity each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature]);

  if (located.length === 0) return null;

  const counts = located.reduce((acc, p) => {
    acc[p.kind] = (acc[p.kind] || 0) + 1;
    return acc;
  }, {});

  return (
    <View>
      <View
        style={styles.mapWrap}
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
          initialRegion={{
            latitude: located[0].latitude,
            longitude: located[0].longitude,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          }}
          onMapReady={() => setReady(true)}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          showsPointsOfInterest={false}
        >
          {located.map((p) => (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.latitude, longitude: p.longitude }}
              title={p.name}
              description={p.rating > 0 ? `★ ${p.rating}` : undefined}
              pinColor={(KIND_META[p.kind] || KIND_META.activities).color}
              onCalloutPress={onPressPlace ? () => onPressPlace(p) : undefined}
            />
          ))}
        </MapView>
        )}
      </View>

      <View style={styles.legend}>
        {Object.entries(KIND_META)
          .filter(([kind]) => counts[kind])
          .map(([kind, meta]) => (
            <View key={kind} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
              <Text style={styles.legendText}>{meta.label} · {counts[kind]}</Text>
            </View>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    height: MAP_HEIGHT,
    overflow: 'hidden',
    borderRadius: SIZES.radius_lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.cardBackground,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.spacing_md,
    marginTop: SIZES.spacing_sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
});
