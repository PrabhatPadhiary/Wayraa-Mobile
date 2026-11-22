/**
 * Traveller ranks: what each rank looks like and says, and your progress.
 *
 * The rules (points, what each rank needs) come from the server with your
 * profile (GET /api/users/me → rank: { level, name, points, counts, ladder,
 * earn }); see TravellerRanks.cs. The ladder below is only a fallback for an
 * older server, and must match it.
 */

/** Look and words for each rank, by level (0 = Wanderer). */
export const RANK_LOOKS = [
  {
    name: 'Wanderer',
    shape: 'circle', icon: 'trail',
    // light → mid → dark → darkest
    palette: ['#E3EBF1', '#8FA4B6', '#4B6378', '#2B3F51'],
    glow: '#C9D6E2',
    tag: 'Where everyone starts. Save a place, plan a first trip.',
    cheer: 'Every journey starts somewhere.',
  },
  {
    name: 'Explorer',
    shape: 'coin', icon: 'compass',
    palette: ['#FFE0C2', '#D58B52', '#8F4E22', '#5A2E10'],
    glow: '#FFC9A0',
    tag: 'You plan trips and keep coming back for more.',
    cheer: 'Trips planned and already thinking about the next. Keep going.',
  },
  {
    name: 'Pathfinder',
    shape: 'hex', icon: 'peak',
    palette: ['#C8F5DC', '#3DB37A', '#16734A', '#0B4229'],
    glow: '#A8F0C8',
    tag: 'You go places and start sharing what you found.',
    cheer: 'You went, you saw, you shared. The trail is yours.',
  },
  {
    name: 'Voyager',
    shape: 'shield', icon: 'sail',
    palette: ['#D4E7FF', '#3F82E0', '#1D4E9E', '#0F2C5E'],
    glow: '#9CC8FF',
    tag: 'A real traveller, with stories other people read.',
    cheer: 'Stories shared, cities seen. The open sea is yours.',
  },
  {
    name: 'Globetrotter',
    shape: 'rosette', icon: 'globe',
    palette: ['#EEDDFF', '#9A5FE6', '#5B2BA6', '#341460'],
    glow: '#D9B8FF',
    tag: 'Cities on every map. People plan trips from your stories.',
    cheer: 'Cities on every map. People plan trips from your stories.',
  },
  {
    name: 'Legend',
    shape: 'star', icon: 'crown',
    palette: ['#FFF3C4', '#F0B840', '#A86E10', '#5E3A04'],
    glow: '#FFE08A',
    tag: 'The few who have seen it all, and shared it all.',
    cheer: 'Few travellers ever get here. Welcome to the top.',
  },
];

/** A greyed-out badge (a rank you haven't reached). */
export const LOCKED_PALETTE = ['#EEF1F4', '#C3CCD4', '#9AA6B1', '#7D8994'];

const FALLBACK_LADDER = [
  { name: 'Wanderer', points: 0, stories: 0, cities: 0, tripsTaken: 0 },
  { name: 'Explorer', points: 100, stories: 0, cities: 0, tripsTaken: 0 },
  { name: 'Pathfinder', points: 300, stories: 1, cities: 0, tripsTaken: 0 },
  { name: 'Voyager', points: 750, stories: 3, cities: 5, tripsTaken: 0 },
  { name: 'Globetrotter', points: 1500, stories: 8, cities: 12, tripsTaken: 5 },
  { name: 'Legend', points: 3000, stories: 15, cities: 25, tripsTaken: 10 },
];

const FALLBACK_EARN = {
  story: 50, tripTaken: 30, tripPlanned: 20, city: 10, like: 2, likeCap: 500, place: 1, placeCap: 100,
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Your rank from the profile, ready to show.
 * @returns {{ level, look, points, counts, ladder, earn, next, nextLook, checks, percent } | null}
 *   checks: what the next rank still needs, [{ key, label, done }]
 *   percent: 0–1, points toward the next rank (1 at the top)
 */
export function rankFromProfile(profile) {
  const r = profile?.rank;
  if (!r) return null;
  const ladder = Array.isArray(r.ladder) && r.ladder.length ? r.ladder : FALLBACK_LADDER;
  const level = Math.max(0, Math.min(r.level ?? 0, ladder.length - 1, RANK_LOOKS.length - 1));
  const counts = r.counts || {};
  const points = r.points || 0;
  const next = ladder[level + 1] || null;

  const checks = [];
  if (next) {
    const left = next.points - points;
    checks.push({
      key: 'points',
      label: left > 0 ? `${left.toLocaleString('en')} more points` : `${next.points.toLocaleString('en')} points`,
      done: left <= 0,
    });
    const need = (key, have, want, one, many, verb) => {
      if (!want) return;
      checks.push({
        key,
        label: `${verb} ${plural(want, one, many)} · ${Math.min(have, want)} of ${want}`,
        done: have >= want,
      });
    };
    need('stories', counts.stories || 0, next.stories, 'story', 'stories', 'Share');
    // Only cities on trips you've taken count (not ones you've just planned).
    need('cities', counts.cities || 0, next.cities, 'city', 'cities', 'Take trips to');
    need('trips', counts.tripsTaken || 0, next.tripsTaken, 'trip', 'trips', 'Take');
  }

  // Matches the "321 / 750" beside the bar: all your points toward the next rank.
  const percent = next ? Math.max(0, Math.min(1, points / next.points)) : 1;

  return {
    level,
    look: RANK_LOOKS[level],
    points,
    counts,
    ladder,
    earn: { ...FALLBACK_EARN, ...(r.earn || {}) },
    next,
    nextLook: next ? RANK_LOOKS[level + 1] : null,
    checks,
    percent,
  };
}

/** What a rank needs, as short phrases: ["750 points", "3 stories", "5 cities"]. */
export function rankNeeds(step) {
  if (!step) return [];
  const out = [step.points ? `${step.points.toLocaleString('en')} points` : 'Where you start'];
  if (step.stories) out.push(plural(step.stories, 'story', 'stories'));
  if (step.cities) out.push(plural(step.cities, 'city', 'cities'));
  if (step.tripsTaken) out.push(`${plural(step.tripsTaken, 'trip', 'trips')} taken`);
  return out;
}

/** "a Voyager", "an Explorer". */
export function withArticle(name) {
  return `${/^[AEIOU]/i.test(name) ? 'an' : 'a'} ${name}`;
}
