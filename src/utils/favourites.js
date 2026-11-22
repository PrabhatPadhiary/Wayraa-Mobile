/**
 * Favourites helpers: a saved place's city, and favourites grouped into city
 * collections.
 *
 * The server stores each favourite's real city (from Google's address parts)
 * as `city`. Until it has one (just saved while Google was unreachable), the
 * city is guessed from the short `vicinity` ("street, area, city"): the last
 * part that isn't a postcode, number or country-like code. Places with no city
 * either way go to "Other places".
 */

const OTHER = 'Other places';

/** Strip postcodes and stray numbers: "Kyoto 605-0073" -> "Kyoto". */
function cleanPart(part) {
  return part
    .replace(/\b\d[\d\s\-−‐]*\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cityOf(vicinity) {
  if (!vicinity) return null;
  const parts = vicinity
    .split(',')
    .map(cleanPart)
    // Drop empty bits and 2-3 letter codes ("NY", "UK", "JP").
    .filter((p) => p && !/^[A-Z]{2,3}$/.test(p));
  return parts[parts.length - 1] || null;
}

/** A favourite's city: the stored one, else a guess from its address. */
export function favouriteCity(f) {
  return (f?.city && f.city.trim()) || cityOf(f?.vicinity);
}

/**
 * Group favourites by city: [{ key, city, items }], biggest first, with
 * "Other places" (unknown city) last.
 */
export function groupByCity(favourites) {
  const map = new Map();
  favourites.forEach((f) => {
    const city = favouriteCity(f) || OTHER;
    const key = city.toLowerCase();
    if (!map.has(key)) map.set(key, { key, city, items: [] });
    map.get(key).items.push(f);
  });
  return [...map.values()].sort((a, b) => {
    if (a.city === OTHER) return 1;
    if (b.city === OTHER) return -1;
    return b.items.length - a.items.length || a.city.localeCompare(b.city);
  });
}

/** Saved-place category -> icon. */
export function favouriteIcon(category) {
  const c = (category || '').toLowerCase();
  if (c.startsWith('stay') || c.startsWith('hotel')) return 'bed';
  if (c.startsWith('restaurant') || c === 'food') return 'restaurant';
  return 'walk';
}
