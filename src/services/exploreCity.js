import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The city Home is exploring instead of where you are ("Exploring · Goa"),
 * chosen from the location sheet, and the last few cities picked there.
 * Kept on the phone. No city = Home uses your real location.
 *
 * City: { placeId, name, secondary, lat, lng }
 */
const CITY_KEY = 'wayraa_explore_city_v1';
const RECENT_KEY = 'wayraa_recent_cities_v1';
const MAX_RECENT = 4;

async function read(key, fallback) {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(key)) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  return AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}

/** The city being explored, or null for your real location. */
export async function getExploreCity() {
  const c = await read(CITY_KEY, null);
  return c && Number.isFinite(c.lat) && Number.isFinite(c.lng) ? c : null;
}

/** Explore this city (also remembered as recent), or null to go back to your location. */
export async function setExploreCity(city) {
  if (!city) {
    await AsyncStorage.removeItem(CITY_KEY).catch(() => {});
    return;
  }
  await write(CITY_KEY, city);
  const recent = (await read(RECENT_KEY, [])).filter((c) => c?.placeId !== city.placeId);
  await write(RECENT_KEY, [city, ...recent].slice(0, MAX_RECENT));
}

/** Cities picked before, newest first. */
export async function getRecentCities() {
  const list = await read(RECENT_KEY, []);
  return Array.isArray(list) ? list.filter((c) => c && Number.isFinite(c.lat)) : [];
}
