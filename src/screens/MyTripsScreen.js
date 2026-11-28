import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Easing,
  FlatList,
  RefreshControl,
  TextInput,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SIZES } from '../constants';
import useHideTabBarOnScroll from '../hooks/useHideTabBarOnScroll';
import { EmptyState, FilterChips, SignInPrompt, ScreenHeader, TripListSkeleton, EditTripSheet } from '../components';
import TripBoardingPass, { TEAR_FROM_RIGHT, PASS_TIP_SHAPE, placeName, placeCode, tripPhase } from '../components/TripBoardingPass';
import TripSortSheet, { SORT_OPTIONS } from '../components/TripSortSheet';
import FeaturedTripPass, { FEATURED_TIP_SHAPE } from '../components/FeaturedTripPass';
import TripWalletStack from '../components/TripWalletStack';
import { useTip } from '../components/Tips';
import { showPassPrint } from '../components/PassPrintOverlay';
import { ripTicket, RIP_FALL_AT } from '../components/TicketRipOverlay';
import DuplicateTripSheet from '../components/DuplicateTripSheet';
import { confirmDeleteTrip, tripRole } from '../utils/tripActions';
import { getMyTrips, peekMyTrips, getTripById, deleteTripInBackground, onMyTripsChanged, getStoredUser, AuthRequiredError } from '../services';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
import { sortTripsForList, dayCount } from '../utils/tripDates';
import useAuth from '../hooks/useAuth';
import { showAlert } from '../components/AppDialog';
import UnfinishedTripCard from '../components/UnfinishedTripCard';
import RefreshSpinner from '../components/RefreshSpinner';
import { useOnReconnect, useRetryHint } from '../hooks/useNetwork';

// Group-by and sort choices are remembered between visits.
const ARRANGE_KEY = 'myTrips.arrange.v1';

/**
 * The page's sections, top to bottom: trips under way, the ones coming up,
 * drafts without dates, and finished trips as Memories. `subgroups` sections
 * are split further by year or place.
 */
const SECTIONS = [
  { key: 'now', title: 'Happening now', icon: 'radio-button-on', color: '#3E8E63' },
  { key: 'upcoming', title: 'Upcoming', icon: 'airplane', color: COLORS.accent, subgroups: true },
  { key: 'draft', title: 'Drafts', note: 'Add dates to start planning', icon: 'create', color: COLORS.primaryLight },
  { key: 'past', title: 'Memories', note: "Where you've been", icon: 'images', color: '#8A6F4E', subgroups: true },
];

// Space kept under the list for the floating tab bar.
const BOTTOM_INSET = 120;

const time = (d) => {
  const n = d ? new Date(d).getTime() : NaN;
  return Number.isNaN(n) ? null : n;
};

/** Trips in the chosen order. */
function sortTrips(list, sort) {
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
  const created = (t) => time(t.createdAt) || 0;
  switch (sort) {
    case 'newest':
      // Undated drafts first (newest drafts on top), then latest start first.
      return [...list].sort((a, b) => {
        const sa = time(a.startDate);
        const sb = time(b.startDate);
        if (sa === null || sb === null) return (sa === null ? -1 : 0) - (sb === null ? -1 : 0) || created(b) - created(a);
        return sb - sa;
      });
    case 'oldest':
      return [...list].sort((a, b) => {
        const sa = time(a.startDate);
        const sb = time(b.startDate);
        if (sa === null || sb === null) return (sa === null ? 1 : 0) - (sb === null ? 1 : 0) || created(a) - created(b);
        return sa - sb;
      });
    case 'created':
      return [...list].sort((a, b) => created(b) - created(a));
    case 'name':
      return [...list].sort(byName);
    case 'upcoming':
    default:
      return sortTripsForList(list);
  }
}

/** Which group a trip falls in: its start year, or its main place. */
function groupOf(trip, group) {
  if (group === 'place') {
    const name = placeName(trip);
    return name ? { key: name.toLowerCase(), label: name, code: placeCode(name) } : { key: '~none', label: 'No place yet', code: null };
  }
  const start = trip.startDate ? new Date(trip.startDate) : null;
  if (!start || Number.isNaN(start.getTime())) return { key: '~none', label: 'No dates yet', code: null };
  const year = String(start.getUTCFullYear());
  return { key: year, label: year, code: year };
}

