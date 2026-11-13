/**
 * The neighbourhood part of a Google address, short enough for one line:
 *   "Burj Khalifa - Downtown Dubai - Dubai - United Arab Emirates" → "Downtown Dubai"
 *   "1-2-3 Jingumae, Shibuya City, Tokyo"                          → "Shibuya City"
 *
 * Addresses are split on commas and on spaced dashes, which is how Google writes
 * them in the UAE and much of the Middle East. Everything from the city onwards
 * (city, region, country) is dropped, as are street numbers and postcodes, and
 * the part closest to the city wins. Without a city, a trailing part is taken to
 * be the country when there are three or more.
 *
 * @param {string} address  Google `vicinity` or formatted address
 * @param {string} [cityName] the trip stop's name, e.g. "Dubai" or "Tokyo, Japan"
 * @returns {string|null}
 */
export function areaFromAddress(address, cityName) {
  if (!address) return null;
  const parts = String(address)
    .split(/,|\s[-–—]\s/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;

  const city = (cityName || '').split(',')[0].trim().toLowerCase();
  // "Tokyo 150-0002" counts as the city too.
  const isCity = (p) => !!city && p.replace(/[\d\s\-−‐]+$/, '').trim().toLowerCase() === city;
  const cityAt = parts.findIndex(isCity);

  let kept;
  if (cityAt > 0) kept = parts.slice(0, cityAt);
  else if (cityAt === 0) kept = parts.slice(1).filter((p) => !isCity(p));
  else kept = parts.length >= 3 ? parts.slice(0, -1) : parts;

  // Skip street numbers and postcodes such as "570-8" or "1-2-3".
  const useful = kept.filter((p) => !/^[\d\s\-−‐,.#/]+$/.test(p) && (p.match(/\d/g) || []).length < 3);
  return useful[useful.length - 1] || kept[kept.length - 1] || parts[0] || null;
}

/**
 * "2.5 km from centre" / "350 m from Dubai centre": straight-line distance from
 * a city's centre (the point Google gives for the city). Null without a distance.
 *
 * @param {number|null} km
 * @param {string} [cityName] shown as "from Dubai centre" when given
 */
export function formatCentreDistance(km, cityName) {
  if (km == null || !Number.isFinite(km)) return null;
  const amount = km < 1
    ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`
    : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  const city = (cityName || '').split(',')[0].trim();
  return `${amount} from ${city ? `${city} ` : ''}centre`;
}

/**
 * The `city` route param for PlaceDetail ({ name, lat, lng }), so it can show
 * how far the place is from the city centre. Null without usable coordinates.
 */
export function cityCentre(name, lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) ? { name: name || null, lat, lng } : null;
}
