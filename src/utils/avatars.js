/**
 * Avatars drawn from a name: a solid colour that stays the same for a person,
 * and their initials. Used wherever someone has no photo.
 */

const AVATAR_COLORS = ['#D9481C', '#3F5A73', '#2D6A4C', '#4C7193', '#B53A16', '#415D77'];

/** The same colour for the same name, every time. */
export function avatarColorFor(name) {
  const text = name || '?';
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 997;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** "Prabhat Padhiary" → "PP", "Satish" → "S", "" → "?". */
export function initialsFor(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}
