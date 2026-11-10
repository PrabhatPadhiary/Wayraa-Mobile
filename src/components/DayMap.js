import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Linking, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';

/*
 * The Itinerary's map: full screen behind the plan's bottom sheet. The day's
 * stops as numbered pins joined by a dashed line, and saved-but-unplanned
 * spots nearby as faded pins.
 *
 * Stops: [{ id, n, title, latitude, longitude, color }] in visiting order.
 * Extras: [{ id, title, latitude, longitude, place }] (unplanned spots).
 * Area: { latitude, longitude } to show when there's nothing to pin.
 */

// Muted map look so the coloured pins stand out (Android / Google Maps; iOS
// uses Apple's muted map type instead).
const MUTED_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f1f4f7' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7b8794' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfe4f2' }] },
];
const mapLook = Platform.OS === 'ios'
  ? { mapType: 'mutedStandard' }
  : { customMapStyle: MUTED_STYLE };

const coord = (p) => ({ latitude: p.latitude, longitude: p.longitude });

/** Frame the stops (else the extras, else the area). */
function frame(map, { stops, extras, area, padding }) {
  if (!map) return;
  const pts = (stops.length ? stops : extras).map(coord);
  if (pts.length > 1) {
    map.fitToCoordinates(pts, { edgePadding: padding, animated: true });
  } else if (pts.length === 1) {
    map.animateToRegion({ ...pts[0], latitudeDelta: 0.025, longitudeDelta: 0.025 }, 300);
  } else if (area) {
    map.animateToRegion({ ...coord(area), latitudeDelta: 0.12, longitudeDelta: 0.12 }, 300);
  }
}

export function openDirections(stops) {
  if (!stops.length) return;
  const pt = (s) => `${s.latitude},${s.longitude}`;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const middle = stops.slice(1, -1).map(pt).join('|');
  const url = `https://www.google.com/maps/dir/?api=1&origin=${pt(first)}&destination=${pt(last)}`
    + `${middle ? `&waypoints=${encodeURIComponent(middle)}` : ''}&travelmode=walking`;
  Linking.openURL(url).catch(() => {});
}

function Pins({ stops, extras, onPressStop, onPressExtra, selectedId }) {
  return (
    <>
      {stops.length > 1 && (
        <Polyline
          coordinates={stops.map(coord)}
          strokeColor={COLORS.primaryLight}
          strokeWidth={3}
          lineDashPattern={[6, 6]}
        />
      )}
      {extras.map((x) => (
        <Marker
          key={`x-${x.id}`}
          coordinate={coord(x)}
          onPress={onPressExtra ? () => onPressExtra(x) : undefined}
          tracksViewChanges={false}
        >
          <View style={[styles.extraPin, selectedId === x.id && styles.extraPinOn]}>
            <Ionicons name="bookmark" size={10} color={selectedId === x.id ? COLORS.white : '#8a97a5'} />
          </View>
        </Marker>
      ))}
      {stops.map((s) => (
        <Marker
          key={s.id}
          coordinate={coord(s)}
          onPress={onPressStop ? () => onPressStop(s) : undefined}
          tracksViewChanges={false}
        >
          <View style={[styles.pin, { backgroundColor: s.color }, selectedId === s.id && styles.pinOn]}>
            <Text style={styles.pinText}>{s.n}</Text>
          </View>
        </Marker>
      ))}
    </>
  );
}

/**
 * Full-screen, pannable map behind the Itinerary's bottom sheet. Frames the
 * stops in the part of the screen the sheet leaves open (`bottomInset`).
 *
 * @param {number} topInset      space taken by the buttons at the top
 * @param {number} bottomInset   space covered by the sheet
 * @param {(stop) => void} [onPressStop]
 * @param {(extra) => void} [onPressExtra]
 * @param {string|null} [selectedId]
 */
export function DayMapBackground({ stops, extras = [], area, topInset, bottomInset, onPressStop, onPressExtra, selectedId }) {
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const signature = [...stops.map((s) => `${s.id}:${s.n}`), ...extras.map((x) => x.id), area?.latitude].join(',');

  // Re-frame when the stops change or the sheet moves.
  useEffect(() => {
    if (!ready) return;
    frame(mapRef.current, {
      stops,
      extras,
      area,
      padding: { top: topInset + 40, right: 50, bottom: bottomInset + 40, left: 50 },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature, bottomInset]);

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_DEFAULT}
      style={StyleSheet.absoluteFill}
      onMapReady={() => setReady(true)}
      showsUserLocation
      showsPointsOfInterest={false}
      showsCompass={false}
      toolbarEnabled={false}
      {...mapLook}
    >
      <Pins
        stops={stops}
        extras={extras}
        selectedId={selectedId}
        onPressStop={onPressStop}
        onPressExtra={onPressExtra}
      />
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  pinOn: {
    transform: [{ scale: 1.2 }],
  },
  pinText: {
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  extraPin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1.5,
    borderColor: '#b9c4cf',
  },
  extraPinOn: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.white,
    transform: [{ scale: 1.25 }],
  },
});