/**
 * Sorted trips split into groups. Groups come in the order their first trip
 * appears, so they follow the sort; for A–Z, years go newest first and
 * places alphabetically.
 */
function groupTrips(sorted, group, sort) {
  const map = new Map();
  sorted.forEach((entry) => {
    const g = groupOf(entry.trip, group);
    if (!map.has(g.key)) map.set(g.key, { ...g, items: [] });
    map.get(g.key).items.push(entry);
  });
  const groups = [...map.values()];
  if (sort === 'name') {
    groups.sort((a, b) => {
      if (a.key === '~none' || b.key === '~none') return a.key === '~none' ? 1 : -1;
      return group === 'year' ? b.key.localeCompare(a.key) : a.label.localeCompare(b.label);
    });
  }
  return groups;
}

/** Does a trip match the search (name, places, stops, people)? */
function matches(trip, q) {
  if (!q) return true;
  const hay = [
    trip.name,
    trip.primaryDestination,
    trip.description,
    ...(Array.isArray(trip.stops) ? trip.stops.map((s) => s?.name) : []),
    ...(Array.isArray(trip.members) ? trip.members.map((m) => m?.name) : []),
  ].filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

/**
 * Group heading in the style of an airport departures board: the year (or
 * place code) in split-flap tiles, then the name and how many trips.
 */
function DepartureHeader({ group }) {
  const count = group.items.length;
  const isPlace = group.code && group.code !== group.label;
  return (
    <View
      style={styles.board}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${group.label}, ${count} ${count === 1 ? 'trip' : 'trips'}`}
    >
      {group.code ? (
        <View style={styles.flaps}>
          {group.code.split('').map((ch, i) => (
            <View key={i} style={styles.flap}>
              <Text style={styles.flapText}>{ch}</Text>
              <View style={styles.flapSeam} />
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.flap, styles.flapIcon]}>
          <Ionicons name={group.key === '~none' && group.label.includes('dates') ? 'calendar-outline' : 'help'} size={14} color={COLORS.white} />
          <View style={styles.flapSeam} />
        </View>
      )}
      {(isPlace || !group.code) && <Text style={styles.boardLabel} numberOfLines={1}>{group.label}</Text>}
      <View style={styles.boardRule} />
      <Text style={styles.boardCount}>{count} {count === 1 ? 'trip' : 'trips'}</Text>
    </View>
  );
}

// The gap a ripping ticket leaves: holds while it tears, then closes.
const GAP_CLOSE_DELAY = RIP_FALL_AT + 120;
const GAP_CLOSE_MS = 380;

/**
 * The space a deleted trip leaves while its ticket rips (the ripping copy is
 * drawn over it): it holds still while the ticket tears, then closes as the
 * halves fall. Only this one row changes height. Purely visual: the delete
 * itself runs on its own timer (see confirmDelete), so a recycled row can't
 * stop it.
 */
function ClosingGap({ height }) {
  const h = useRef(new Animated.Value(height)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(GAP_CLOSE_DELAY),
      Animated.timing(h, { toValue: 0, duration: GAP_CLOSE_MS, easing: Easing.bezier(0.77, 0, 0.175, 1), useNativeDriver: false }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <Animated.View style={{ height: h }} />;
}

/** A section's title row: icon, title, count, and a short note. */
function SectionHeader({ section, first }) {
  return (
    <View
      style={[styles.section, !first && styles.sectionSpaced]}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${section.title}, ${section.count} ${section.count === 1 ? 'trip' : 'trips'}`}
    >
      <View style={[styles.sectionIcon, { backgroundColor: `${section.color}1F` }]}>
        <Ionicons name={section.icon} size={15} color={section.color} />
      </View>
      <View style={styles.sectionText}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        {!!section.note && <Text style={styles.sectionNote}>{section.note}</Text>}
      </View>
      <View style={styles.sectionCount}>
        <Text style={styles.sectionCountText}>{section.count}</Text>
      </View>
    </View>
  );
}

/** Totals over your past trips: trips, distinct places, days away. */
function memoryStats(items) {
  const places = new Set();
  let days = 0;
  items.forEach(({ trip }) => {
    const stops = Array.isArray(trip.stops) ? trip.stops.map((st) => st?.name) : [];
    (stops.length ? stops : [placeName(trip)]).forEach((n) => {
      const key = (n || '').split(',')[0].trim().toLowerCase();
      if (key) places.add(key);
    });
    days += dayCount(trip.startDate, trip.endDate) || 0;
  });
  return [
    { key: 'trips', value: items.length, label: items.length === 1 ? 'trip' : 'trips' },
    { key: 'places', value: places.size, label: places.size === 1 ? 'place' : 'places' },
    { key: 'days', value: days, label: days === 1 ? 'day away' : 'days away' },
  ];
}

