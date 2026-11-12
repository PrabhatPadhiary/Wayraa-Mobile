/**
 * A Cloudinary image at a display size: Cloudinary resizes it on the fly
 * (no wider than `width`, auto quality, WebP/AVIF where the phone supports
 * it), so a story cover is ~100 KB instead of a multi-MB original. Other
 * URLs (and ones already transformed) come back unchanged.
 *
 * Use the same width for the same kind of image everywhere, so a photo the
 * home page cached is reused by the next screen:
 *  - COVER (cards), PHOTO (a story's photos), FULL (full screen), AVATAR
 */
export const IMAGE_WIDTH = { AVATAR: 120, COVER: 800, PHOTO: 1200, FULL: 1600 };

export function cloudinarySized(url, width) {
  if (!url || typeof url !== 'string') return url;
  const marker = '/image/upload/';
  const at = url.indexOf(marker);
  if (at < 0 || !url.includes('res.cloudinary.com')) return url;
  const rest = url.slice(at + marker.length);
  // Already has a transformation (e.g. "w_800,c_limit/..."): leave it.
  if (/^[a-z]{1,3}_[^/]*\//.test(rest)) return url;
  return `${url.slice(0, at + marker.length)}w_${width},c_limit,q_auto,f_auto/${rest}`;
}
