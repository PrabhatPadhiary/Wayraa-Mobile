/**
 * Favourites helpers: work out a city from a saved place's address and group
 * favourites into city collections.
 *
 * Favourites only store Google's short `vicinity` ("street, area, city"), so
 * the city is a best guess: the last part that isn't a postcode, number or
 * country-like code. Places whose city can't be read go to "Other places".
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

/**
 * Group favourites by city: [{ key, city, items }], biggest first, with
 * "Other places" (unknown city) last.
 */
export function groupByCity(favourites) {
  const map = new Map();
  favourites.forEach((f) => {
    const city = cityOf(f.vicinity) || OTHER;
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
