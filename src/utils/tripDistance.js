import { distanceKm } from './itinerary';

/**
 * How far (km) a place can be from every stop on a trip before "Add to trip"
 * asks whether it belongs there. Wide enough for day trips (Mysore from
 * Bengaluru, Pondicherry from Chennai), narrow enough to catch another city.
 */
export const FAR_FROM_TRIP_KM = 150;

/** A place's location as { latitude, longitude }, or null when unknown. */
export function placePoint(place) {
  const lat = place?.geometry?.latitude ?? place?.geometry?.location?.lat ?? place?.latitude;
  const lng = place?.geometry?.longitude ?? place?.geometry?.location?.lng ?? place?.longitude;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null;
}

/**
 * The stop closest to `point`, as { stop, km }, from stops that have
 * coordinates ({ latitude, longitude }). Null when nothing can be measured.
 */
export function nearestStop(stops, point) {
  if (!point) return null;
  let best = null;
  (stops || []).forEach((stop) => {
    const km = distanceKm(stop, point);
    if (km != null && (!best || km < best.km)) best = { stop, km };
  });
  return best;
}

/** "about 2,700 km": rounded to what's worth saying. */
export function formatFarKm(km) {
  const step = km < 1000 ? 10 : 100;
  const rounded = Math.round(km / step) * step;
  return `${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`;
}
