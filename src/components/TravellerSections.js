import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import PassportStamp from './PassportStamp';
import TravellerMap from './TravellerMap';
import { vibeLabel, vibeIcon, geocodePlaceName } from '../services';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';

/**
 * The parts of a traveller's profile built from their stories, shared by
 * the public profile (UserProfileScreen) and your own (ProfileScreen), so
 * both look the same:
 *
 *  - useStoryPlaces(stories)  places (with stamp icon, month, map point),
 *                             top vibes, and map points found by name
 *  - <TravelStyle vibes />    icon + label pairs
 *  - <WhereBeen ... />        passport stamps, then a small map
 *  - <StoryGrid ... />        two-column photo grid (like Favourites)
 *
 * Headings stay with each screen (they're styled differently there).
 */

const PAD = SIZES.spacing_base;
const GAP = SIZES.spacing_md;
const TILE_HEIGHTS = [230, 180, 205, 250, 170, 220];
const TOP_VIBES = 4;
// Names looked up on the phone for the map, at most (the rest go without).
const MAX_LOOKUPS = 15;

/** "Kyoto, Japan" -> "Kyoto" (grouping key and stamp text). */
export function placeOf(story) {
  return (story.destination || '').split(',')[0].trim();
}

/** "Mar 2026", from the trip's dates (else when it was posted). */
export function monthLabel(story) {
  const d = new Date(story.startDate || story.publishedAt || story.createdAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/**
 * From someone's stories (newest first): where they're from (most recent
 * month, the vibe they mostly tagged there, a map point if known), their top
 * vibes, and the places with map points, filling gaps by looking the name up
 * on the phone (free, remembered).
 */
export function useStoryPlaces(stories) {
  const places = useMemo(() => {
    const byPlace = new Map();
    (stories || []).forEach((s) => {
      const p = placeOf(s);
      if (!p) return;
      const key = p.toLowerCase();
      const entry = byPlace.get(key) || { key, label: p, place: s.destination || p, when: monthLabel(s), count: 0, vibes: new Map(), lat: null, lng: null };
      entry.count += 1;
      if (entry.lat == null && s.point) { entry.lat = s.point.lat; entry.lng = s.point.lng; }
      (s.vibes || []).forEach((v) => entry.vibes.set(v.toLowerCase(), (entry.vibes.get(v.toLowerCase()) || 0) + 1));
      byPlace.set(key, entry);
    });
    return [...byPlace.values()].map((e) => {
      const top = [...e.vibes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return { ...e, icon: top ? vibeIcon(top) : 'airplane-outline' };
    });
  }, [stories]);

  const vibes = useMemo(() => {
    const counts = new Map();
    (stories || []).forEach((s) => (s.vibes || []).forEach((v) => {
      const key = v.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_VIBES).map(([key]) => key);
  }, [stories]);

  const [found, setFound] = useState({});
  useEffect(() => {
    let cancelled = false;
    const missing = places.filter((p) => p.lat == null && !(p.key in found)).slice(0, MAX_LOOKUPS);
    if (!missing.length) return undefined;
    (async () => {
      for (const p of missing) {
        const point = await geocodePlaceName(p.place);
        if (cancelled) return;
        setFound((prev) => ({ ...prev, [p.key]: point }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);
  const mapPlaces = useMemo(
    () => places.map((p) => (p.lat != null ? p : { ...p, lat: found[p.key]?.lat ?? null, lng: found[p.key]?.lng ?? null })),
    [places, found]
  );

  return { places, vibes, mapPlaces };
}

/** Top vibes as icon + label pairs, left-aligned, wrapping. */
export function TravelStyle({ vibes }) {
  return (
    <View style={styles.styleRow}>
      {vibes.map((v) => (
        <View key={v} style={styles.styleItem}>
          <Ionicons name={vibeIcon(v)} size={20} color={COLORS.textPrimary} />
          <Text style={styles.styleLabel} numberOfLines={1}>{vibeLabel(v)}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Stamps (sideways) and a small map. Tapping a stamp or pin selects that
 * place (`onSelect(key)`, or null to clear); with one place it's just shown.
 * `bleed`: how far the stamps run past the parent's side padding.
 */
export function WhereBeen({ places, mapPlaces, activeKey, onSelect, bleed = PAD }) {
  const pick = places.length > 1 && onSelect
    ? (key) => onSelect(key === activeKey ? null : key)
    : undefined;
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -bleed }}
        contentContainerStyle={[styles.stamps, { paddingHorizontal: bleed }]}
      >
        {places.map((p, i) => (
          <PassportStamp
            key={p.key}
            city={p.label}
            place={p.place}
            when={p.when}
            icon={p.icon}
            index={i}
            selected={p.key === activeKey}
            onPress={pick ? () => pick(p.key) : undefined}
            accessibilityLabel={`${p.place}, ${p.count} ${p.count === 1 ? 'story' : 'stories'}${pick ? '. Show these stories' : ''}`}
          />
        ))}
      </ScrollView>
      <TravellerMap places={mapPlaces} activeKey={activeKey} onPressPlace={pick} />
    </>
  );
}

/** Split stories into two columns, always adding to the shorter one. */
function toMasonry(items) {
  const cols = [[], []];
  const heights = [0, 0];
  items.forEach((item, i) => {
    const h = TILE_HEIGHTS[i % TILE_HEIGHTS.length];
    const c = heights[0] <= heights[1] ? 0 : 1;
    cols[c].push({ item, height: h });
    heights[c] += h + GAP;
  });
  return cols;
}

/**
 * Stories as a two-column photo grid: cover, title, "Kyoto · Mar 2026", a
 * photo count when there are several. Tap opens, long-press for more.
 * `width`: the space it fills (default: screen width minus side padding).
 */
export function StoryGrid({ stories, onOpen, onLongPress, width }) {
  const [broken, setBroken] = useState({});
  const columns = useMemo(() => toMasonry(stories), [stories]);
  const columnWidth = ((width ?? Dimensions.get('window').width - PAD * 2) - GAP) / 2;

  const renderTile = ({ item, height }) => {
    const uri = cloudinarySized(item.photos?.[0]?.url, IMAGE_WIDTH.COVER);
    const showImage = uri && !broken[item.id];
    const photoCount = item.photos?.length || 0;
    const meta = [placeOf(item), monthLabel(item)].filter(Boolean).join(' · ');
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.tile, { height }]}
        onPress={() => onOpen?.(item)}
        onLongPress={onLongPress ? () => onLongPress(item) : undefined}
        delayLongPress={350}
        activeOpacity={0.92}
        accessibilityRole="button"
        accessibilityLabel={[item.title, meta].filter(Boolean).join(', ')}
        accessibilityHint={onLongPress ? 'Long press for more options' : undefined}
      >
        {showImage ? (
          <Image
            source={{ uri }}
            style={styles.fill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            onError={() => setBroken((prev) => ({ ...prev, [item.id]: true }))}
          />
        ) : (
          <View style={[styles.fill, styles.photoEmpty]}>
            <Ionicons name="book-outline" size={28} color={COLORS.textMuted} />
          </View>
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']}
          locations={[0, 0.35, 1]}
          style={styles.fill}
          pointerEvents="none"
        />
        <View style={styles.tileTop}>
          {photoCount > 1 ? (
            <View style={styles.badge}>
              <Ionicons name="images-outline" size={12} color={COLORS.white} />
              <Text style={styles.badgeText}>{photoCount}</Text>
            </View>
          ) : <View />}
        </View>
        <View style={styles.tileBottom}>
          <Text style={styles.tileName} numberOfLines={2}>{item.title}</Text>
          {!!meta && <Text style={styles.tileMeta} numberOfLines={1}>{meta}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.masonry}>
      {columns.map((col, i) => (
        <View key={i} style={[styles.masonryColumn, { width: columnWidth }]}>
          {col.map(renderTile)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // RN 0.88: spreading absoluteFillObject does nothing, so spelled out.
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  styleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: SIZES.spacing_lg,
    rowGap: SIZES.spacing_md,
  },
  styleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  styleLabel: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  stamps: {
    gap: SIZES.spacing_md,
  },
  masonry: {
    flexDirection: 'row',
    gap: GAP,
  },
  masonryColumn: {
    gap: GAP,
  },
  tile: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'space-between',
  },
  photoEmpty: {
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileTop: {
    flexDirection: 'row',
    padding: SIZES.spacing_sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    paddingHorizontal: SIZES.spacing_sm,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  badgeText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  tileBottom: {
    padding: SIZES.spacing_md,
  },
  tileName: {
    fontSize: SIZES.md,
    lineHeight: 19,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  tileMeta: {
    marginTop: 2,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.88)',
  },
});