/** A strip of totals under the Memories heading. */
function MemoryStats({ items }) {
  const stats = memoryStats(items);
  return (
    <View
      style={styles.stats}
      accessible
      accessibilityLabel={stats.map((st) => `${st.value} ${st.label}`).join(', ')}
    >
      {stats.map((st, i) => (
        <React.Fragment key={st.key}>
          {i > 0 && <View style={styles.statDivider} />}
          <View style={styles.stat}>
            <Text style={styles.statValue}>{st.value}</Text>
            <Text style={styles.statLabel}>{st.label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

/**
 * MyTripsScreen: the signed-in user's trips as boarding passes, grouped by
 * year or place, with search, a Mine / Joined switch, sort options, and
 * clear Join and New trip buttons in the header.
 */
export default function MyTripsScreen({ navigation }) {
  // The tab bar hides while you scroll down and comes back when you scroll up (like Home).
  const onBarScroll = useHideTabBarOnScroll();
  const retryHint = useRetryHint();
  const { isAuthenticated, isAuthReady } = useAuth();
  // Your trips as last loaded, at once; fresh ones load behind them.
  const [trips, setTrips] = useState(() => peekMyTrips() || []);
  const [loading, setLoading] = useState(() => !peekMyTrips());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  // Swipe actions: full trip being edited (the sheet needs its stops), the
  // card currently swiped open, and the signed-in user (for owner checks on
  // older backends that don't send myRole).
  const [editingTrip, setEditingTrip] = useState(null);
  // Trip being copied ("Use this plan again").
  const [duplicating, setDuplicating] = useState(null);
  const [myUserId, setMyUserId] = useState(null);
  useEffect(() => {
    getStoredUser().then((u) => setMyUserId(u?.id || null)).catch(() => {});
  }, []);

  // Finding and arranging.
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState('all'); // all | mine | joined
  const [group, setGroup] = useState('year'); // year | place
  const [sort, setSort] = useState('upcoming');
  const [arrangeOpen, setArrangeOpen] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(ARRANGE_KEY)
      .then((raw) => {
        const saved = raw ? JSON.parse(raw) : null;
        if (saved?.group === 'year' || saved?.group === 'place') setGroup(saved.group);
        if (SORT_OPTIONS.some((o) => o.key === saved?.sort)) setSort(saved.sort);
      })
      .catch(() => {});
  }, []);
  const saveArrange = (next) => {
    AsyncStorage.setItem(ARRANGE_KEY, JSON.stringify({ group, sort, ...next })).catch(() => {});
  };

  const [headerHeight, setHeaderHeight] = useState(0);
  // "Finish planning" card under the header: its height pushes the list down.
  const [draftHeight, setDraftHeight] = useState(0);
  const topInset = headerHeight + (draftHeight ? draftHeight + SIZES.spacing_md : 0);
  const listOpacity = useRef(new Animated.Value(1)).current;
  const listRef = useRef(null);

  // Apply a change with a quick cross-fade of the list, back at the top.
  const fadeTo = (apply) => {
    Animated.timing(listOpacity, { toValue: 0, duration: 110, useNativeDriver: true }).start(() => {
      apply();
      listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
      Animated.timing(listOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  };
  const changeSegment = (key) => { if (key !== segment) fadeTo(() => setSegment(key)); };
  const changeGroup = (key) => { if (key !== group) { saveArrange({ group: key }); fadeTo(() => setGroup(key)); } };
  const changeSort = (key) => { if (key !== sort) { saveArrange({ sort: key }); fadeTo(() => setSort(key)); } };

  // Each trip with whether it's yours, and who hosts it when it isn't.
  const entries = useMemo(() => trips.map((trip) => {
    const isOwner = tripRole(trip, myUserId) === 'owner';
    const host = !isOwner && Array.isArray(trip.members)
      ? trip.members.find((m) => m.userId !== myUserId)?.name || null
      : null;
    return { trip, isOwner, host };
  }), [trips, myUserId]);
  const mineCount = entries.filter((e) => e.isOwner).length;
  const joinedCount = entries.length - mineCount;

  const q = query.trim().toLowerCase();
  // Trips split by where they stand (see SECTIONS), each sorted, and
  // Upcoming / Memories further split by year or place.
  const arranged = useMemo(() => {
    const inSegment = entries.filter((e) => (segment === 'mine' ? e.isOwner : segment === 'joined' ? !e.isOwner : true));
    const found = inSegment.filter((e) => matches(e.trip, q));
    const byTrip = new Map(found.map((e) => [e.trip, e]));
    // Featured at the top (not while searching): every trip you're on, in a
    // wallet stack when there's more than one; else the next trip. They're
    // left out of their section below.
    const inPhase = (phase) => sortTripsForList(found.filter((e) => tripPhase(e.trip) === phase).map((e) => e.trip));
    const live = inPhase('now');
    const featuredTrips = q ? [] : live.length ? live : inPhase('upcoming').slice(0, 1);
    const isFeatured = new Set(featuredTrips);
    const list = SECTIONS.map((sec) => {
      const order = sortTrips(found.filter((e) => !isFeatured.has(e.trip) && tripPhase(e.trip) === sec.key).map((e) => e.trip), sort)
        .map((t) => byTrip.get(t));
      const groups = sec.subgroups ? groupTrips(order, group, sort) : [{ key: 'all', items: order }];
      // Sub-headings only help when there's more than one, or for places.
      const showGroups = sec.subgroups && (groups.length > 1 || group === 'place');
      return { ...sec, count: order.length, items: order, groups, showGroups };
    }).filter((sec) => sec.count > 0);
    return { featured: featuredTrips.map((t) => byTrip.get(t)), sections: list };
  }, [entries, segment, q, sort, group]);
  const { featured, sections } = arranged;
  // One-time tip: hold a ticket for its menu, the spotlight in the ticket's
  // own shape. On the stack's front card when there's a stack (only after
  // the stack's swipe nudge has played and finished, so they never overlap);
  // else on the first ticket in the list; else on the one featured card.
  const holdTipRef = useRef(null);
  const firstCardIsWallet = featured.length > 1;
  const holdTipOn = firstCardIsWallet ? 'wallet' : sections.length > 0 ? 'list' : 'featured';
  useTip('mytrips_hold', holdTipRef, {
    shape: holdTipOn === 'list' ? PASS_TIP_SHAPE : FEATURED_TIP_SHAPE,
    title: 'Hold a ticket for more',
    text: 'Press and hold any trip to reuse its plan, or to edit or delete a trip you made.',
    enabled: !loading && !q && (featured.length > 0 || sections.length > 0),
    after: firstCardIsWallet ? 'trip_wallet_swipe' : undefined,
    // The nudge starts ~0.7s in and takes ~1.1s.
    delay: firstCardIsWallet ? 2600 : 1200,
  });
  const shownCount = sections.reduce((n, sec) => n + sec.count, 0) + featured.length;
  const rows = [
    ...(featured.length > 1
      ? [{ type: 'wallet', id: 'wallet', entries: featured }]
      : featured.map((e) => ({ type: 'featured', id: `f-${e.trip.id}`, entry: e }))),
    ...sections.flatMap((sec, i) => [
    { type: 'section', id: `s-${sec.key}`, section: sec, first: i === 0 },
    ...(sec.key === 'past' ? [{ type: 'stats', id: 'memory-stats', items: sec.items }] : []),
    ...sec.groups.flatMap((g) => [
      ...(sec.showGroups ? [{ type: 'header', id: `h-${sec.key}-${g.key}`, group: g }] : []),
      ...g.items.map((e) => ({ type: 'trip', id: String(e.trip.id), entry: e })),
    ]),
    ]),
  ];
  // The row the hold tip points at (see holdTipOn).
  const holdTipRowId = rows.find((r) => r.type === (holdTipOn === 'list' ? 'trip' : holdTipOn))?.id;

  const loadTrips = useCallback(async () => {
    setError(false);
    setNeedsAuth(false);
    try {
      const data = await getMyTrips();
      setTrips(data);
    } catch (e) {
      if (e instanceof AuthRequiredError) {
        setNeedsAuth(true);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  // Back online: reload what may have failed.
  useOnReconnect(loadTrips);

  // Reload whenever the tab regains focus (it stays mounted in the tab navigator).
  useFocusEffect(
    useCallback(() => {
      // Wait until Firebase has restored persisted auth before deciding.
      if (!isAuthReady) return;
      if (!isAuthenticated) {
        setNeedsAuth(true);
        setLoading(false);
        return;
      }
      loadTrips();
    }, [loadTrips, isAuthReady, isAuthenticated])
  );

  // Owner actions (swipe left, long press, or screen reader actions).
  const editTrip = async (item) => {
    try {
      setEditingTrip(await getTripById(item.id));
    } catch (e) {
      showAlert('Could not open trip', e?.message || 'Please try again.');
    }
  };

  // Deleting is instant: the pass goes now, the server catches up in the
  // background (and if it fails, the trip comes back with a note).
  const passRefs = useRef({});
  const removeTrip = (item) => confirmDelete(item);
  // Trips whose ticket is ripping: their row is an empty space (the ripping
  // copy is drawn over it) that closes once the halves start to fall.
  const [ripping, setRipping] = useState({}); // id -> row height
  const finishDelete = (item) => {
    setRipping((cur) => {
      const next = { ...cur };
      delete next[item.id];
      return next;
    });
    const left = (peekMyTrips() || trips).filter((t) => t.id !== item.id);
    setTrips((cur) => cur.filter((t) => t.id !== item.id));
    deleteTripInBackground(item.id).catch((e) => {
      showAlert(`Could not delete "${item.name}"`, e?.message || 'It\'s back in your trips. Please try again.');
    });
    // That was the only trip: back to Home.
    if (left.length === 0) navigation.getParent()?.navigate('Explore');
  };
  const confirmDelete = (item) => confirmDeleteTrip(item.name, () => {
    // Rip its ticket in half: a copy takes the pass's place on screen and
    // tears; the row's space closes as the halves fall, then it's deleted.
    const entry = entries.find((e) => e.trip.id === item.id);
    const view = passRefs.current[item.id];
    if (!view?.measureInWindow) { finishDelete(item); return; }
    view.measureInWindow((x, y, width, height) => {
      if (!width) { finishDelete(item); return; }
      ripTicket({
        rect: { x, y, width, height },
        splitFromRight: TEAR_FROM_RIGHT,
        content: (
          <TripBoardingPass
            trip={item}
            imageUri={coverFor(item, 300)}
            isOwner={entry?.isOwner ?? true}
            hostName={entry?.host}
            showYear={group !== 'year'}
          />
        ),
      });
      setRipping((cur) => ({ ...cur, [item.id]: height }));
      setTimeout(() => finishDelete(item), GAP_CLOSE_DELAY + GAP_CLOSE_MS + 20);
    });
  });
  // The list changed elsewhere (deleted from the trip page, or put back).
  useEffect(() => onMyTripsChanged(() => {
    const cached = peekMyTrips();
    if (Array.isArray(cached)) setTrips(cached);
  }), []);

  const onRefresh = () => {
    setRefreshing(true);
    loadTrips();
  };

  // Cover comes straight from the destination's place id (the backend keeps
  // it fresh). Falls back to the first saved place, then the stored cover.
  const coverFor = (trip, width) => {
    const coverPlaceId = trip.primaryPlaceId || (Array.isArray(trip.placeIds) ? trip.placeIds[0] : null);
    return placePhotoUrl(coverPlaceId, width) || normalizePhotoUrl(trip.coverPhotoUrl, width);
  };
  const openTrip = (trip, initialTab) => navigation.navigate('TripDetail', {
    tripId: trip.id,
    tripName: trip.name,
    ...(initialTab ? { initialTab } : {}),
  });

  // Long press: copy the plan (anyone on the trip), and edit / delete for owners.
  const showPassMenu = (trip, isOwner) => showAlert(trip.name, undefined, [
    { text: 'Use this plan again', icon: 'copy-outline', onPress: () => setDuplicating(trip) },
    ...(isOwner ? [
      { text: 'Edit trip', onPress: () => editTrip(trip) },
      { text: 'Delete trip', style: 'destructive', onPress: () => removeTrip(trip) },
    ] : []),
    { text: 'Cancel', style: 'cancel' },
  ], { sheet: true });

  const renderPass = ({ trip, isOwner, host }) => {
    const coverUri = coverFor(trip, 300);
    return (
      // Edit, delete and copy live in the long-press menu (no swipe).
        <TripBoardingPass
          trip={trip}
          imageUri={coverUri}
          isOwner={isOwner}
          hostName={host}
          showYear={group !== 'year'}
          onPress={() => openTrip(trip)}
          onLongPress={() => showPassMenu(trip, isOwner)}
          accessibilityActions={[
            { name: 'duplicate', label: 'Use this plan again' },
            ...(isOwner ? [{ name: 'edit', label: 'Edit trip' }, { name: 'delete', label: 'Delete trip' }] : []),
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'duplicate') setDuplicating(trip);
            if (e.nativeEvent.actionName === 'edit') editTrip(trip);
            if (e.nativeEvent.actionName === 'delete') removeTrip(trip);
          }}
        />
    );
  };

  const refreshControlProps = {
    refreshing,
    onRefresh,
    tintColor: COLORS.accent,
    colors: [COLORS.accent],
    // Below the header and the unfinished-trip card, when there is one.
    progressViewOffset: topInset,
  };

  const goCreate = () => navigation.navigate('CreateTrip');
  const goJoin = () => navigation.navigate('JoinTrip');

  const renderEmpty = () => {
    if (loading) return null;
    if (error) {
      return (
        <View style={styles.stateContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>Couldn't load your trips</Text>
          <Text style={styles.stateSubtitle}>{retryHint}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadTrips}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (trips.length === 0) {
      return (
        <EmptyState
          style={styles.stateContainer}
          icon="map-outline"
          title="No trips yet"
          text="Pick a destination and your dates. Then plan each day, track the budget and share a packing list."
          actionLabel="Plan a trip"
          onAction={goCreate}
          secondaryLabel="Have an invite? Join a trip"
          onSecondary={goJoin}
        />
      );
    }
    if (q) {
      return (
        <EmptyState
          compact
          style={styles.stateContainer}
          icon="search-outline"
          title={`No trips match “${query.trim()}”`}
          text="Try a trip name, a place on the route or someone who's going."
          actionLabel="Clear search"
          onAction={() => setQuery('')}
        />
      );
    }
    if (segment === 'joined') {
      return (
        <EmptyState
          compact
          style={styles.stateContainer}
          icon="people-outline"
          title="No joined trips yet"
          text="When a friend invites you to their trip, it shows up here."
          actionLabel="Join with an invite"
          onAction={goJoin}
        />
      );
    }
    return (
      <EmptyState
        compact
        style={styles.stateContainer}
        icon="airplane-outline"
        title="You haven't planned a trip yet"
        text="Trips you create show up here. The ones you joined are under Joined."
        actionLabel="Plan a trip"
        onAction={goCreate}
      />
    );
  };

  // Guest: show the sign-in gate instead of an empty list + header.
  if (needsAuth) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <SignInPrompt
          icon="map-outline"
          title="Plan trips together"
          subtitle="Build a day-by-day itinerary, split expenses and share a packing checklist, with friends or on your own."
          buttonLabel="Sign in or create account"
          note="Free. Your trips stay in sync on all your devices."
          onSignIn={() => navigation.navigate('Welcome')}
        />
      </SafeAreaView>
    );
  }

  const segments = [
    { key: 'all', label: `All ${trips.length}` },
    { key: 'mine', label: `Mine ${mineCount}` },
    { key: 'joined', label: `Joined ${joinedCount}` },
  ];
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label;

  return (
    // No top safe-area padding here: the floating header already clears the
    // status bar / notch itself, and content is offset by its measured height.
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* A trip you started creating but didn't finish. */}
      {headerHeight > 0 && (
        <View style={[styles.unfinishedWrap, { top: headerHeight + SIZES.spacing_sm }]} pointerEvents="box-none">
          <UnfinishedTripCard navigation={navigation} onHeight={setDraftHeight} />
        </View>
      )}

      {loading ? (
        <View style={{ paddingTop: topInset + SIZES.spacing_lg }}>
          <TripListSkeleton />
        </View>
      ) : (
        <Animated.View style={[styles.listWrap, { opacity: listOpacity }]}>
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => {
              const tipRef = item.id === holdTipRowId ? holdTipRef : undefined;
              if (item.type === 'featured') {
                return (
                  <FeaturedTripPass
                    cardRef={tipRef}
                    trip={item.entry.trip}
                    imageUri={coverFor(item.entry.trip, 800)}
                    onOpen={(tab) => openTrip(item.entry.trip, tab)}
                    onLongPress={() => showPassMenu(item.entry.trip, item.entry.isOwner)}
                  />
                );
              }
              if (item.type === 'wallet') {
                return (
                  <TripWalletStack
                    items={item.entries.map((e) => ({ key: String(e.trip.id), label: e.trip.name, entry: e }))}
                    renderItem={({ entry }, { isFront }) => (
                      <FeaturedTripPass
                        cardRef={isFront ? tipRef : undefined}
                        style={styles.walletCard}
                        trip={entry.trip}
                        imageUri={coverFor(entry.trip, 800)}
                        onOpen={(tab) => openTrip(entry.trip, tab)}
                        onLongPress={() => showPassMenu(entry.trip, entry.isOwner)}
                      />
                    )}
                  />
                );
              }
              if (item.type === 'section') return <SectionHeader section={item.section} first={item.first} />;
              if (item.type === 'stats') return <MemoryStats items={item.items} />;
              if (item.type === 'header') return <DepartureHeader group={item.group} />;
              const rippingH = ripping[item.entry.trip.id];
              if (rippingH != null) {
                return <ClosingGap height={rippingH + SIZES.spacing_md} />;
              }
              return (
                <View
                  style={styles.passGap}
                  ref={(r) => {
                    passRefs.current[item.entry.trip.id] = r;
                    if (tipRef) tipRef.current = r;
                  }}
                  collapsable={false}
                >
                  {renderPass(item.entry)}
                </View>
              );
            }}
            ListEmptyComponent={<View style={styles.emptyWrap}>{renderEmpty()}</View>}
            ListFooterComponent={shownCount > 0 && q ? (
              <Text style={styles.footer}>{shownCount} {shownCount === 1 ? 'trip' : 'trips'} found</Text>
            ) : null}
            contentContainerStyle={[styles.listContent, { paddingTop: topInset + SIZES.spacing_lg }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={onBarScroll}
            scrollEventThrottle={16}
            refreshControl={<RefreshControl {...refreshControlProps} />}
          />
        </Animated.View>
      )}

      {/* iPhone: the refresh spinner, below the header and the unfinished-trip card. */}
      <RefreshSpinner refreshing={refreshing} top={topInset} />
      <ScreenHeader
        title="My trips"
        collapsed={false}
        left={loading ? null : (
          <TouchableOpacity
            style={styles.joinButton}
            activeOpacity={0.8}
            onPress={goJoin}
            accessibilityRole="button"
            accessibilityLabel="Join a trip with an invite link or code"
            hitSlop={4}
          >
            <Text style={styles.joinText}>Join</Text>
          </TouchableOpacity>
        )}
        right={loading ? null : (
          <TouchableOpacity
            style={styles.newButton}
            activeOpacity={0.85}
            onPress={goCreate}
            accessibilityRole="button"
            accessibilityLabel="Plan a new trip"
            hitSlop={4}
          >
            <Ionicons name="add" size={19} color={COLORS.white} />
            <Text style={styles.newText}>New</Text>
          </TouchableOpacity>
        )}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        {!loading && trips.length > 0 && (
          <View style={styles.controls}>
            <View style={styles.searchRow}>
              <View style={styles.search}>
                <Ionicons name="search" size={17} color={COLORS.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search trips, places or people"
                  placeholderTextColor={COLORS.textLight}
                  returnKeyType="search"
                  autoCorrect={false}
                  autoCapitalize="none"
                  clearButtonMode="never"
                  accessibilityLabel="Search your trips"
                />
                {!!query && (
                  <TouchableOpacity
                    onPress={() => { setQuery(''); Keyboard.dismiss(); }}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                  >
                    <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={styles.arrangeButton}
                activeOpacity={0.8}
                onPress={() => { Keyboard.dismiss(); setArrangeOpen(true); }}
                accessibilityRole="button"
                accessibilityLabel={`Group and sort. Grouped by ${group}, ${sortLabel}`}
              >
                <Ionicons name="swap-vertical" size={18} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            <FilterChips
              filters={segments}
              activeKey={segment}
              onChange={changeSegment}
              variant="pills"
              fullWidth
              tinted={false}
            />
          </View>
        )}
      </ScreenHeader>

      <TripSortSheet
        visible={arrangeOpen}
        group={group}
        sort={sort}
        onChangeGroup={changeGroup}
        onChangeSort={changeSort}
        onClose={() => setArrangeOpen(false)}
      />
      <DuplicateTripSheet
        visible={!!duplicating}
        trip={duplicating}
        onClose={() => setDuplicating(null)}
        onDone={(created) => {
          const source = duplicating;
          setDuplicating(null);
          loadTrips();
          if (!created?.id) return;
          // The copy's boarding pass prints, then the new trip opens under it.
          // The copy's ticket, as its page will show it.
          showPassPrint({
            trip: { id: created.id, name: created.name },
            ticket: {
              trip: { startDate: created.startDate, endDate: created.endDate, status: created.status },
              places: source?.stops?.length ? source.stops.map((st) => st.name) : [source?.primaryDestination],
              stops: Math.max(1, source?.stops?.length || 0),
              spots: source?.placeIds?.length || 0,
              members: [],
              memberCount: 1,
            },
          });
          // Opens under the print; the pass lands on its first card.
          navigation.navigate('TripDetail', { tripId: created.id, tripName: created.name, printLanding: true });
        }}
      />
      <EditTripSheet
        visible={!!editingTrip}
        trip={editingTrip}
        onClose={() => setEditingTrip(null)}
        onSaved={() => { setEditingTrip(null); loadTrips(); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm,
  },
  unfinishedWrap: {
    position: 'absolute',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
    zIndex: 2,
  },
  listWrap: { flex: 1 },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: SIZES.spacing_base,
    paddingBottom: BOTTOM_INSET,
  },
  walletCard: { marginBottom: 0 },
  passGap: {
    marginBottom: SIZES.spacing_md,
  },
  emptyWrap: { flex: 1 },
  footer: {
    textAlign: 'center',
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
    marginTop: SIZES.spacing_sm,
  },

  // Header buttons: Join (quiet) on the left, New (orange) on the right.
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    backgroundColor: COLORS.sand,
  },
  joinText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 38,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 19,
    backgroundColor: COLORS.accent,
  },
  newText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },

  // Search, arrange and Mine / Joined under the title.
  controls: {
    paddingHorizontal: SIZES.spacing_lg,
    gap: SIZES.spacing_md,
  },
  searchRow: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: COLORS.backgroundWarm,
  },
  searchInput: {
    flex: 1,
    height: 44,
    paddingVertical: 0,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  arrangeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.backgroundWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section title row.
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md - 2,
    paddingTop: SIZES.spacing_sm,
    paddingBottom: SIZES.spacing_md,
    paddingHorizontal: 2,
  },
  sectionSpaced: {
    marginTop: SIZES.spacing_lg,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionText: { flex: 1 },
  sectionTitle: {
    fontSize: SIZES.lg + 1,
    lineHeight: 24,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    includeFontPadding: false,
  },
  sectionNote: {
    fontSize: SIZES.sm,
    lineHeight: 16,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    includeFontPadding: false,
  },
  sectionCount: {
    minWidth: 26,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCountText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },

  // Totals under Memories.
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.spacing_md,
    paddingVertical: SIZES.spacing_md,
    borderRadius: 18,
    backgroundColor: COLORS.white,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: SIZES.xl,
    lineHeight: 28,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
    includeFontPadding: false,
  },
  statLabel: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.borderLight,
  },

  // Departures-board group heading (inside Upcoming / Memories).
  board: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingTop: SIZES.spacing_xs,
    paddingBottom: SIZES.spacing_md,
    paddingHorizontal: 2,
  },
  flaps: {
    flexDirection: 'row',
    gap: 3,
  },
  flap: {
    width: 22,
    height: 30,
    borderRadius: 5,
    backgroundColor: COLORS.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  flapIcon: { width: 30 },
  flapText: {
    fontSize: 17,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
    includeFontPadding: false,
  },
  // The split across the middle of each tile.
  flapSeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 14.5,
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  boardLabel: {
    flexShrink: 1,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  boardRule: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  boardCount: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },

  // State (empty / error)
  stateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SIZES.spacing_xl,
  },
  stateTitle: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    marginTop: SIZES.spacing_base,
  },
  stateSubtitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SIZES.spacing_xs,
  },
  retryButton: {
    marginTop: SIZES.spacing_lg,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SIZES.spacing_xl,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
  },
  retryText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
