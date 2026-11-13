import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  TextInput,
  Platform,
  LayoutAnimation,
  Dimensions,
  useWindowDimensions,
  Linking,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ratingText } from './RatingRow';
import { COLORS, SIZES } from '../constants';
import {
  getItinerary,
  createItineraryItem,
  updateItineraryItem,
  deleteItineraryItem,
  deleteItineraryOutsideRange,
  arrangeItinerary,
  AuthRequiredError,
} from '../services';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
import {
  ITINERARY_CATEGORIES,
  ITINERARY_CATEGORY,
  DAY_SLOTS,
  tripDays,
  isoToDay,
  dayToIso,
  todayDay,
  dayLabel,
  weekdayOf,
  dateOf,
  timeToMinutes,
  minutesToTime,
  placeToItineraryCategory,
  slotOf,
  slotForTime,
  compareInSlot,
  formatDuration,
  timeLabel,
  longDayLabel,
  travelBetween,
  travelLabel,
} from '../utils/itinerary';
import DateRangeSheet from './DateRangeSheet';
import { DayMapBackground, openDirections } from './DayMap';
import { DragSource, createZones } from './ItineraryDrag';
import { showAlert } from './AppDialog';
import { ItinerarySkeleton } from './skeletons';
import { areaFromAddress } from '../utils/address';

const TOAST_MS = 4000;
const SCREEN_H = Dimensions.get('window').height;
// Page auto-scroll zones while dragging: under the header / above the tab bar.
const PAGE_TOP_ZONE = 170;
const UNPLANNED_HEIGHT = 250; // the unplanned list scrolls inside its card
// The floating tab bar: 64 tall plus its bottom padding (see AppTabBar).
const TAB_BAR_SPACE = (Platform.OS === 'ios' ? 28 : SIZES.spacing_lg) + 64 + SIZES.spacing_sm;
const SLOT_LABEL = Object.fromEntries(DAY_SLOTS.map((s) => [s.key, s.label]));
// "Not planned yet" groups, by the itinerary type a saved place maps to.
const TRAY_GROUPS = [
  { key: 'food', label: 'Food & drink' },
  { key: 'activity', label: 'Things to do' },
  { key: 'stay', label: 'Stays' },
];

function errorMessage(e) {
  if (e instanceof AuthRequiredError) return 'Sign in to edit this trip.';
  return e?.message || 'Something went wrong. Please try again.';
}

function hasTime(t) {
  return timeToMinutes(t) != null;
}

/** "19:30" -> a Date today at 19:30 (for the time picker). */
function timeToDate(time) {
  const d = new Date();
  const m = timeToMinutes(time) ?? 9 * 60;
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
}

function animateNext() {
  LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
}

/**
 * Itinerary tab of the trip screen: each day as a short story.
 *
 * The day is a list in visiting order under Morning, Afternoon and Evening
 * (plus Anytime), with a small map of the stops on top. Times are optional
 * (a "09:30" pill when set); between stops a thin line says how far the next
 * one is ("12 min walk · 0.9 km") and how much free time there is.
 *
 *  - Tap an item: it opens in place (part of day, time, note, move, remove).
 *  - Hold an item: drag it to reorder, into another part of the day, or onto
 *    the remove strip. Saved spots can be dragged in from "Not planned yet".
 *  - Every move and removal can be undone from the toast.
 *
 * The drag ghost, the floating bar and the toast are drawn by the trip
 * screen through `renderOverlay` (they must stay fixed while the page
 * scrolls), and `onScrollLock` freezes the page while dragging.
 *
 * @param {object} trip
 * @param {object[]} sortedDests  trip destinations in order (with places)
 * @param {boolean} canEdit
 * @param {(range) => Promise<void>} onSetTripDates  when the trip has no dates
 * @param {(node: React.ReactNode) => void} renderOverlay
 * @param {(locked: boolean) => void} onScrollLock
 * @param {(dy: number) => boolean} onPageScrollBy  scrolls the page while dragging
 * @param {boolean} [sheet]  the day's map fills the screen and the plan sits
 *   in a bottom sheet you drag between peek, half and full
 * @param {React.ReactNode} [heroControls]  drawn over the map (back / menu)
 */
export default function ItineraryTab({
  trip,
  liveKey = 0,
  sortedDests,
  canEdit,
  onSetTripDates,
  renderOverlay,
  onScrollLock,
  onPageScrollBy,
  sheet = false,
  heroControls = null,
}) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [selectedDay, setSelectedDay] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [trayPick, setTrayPick] = useState(null); // tray place waiting for a slot
  const [addingSlot, setAddingSlot] = useState(null); // slot with the inline "add" box open
  const [addText, setAddText] = useState('');
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [clearing, setClearing] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [toast, setToast] = useState(null); // { message, undo? }
  // Pin tapped on the map: { type: 'stop' | 'extra', data } (shows a card).
  const [mapPin, setMapPin] = useState(null);
  useEffect(() => { setMapPin(null); }, [selectedDay]);

  // ── Bottom sheet over the map (sheet mode) ──────────────────────────────
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const SNAP_FULL = insets.top + 64; // just under the back / menu buttons
  const SNAP_HALF = Math.round(screenH * 0.46);
  const SNAP_PEEK = screenH - TAB_BAR_SPACE - 110;
  const sheetY = useRef(new Animated.Value(SNAP_HALF)).current;
  const sheetYRef = useRef(SNAP_HALF);
  const [sheetTop, setSheetTop] = useState(SNAP_HALF); // settled position
  const dragStartY = useRef(SNAP_HALF);
  const sheetScrollRef = useRef(null);
  const sheetScroll = useRef({ y: 0, max: 0, viewH: 0 });
  const snapSheet = useCallback((y) => {
    sheetYRef.current = y;
    setSheetTop(y);
    Animated.spring(sheetY, { toValue: y, useNativeDriver: true, bounciness: 0, speed: 16 }).start();
  }, [sheetY]);
  const sheetPan = usePanGesture({
    runOnJS: true,
    enabled: sheet,
    activeOffsetY: [-6, 6],
    failOffsetX: [-24, 24],
    onActivate: () => { dragStartY.current = sheetYRef.current; },
    onUpdate: (e) => {
      sheetY.setValue(Math.max(SNAP_FULL, Math.min(SNAP_PEEK, dragStartY.current + e.translationY)));
    },
    onDeactivate: (e) => {
      // Nearest stop, nudged by how fast you flicked.
      const y = dragStartY.current + e.translationY + e.velocityY * 0.12;
      const stops = [SNAP_FULL, SNAP_HALF, SNAP_PEEK];
      snapSheet(stops.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a)));
    },
  });
  // The sheet's own list scrolls; while dragging an item it can be nudged.
  const sheetScrollBy = (dy) => {
    const p = sheetScroll.current;
    const next = Math.max(0, Math.min(p.max, p.y + dy));
    if (next === p.y) return false;
    p.y = next;
    sheetScrollRef.current?.scrollTo({ y: next, animated: false });
    return true;
  };
  const scrollBy = sheet ? sheetScrollBy : onPageScrollBy;
  const [drag, setDrag] = useState(null); // { kind: 'item'|'place', item?, place?, title, thumb }
  const [hover, setHover] = useState(null); // { key, after? }
  const dayStripRef = useRef(null);
  const toastTimer = useRef(null);
  const zones = useRef(createZones()).current;
  const ghost = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const hoverRef = useRef(null);
  const dragRef = useRef(null);
  const autoScroll = useRef({ timer: null, dir: 0, x: 0, y: 0 });
  // When the last drag ended: the release after a long press must not also
  // count as a tap (opening the item or the tray chooser).
  const dragEndedAt = useRef(0);
  const wasDrag = () => !!dragRef.current || Date.now() - dragEndedAt.current < 500;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  /** A day's slot, in order, from the latest items (never a stale render). */
  const slotList = (day, slot) => itemsRef.current
    .filter((i) => isoToDay(i.scheduledDate) === day && slotOf(i) === slot)
    .sort(compareInSlot);

  const days = useMemo(() => tripDays(trip, sortedDests), [trip, sortedDests]);
  const daySet = useMemo(() => new Set(days.map((d) => d.day)), [days]);

  const load = useCallback(async () => {
    try {
      const data = await getItinerary(trip.id);
      setItems(data);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
    }
  }, [trip.id]);

  useEffect(() => {
    setStatus('loading');
    load();
  }, [load]);

  // A friend changed the trip (live update): reload quietly, but never in the
  // middle of a drag. The reload waits until you let go.
  const liveReloadPending = useRef(false);
  useEffect(() => {
    if (!liveKey) return;
    if (drag) liveReloadPending.current = true;
    else load();
  }, [liveKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!drag && liveReloadPending.current) {
      liveReloadPending.current = false;
      load();
    }
  }, [drag, load]);

  // Open on today while the trip is under way, otherwise on Day 1.
  useEffect(() => {
    if (!days.length) { setSelectedDay(null); return; }
    setSelectedDay((current) => {
      if (current != null && daySet.has(current)) return current;
      const today = todayDay();
      return daySet.has(today) ? today : days[0].day;
    });
  }, [days, daySet]);

  // Scroll the day strip so the selected day is visible (pills are 64 wide + gap).
  useEffect(() => {
    const idx = days.findIndex((d) => d.day === selectedDay);
    if (idx > 2) dayStripRef.current?.scrollTo({ x: (idx - 1) * 72, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length]);

  useEffect(() => () => {
    clearTimeout(toastTimer.current);
    renderOverlay?.(null);
    onScrollLock?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Day -> slot -> items in order.
  const plan = useMemo(() => {
    const map = new Map();
    items.forEach((i) => {
      const d = isoToDay(i.scheduledDate);
      if (!map.has(d)) map.set(d, { morning: [], afternoon: [], evening: [], anytime: [] });
      map.get(d)[slotOf(i)].push(i);
    });
    map.forEach((slots) => Object.values(slots).forEach((list) => list.sort(compareInSlot)));
    return map;
  }, [items]);
  const slotsFor = useCallback(
    (day) => plan.get(day) || { morning: [], afternoon: [], evening: [], anytime: [] },
    [plan]
  );

  const plannedPlaceIds = useMemo(
    () => new Set(items.map((i) => i.tripPlaceId).filter(Boolean)),
    [items]
  );
  const placeById = useMemo(() => {
    const map = new Map();
    sortedDests.forEach((d) => (d.places || []).forEach((p) => map.set(p.id, { ...p, destId: d.id })));
    return map;
  }, [sortedDests]);

  const outside = items.filter((i) => !daySet.has(isoToDay(i.scheduledDate)));
  const current = days.find((d) => d.day === selectedDay) || days[0];

  // ── Toast ────────────────────────────────────────────────────────────────
  const showToast = useCallback((message, undo) => {
    clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const markBusy = (id, on) => setBusyIds((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  // ── Changes (optimistic, put back on failure) ───────────────────────────
  /**
   * Put item `id` on `day` in `slot` at position `index` (end if null),
   * renumbering that slot. Moving to a different part of the day clears an
   * exact time (it would no longer fit). Returns false if it failed.
   */
  const moveItem = async (id, { day, slot, index = null }, { toastText, quiet = false } = {}) => {
    const all = itemsRef.current;
    const item = all.find((i) => i.id === id);
    if (!item) return false;
    const fromDay = isoToDay(item.scheduledDate);
    const fromSlot = slotOf(item);
    // A set time no longer fits once the item moves to another part of the day.
    const clearTime = (slot !== fromSlot || slot === 'anytime') && hasTime(item.startTime);
    const target = slotList(day, slot).filter((i) => i.id !== id);
    const at = index == null ? target.length : Math.max(0, Math.min(index, target.length));
    target.splice(at, 0, item);
    const changes = target.map((i, n) => ({
      id: i.id,
      scheduledDate: i.id === id ? dayToIso(day) : i.scheduledDate,
      slot,
      sortOrder: n,
      clearTime: i.id === id && clearTime,
    }));
    const unchanged = changes.every((c) => {
      const i = all.find((x) => x.id === c.id);
      return isoToDay(i.scheduledDate) === isoToDay(c.scheduledDate) && slotOf(i) === c.slot
        && (i.sortOrder ?? 0) === c.sortOrder && !c.clearTime;
    });
    if (unchanged) return true;

    const before = all;
    animateNext();
    setItems((prev) => prev.map((i) => {
      const c = changes.find((x) => x.id === i.id);
      if (!c) return i;
      return {
        ...i,
        scheduledDate: c.scheduledDate,
        slot: c.slot,
        sortOrder: c.sortOrder,
        ...(c.clearTime ? { startTime: null, endTime: null } : {}),
      };
    }));
    // Saved in the background; the card has already moved.
    // Cards still being created (temporary ids) get their order when they're saved.
    const toSave = changes.filter((c) => !String(c.id).startsWith('temp-'));
    const saved = (toSave.length ? arrangeItinerary(trip.id, toSave) : Promise.resolve()).then(() => true, (e) => {
      setItems(before);
      setToast(null);
      showAlert('Could not move that', errorMessage(e));
      return false;
    });

    if (!quiet) {
      const undo = async () => {
        setToast(null);
        await moveItem(id, { day: fromDay, slot: fromSlot, index: null }, { quiet: true });
        if (clearTime) {
          setItems((prev) => prev.map((i) => (i.id === id ? { ...i, startTime: item.startTime, endTime: item.endTime } : i)));
          updateItineraryItem(trip.id, id, { startTime: item.startTime || '', endTime: item.endTime || '', slot: fromSlot })
            .catch(() => {});
        }
      };
      const where = day !== fromDay
        ? `Day ${(days.find((d) => d.day === day)?.index ?? 0) + 1}`
        : SLOT_LABEL[slot];
      showToast(toastText || `Moved to ${where}`, undo);
    }
    return saved;
  };

  /**
   * Add a saved place to `day` / `slot` (at `index`, end if null). The card
   * appears straight away with a temporary id; the server copy replaces it
   * when the save finishes (or it's taken back out if the save fails).
   */
  const addPlace = (place, { day, slot, index = null, startTime = null }) => {
    if (plannedPlaceIds.has(place.id)) return;
    const stopId = place.destId || current?.stop?.id;
    if (!stopId) return;
    setTrayPick(null);

    const list = slotList(day, slot);
    const at = index == null ? list.length : Math.max(0, Math.min(index, list.length));
    const tempId = `temp-${place.id}-${Date.now()}`;
    const draft = {
      id: tempId,
      tripId: trip.id,
      destinationId: stopId,
      tripPlaceId: place.id,
      title: place.placeName,
      category: placeToItineraryCategory(place.category),
      scheduledDate: dayToIso(day),
      startTime,
      endTime: null,
      notes: null,
      slot,
      sortOrder: at,
      createdAt: new Date().toISOString(),
    };
    // New order for the part of the day, with the new card in place.
    const ordered = list.slice();
    ordered.splice(at, 0, draft);
    const orderOf = new Map(ordered.map((i, n) => [i.id, n]));
    animateNext();
    setItems((prev) => [
      ...prev.map((i) => (orderOf.has(i.id) ? { ...i, sortOrder: orderOf.get(i.id) } : i)),
      draft,
    ]);

    const created = createItineraryItem(trip.id, {
      destinationId: stopId,
      tripPlaceId: place.id,
      title: place.placeName,
      category: draft.category,
      scheduledDate: draft.scheduledDate,
      startTime,
      slot,
      sortOrder: at,
    }).then((item) => {
      setItems((prev) => prev.map((i) => (i.id === tempId ? { ...item, sortOrder: at } : i)));
      // Others in the part shifted down: save their new order too.
      const shifted = ordered.filter((i) => i.id !== tempId && i.sortOrder !== orderOf.get(i.id));
      if (shifted.length) {
        arrangeItinerary(trip.id, shifted.map((i) => ({
          id: i.id, scheduledDate: i.scheduledDate, slot, sortOrder: orderOf.get(i.id),
        }))).catch(() => {});
      }
      return item;
    }, (e) => {
      setItems((prev) => prev.filter((i) => i.id !== tempId));
      setToast(null);
      showAlert('Could not add to plan', errorMessage(e));
      return null;
    });

    const undo = async () => {
      setToast(null);
      animateNext();
      setItems((prev) => prev.filter((i) => i.id !== tempId));
      const item = await created;
      if (item) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        deleteItineraryItem(trip.id, item.id).catch(() => load());
      }
    };
    const dayNo = (days.find((d) => d.day === day)?.index ?? 0) + 1;
    showToast(`Added to ${SLOT_LABEL[slot]}${day !== current?.day ? ` · Day ${dayNo}` : ''}`, undo);
  };

  /** A custom entry ("Flight to Osaka", "Check in") typed into a slot. */
  const addCustom = async (slot) => {
    const title = addText.trim();
    const stopId = current?.stop?.id;
    if (!title || !stopId || busyIds.has('new')) return;
    markBusy('new', true);
    try {
      const list = slotList(current.day, slot);
      const created = await createItineraryItem(trip.id, {
        destinationId: stopId,
        title,
        category: 'custom',
        scheduledDate: dayToIso(current.day),
        slot,
        sortOrder: list.length,
      });
      animateNext();
      setItems((prev) => [...prev, created]);
      setAddText('');
      setAddingSlot(null);
    } catch (e) {
      showAlert('Could not add that', errorMessage(e));
    } finally {
      markBusy('new', false);
    }
  };

  const removeItem = async (item) => {
    const before = itemsRef.current;
    animateNext();
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    if (expandedId === item.id) setExpandedId(null);
    // Deleted in the background; put back if it fails.
    const deleted = deleteItineraryItem(trip.id, item.id).then(() => true, (e) => {
      setItems(before);
      setToast(null);
      showAlert('Could not remove that', errorMessage(e));
      return false;
    });
    const undo = async () => {
      if (!(await deleted)) return;
      setToast(null);
      try {
        const restored = await createItineraryItem(trip.id, {
          destinationId: item.destinationId,
          tripPlaceId: item.tripPlaceId,
          title: item.title,
          category: item.category,
          scheduledDate: item.scheduledDate,
          startTime: item.startTime,
          endTime: item.endTime,
          notes: item.notes,
          slot: slotOf(item),
          sortOrder: item.sortOrder ?? 0,
        });
        animateNext();
        setItems((prev) => [...prev, restored]);
      } catch (e) {
        showAlert('Could not undo', errorMessage(e));
      }
    };
    showToast(`Removed ${item.title}`, undo);
  };

  /** Save edits made in the open item (time, note, title, category). */
  const updateItem = async (item, changes) => {
    const before = itemsRef.current;
    const local = { ...changes };
    if (local.startTime === '') local.startTime = null;
    if (local.endTime === '') local.endTime = null;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...local } : i)));
    try {
      await updateItineraryItem(trip.id, item.id, changes);
    } catch (e) {
      setItems(before);
      showAlert('Could not save that', errorMessage(e));
    }
  };

  /**
   * Setting a time files the item under the matching part of the day, placed
   * among that part's timed items in time order.
   */
  const setItemTime = async (item, time) => {
    const slot = slotForTime(time);
    const day = isoToDay(item.scheduledDate);
    const m = timeToMinutes(time);
    const list = slotList(day, slot).filter((i) => i.id !== item.id);
    let index = list.findIndex((i) => hasTime(i.startTime) && timeToMinutes(i.startTime) > m);
    if (index < 0) index = list.length;
    await moveItem(item.id, { day, slot, index }, { quiet: true });
    await updateItem(item, { startTime: time, endTime: '', slot });
  };

  const clearOutside = () => {
    if (!days.length) return;
    showAlert(
      'Clear items outside the trip?',
      `${outside.length} ${outside.length === 1 ? 'item is' : 'items are'} scheduled on days that are no longer part of this trip.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await deleteItineraryOutsideRange(trip.id, dayToIso(days[0].day), dayToIso(days[days.length - 1].day));
              setItems((prev) => prev.filter((i) => daySet.has(isoToDay(i.scheduledDate))));
            } catch (e) {
              showAlert('Could not clear', errorMessage(e));
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  // ── Drag and drop ────────────────────────────────────────────────────────
  const startDrag = (payload, x, y) => {
    if (!canEdit) return;
    setExpandedId(null);
    setTrayPick(null);
    setAddingSlot(null);
    clearTimeout(toastTimer.current);
    setToast(null);
    ghost.setValue({ x, y });
    hoverRef.current = null;
    setHover(null);
    dragRef.current = payload;
    setDrag(payload);
    onScrollLock?.(true);
    zones.measureAll();
  };

  // Measure again once the drag layout is on screen (e.g. Anytime appears).
  useEffect(() => {
    if (!drag) return undefined;
    const frame = requestAnimationFrame(() => zones.measureAll());
    return () => cancelAnimationFrame(frame);
  }, [drag, zones]);

  const updateHover = (x, y) => {
    const hit = zones.hit(x, y);
    const prev = hoverRef.current;
    if (hit?.key !== prev?.key || hit?.after !== prev?.after) {
      hoverRef.current = hit;
      setHover(hit);
    }
  };

  const stopAutoScroll = () => {
    clearInterval(autoScroll.current.timer);
    autoScroll.current.timer = null;
    autoScroll.current.dir = 0;
  };

  // Near the screen's top or bottom while dragging (e.g. up from a long
  // "Not planned yet" list): scroll the page, re-measuring drop targets.
  const setAutoScroll = (dir) => {
    const a = autoScroll.current;
    if (dir === a.dir) return;
    stopAutoScroll();
    if (!dir) return;
    a.dir = dir;
    a.timer = setInterval(() => {
      if (!scrollBy?.(dir * 24)) return;
      zones.measureAll();
      setTimeout(() => updateHover(a.x, a.y), 16);
    }, 40);
  };

  const moveDrag = (x, y) => {
    ghost.setValue({ x, y });
    autoScroll.current.x = x;
    autoScroll.current.y = y;
    const topZone = sheet ? sheetYRef.current + 90 : PAGE_TOP_ZONE;
    if (y < topZone) setAutoScroll(-1);
    else if (y > SCREEN_H - TAB_BAR_SPACE - 70 && drag?.kind !== 'item') setAutoScroll(1);
    else setAutoScroll(0);
    updateHover(x, y);
  };

  const endDrag = (x, y, canceled) => {
    const payload = dragRef.current;
    dragRef.current = null;
    dragEndedAt.current = Date.now();
    stopAutoScroll();
    const hit = canceled ? null : zones.hit(x, y);
    setDrag(null);
    setHover(null);
    hoverRef.current = null;
    onScrollLock?.(false);
    if (!payload || !hit) return;
    dropOn(payload, hit);
  };

  const dropOn = (payload, hit) => {
    const [kind, value] = [hit.key.split(':')[0], hit.key.slice(hit.key.indexOf(':') + 1)];
    const isItem = payload.kind === 'item';

    if (kind === 'dock-bin') {
      if (isItem) removeItem(payload.item);
      return;
    }
    if (!current) return;
    if (kind === 'item') {
      // Before or after another card, in that card's part of the day.
      const target = items.find((i) => i.id === value);
      if (!target || (isItem && target.id === payload.item.id)) return;
      const slot = slotOf(target);
      const list = slotList(current.day, slot).filter((i) => !isItem || i.id !== payload.item.id);
      const index = list.findIndex((i) => i.id === target.id) + (hit.after ? 1 : 0);
      if (isItem) {
        moveItem(payload.item.id, { day: current.day, slot, index },
          { toastText: payload.item.slotKey === slot ? 'Reordered' : undefined });
      } else {
        addPlace(payload.place, { day: current.day, slot, index });
      }
      return;
    }
    if (kind === 'slot') {
      if (isItem) moveItem(payload.item.id, { day: current.day, slot: value });
      else addPlace(payload.place, { day: current.day, slot: value });
    }
  };

  const dragHandlers = { onStart: startDrag, onMove: moveDrag, onEnd: endDrag };

  // ── Overlay (ghost, drop bar, toast), drawn by the trip screen ──────────
  const overlay = useMemo(() => {
    if (!drag && !toast) return null;
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {drag && (
          <>
            {/* Only a remove target while dragging an item (moving to another
                day is in the item's own panel). */}
            {drag.kind === 'item' && (
              <View
                ref={zones.register('dock-bin')}
                onLayout={() => zones.measure('dock-bin')}
                collapsable={false}
                pointerEvents="none"
                style={[styles.dockBin, { bottom: TAB_BAR_SPACE }, hover?.key === 'dock-bin' && styles.dockBinOn]}
              >
                <Ionicons name="trash-outline" size={18} color={hover?.key === 'dock-bin' ? COLORS.white : COLORS.error} />
                <Text style={[styles.dockBinText, hover?.key === 'dock-bin' && styles.dockTextOn]}>Drop here to remove</Text>
              </View>
            )}

            {/* The card under your finger. */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ghost,
                { transform: [{ translateX: Animated.subtract(ghost.x, 40) }, { translateY: Animated.subtract(ghost.y, 34) }] },
              ]}
            >
              <View style={[styles.ghostBar, { backgroundColor: drag.bar || COLORS.accent }]} />
              {drag.thumb ? (
                <Image source={{ uri: drag.thumb }} style={styles.ghostThumb} contentFit="cover" />
              ) : (
                <View style={[styles.ghostThumb, styles.thumbEmpty]}>
                  <Ionicons name="bookmark" size={16} color={COLORS.textMuted} />
                </View>
              )}
              <Text style={styles.ghostTitle} numberOfLines={2}>{drag.title}</Text>
            </Animated.View>
          </>
        )}

        {!drag && toast && (
          <View style={[styles.toast, { bottom: TAB_BAR_SPACE }]}>
            <Text style={styles.toastText} numberOfLines={1}>{toast.message}</Text>
            {toast.undo && (
              <TouchableOpacity onPress={toast.undo} hitSlop={8} accessibilityRole="button">
                <Text style={styles.toastUndo}>Undo</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Only drag / hover / toast changes rebuild it: anything else here would
  // re-send it to the trip screen on every render (an update loop).
  }, [drag, hover, toast]);

  useEffect(() => {
    renderOverlay?.(overlay);
  }, [overlay, renderOverlay]);

  useEffect(() => () => clearInterval(autoScroll.current.timer), []);

  // ── Map at the top, the tab on a sheet over it ─────────────────────────
  // Where to centre the map when the day has nothing on it: a stop's city.
  const areaStop = (current?.stop && Number.isFinite(current.stop.latitude) ? current.stop : null)
    || sortedDests.find((d) => Number.isFinite(d.latitude) && Number.isFinite(d.longitude));
  const area = areaStop ? { latitude: areaStop.latitude, longitude: areaStop.longitude } : null;
  /** Card for a tapped pin: photo, what/when, rating and area, actions. */
  const renderPinCard = (pin, map, stops) => {
    const isStop = pin.type === 'stop';
    const d = pin.data;
    const place = isStop ? d.place : d.place;
    const item = isStop ? d.item : null;
    const cat = ITINERARY_CATEGORY[isStop ? item?.category : placeToItineraryCategory(place?.category)]
      || ITINERARY_CATEGORY.custom;
    const photo = place ? (placePhotoUrl(place.placeId, 200) || normalizePhotoUrl(place.photoUrl, 200)) : null;
    const prev = isStop && d.n > 1 ? stops[d.n - 2] : null;
    const travel = prev ? travelBetween(prev, d) : null;
    const label = isStop
      ? [`Stop ${d.n}`, SLOT_LABEL[slotOf(item)], hasTime(item?.startTime) ? timeLabel(item.startTime) : null]
        .filter(Boolean).join(' · ')
      : 'Saved, not planned yet';
    const area = areaFromAddress(place?.vicinity, place?.destName);
    // Area last: a long one gets the "…" instead of the category.
    const sub = [
      ratingText(place?.rating) || null,
      cat.label,
      area || null,
    ].filter(Boolean).join(' · ');
    const directionsTo = () => {
      const q = `${d.latitude},${d.longitude}`;
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`
        + `${place?.placeId ? `&destination_place_id=${encodeURIComponent(place.placeId)}` : ''}`).catch(() => {});
    };
    return (
      <View style={[styles.mapExtraCard, { top: SNAP_FULL + 44 }]}>
        <View style={styles.pinCardTop}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.pinCardPhoto} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.pinCardPhoto, styles.itemIconTile, { backgroundColor: cat.tint }]}>
              <Ionicons name={cat.icon} size={22} color={cat.color} />
            </View>
          )}
          <View style={styles.flex}>
            <Text style={[styles.mapExtraLabel, isStop && { color: cat.color }]} numberOfLines={1}>{label}</Text>
            <Text style={styles.mapExtraTitle} numberOfLines={2}>{d.title}</Text>
            {!!sub && <Text style={styles.pinCardSub} numberOfLines={1}>{sub}</Text>}
            {travel && (
              <Text style={styles.pinCardSub} numberOfLines={1}>
                {travelLabel(travel)} from stop {prev.n}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={() => setMapPin(null)} hitSlop={8} accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        {!!item?.notes && <Text style={styles.pinCardNote} numberOfLines={2}>{item.notes}</Text>}

        {!isStop && map.onPlan && (
          <View style={styles.pickChips}>
            {DAY_SLOTS.map((sl) => (
              <TouchableOpacity
                key={sl.key}
                style={styles.pickChip}
                onPress={() => { map.onPlan(place, sl.key); setMapPin(null); }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Plan in the ${sl.label.toLowerCase()}`}
              >
                <Ionicons name={sl.icon} size={14} color={COLORS.primary} />
                <Text style={styles.pickChipText}>{sl.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={styles.pinCardActions}>
          {isStop && (
            <TouchableOpacity
              style={styles.pinCardButton}
              onPress={() => {
                setMapPin(null);
                animateNext();
                setExpandedId(d.id);
                if (sheetYRef.current === SNAP_PEEK) snapSheet(SNAP_HALF);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Ionicons name="list-outline" size={15} color={COLORS.primary} />
              <Text style={styles.pinCardButtonText}>Show in plan</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.pinCardButton} onPress={directionsTo} activeOpacity={0.85} accessibilityRole="button">
            <Ionicons name="navigate-outline" size={15} color={COLORS.primary} />
            <Text style={styles.pinCardButtonText}>Directions</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const wrap = (content, map = {}) => {
    if (!sheet) return content;
    const stops = map.stops || [];
    const extrasOnMap = map.extras || [];
    return (
      <View style={styles.sheetScreen}>
        <DayMapBackground
          stops={stops}
          extras={extrasOnMap}
          area={area}
          topInset={SNAP_FULL}
          bottomInset={screenH - sheetTop}
          selectedId={mapPin?.data.id || null}
          onPressStop={(st) => setMapPin({ type: 'stop', data: st })}
          onPressExtra={(x) => setMapPin({ type: 'extra', data: x })}
        />
        {heroControls}
        {stops.length > 0 && (
          <TouchableOpacity
            style={[styles.mapFab, { top: SNAP_FULL - 2 }]}
            onPress={() => openDirections(stops)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open the day's route in Google Maps"
          >
            <Ionicons name="navigate" size={15} color={COLORS.primary} />
            <Text style={styles.mapFabText}>Directions</Text>
          </TouchableOpacity>
        )}

        {/* Pin tapped: a small card with the place's details. */}
        {mapPin && renderPinCard(mapPin, map, stops)}

        {/* The plan, in a sheet you drag by its top. */}
        <Animated.View
          style={[styles.planSheet, { height: screenH - SNAP_FULL, transform: [{ translateY: sheetY }] }]}
        >
          <GestureDetector gesture={sheetPan}>
            <View style={styles.sheetHandleArea}>
              <TouchableOpacity
                style={styles.sheetHandleTap}
                onPress={() => snapSheet(sheetYRef.current === SNAP_FULL ? SNAP_HALF : SNAP_FULL)}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel={sheetTop === SNAP_FULL ? 'Show more map' : 'Show more of the plan'}
              >
                <View style={styles.grabber} />
                <View style={styles.sheetTitleRow}>
                  <Text style={styles.sheetTitle} numberOfLines={1}>{map.title || 'Itinerary'}</Text>
                  {stops.length > 0 && (
                    <Text style={styles.count}>{stops.length} on the map</Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </GestureDetector>
          <ScrollView
            ref={sheetScrollRef}
            style={styles.flex}
            scrollEnabled={!drag}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={(e) => { sheetScroll.current.y = e.nativeEvent.contentOffset.y; }}
            onLayout={(e) => { sheetScroll.current.viewH = e.nativeEvent.layout.height; }}
            onContentSizeChange={(_, h) => {
              const p = sheetScroll.current;
              p.max = Math.max(0, h - p.viewH);
            }}
            // The part of the sheet below the screen edge stays reachable.
            contentContainerStyle={[styles.sheetContent, { paddingBottom: sheetTop - SNAP_FULL + TAB_BAR_SPACE + SIZES.spacing_base }]}
          >
            {content}
          </ScrollView>
        </Animated.View>
      </View>
    );
  };

  // ── States ───────────────────────────────────────────────────────────────
  // Loading: placeholders shaped like the plan, so nothing jumps when it arrives.
  if (status === 'loading') {
    return wrap(<ItinerarySkeleton />);
  }

  if (status === 'error') {
    return wrap(
      <View style={[styles.card, styles.center]}>
        <Ionicons name="cloud-offline-outline" size={32} color={COLORS.textMuted} />
        <Text style={styles.stateTitle}>Couldn't load the itinerary</Text>
        <TouchableOpacity
          style={styles.solidButton}
          onPress={() => { setStatus('loading'); load(); }}
          activeOpacity={0.9}
        >
          <Text style={styles.solidButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!days.length) {
    return wrap(
      <View style={[styles.card, styles.center]}>
        <View style={[styles.bigIcon, { backgroundColor: '#e6f4fb' }]}>
          <Ionicons name="calendar" size={26} color={COLORS.primaryLight} />
        </View>
        <Text style={styles.stateTitle}>Set your trip dates to plan each day</Text>
        <Text style={styles.stateText}>Once the trip has dates, you'll get a day-by-day plan here.</Text>
        {canEdit && (
          <TouchableOpacity style={styles.solidButton} onPress={() => setDatesOpen(true)} activeOpacity={0.9}>
            <Text style={styles.solidButtonText}>Set trip dates</Text>
          </TouchableOpacity>
        )}
        <DateRangeSheet
          visible={datesOpen}
          title="Trip dates"
          startDate={null}
          endDate={null}
          onClose={() => setDatesOpen(false)}
          onApply={async (range) => {
            setDatesOpen(false);
            if (!range.startDate) return;
            try {
              await onSetTripDates({ startDate: range.startDate, endDate: range.endDate || range.startDate });
            } catch (e) {
              showAlert('Could not set dates', errorMessage(e));
            }
          }}
        />
      </View>
    );
  }

  // ── Selected day ─────────────────────────────────────────────────────────
  const daySlots = slotsFor(current.day);
  const dayCount = DAY_SLOTS.reduce((n, s) => n + daySlots[s.key].length, 0);
  // Every saved spot on the trip not planned yet, on every day. This day's
  // stop comes first; each row says which stop it's from.
  const multiStop = sortedDests.length > 1;
  const unplanned = sortedDests
    .slice()
    .sort((a, b) => (a.id === current.stop?.id ? -1 : b.id === current.stop?.id ? 1 : 0))
    .flatMap((d) => (d.places || [])
      .filter((p) => !plannedPlaceIds.has(p.id))
      .map((p) => ({ ...p, destId: d.id, destName: d.name })));
  const plannedDays = days.filter((d) => DAY_SLOTS.some((s) => slotsFor(d.day)[s.key].length)).length;

  const thumbFor = (item) => {
    const place = item.tripPlaceId ? placeById.get(item.tripPlaceId) : null;
    return place ? (placePhotoUrl(place.placeId, 160) || normalizePhotoUrl(place.photoUrl, 160)) : null;
  };

  // The day in visiting order (Morning → Afternoon → Evening → Anytime).
  const dayOrder = DAY_SLOTS.flatMap((sl) => daySlots[sl.key]);
  const coordsOf = (item) => {
    const p = item.tripPlaceId ? placeById.get(item.tripPlaceId) : null;
    return p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
      ? { latitude: p.latitude, longitude: p.longitude }
      : null;
  };
  // Map numbers: stops that have a location, in order (same on map + list).
  const stopNumber = new Map();
  const mapStops = [];
  dayOrder.forEach((item) => {
    const c = coordsOf(item);
    if (!c) return;
    stopNumber.set(item.id, mapStops.length + 1);
    const cat = ITINERARY_CATEGORY[item.category] || ITINERARY_CATEGORY.custom;
    mapStops.push({
      id: item.id,
      n: mapStops.length + 1,
      title: item.title,
      color: cat.bar,
      item,
      place: placeById.get(item.tripPlaceId),
      ...c,
    });
  });

  /**
   * Between two stops: where you're coming from and how far it is ("From
   * Kashi Art Café · 12 min walk"). Free time only within the same part of
   * the day, and only when it's a useful gap (30 min – 3 h).
   */
  const renderGap = (prev, item) => {
    const travel = travelBetween(coordsOf(prev), coordsOf(item));
    let free = null;
    if (slotOf(prev) === slotOf(item) && hasTime(prev.startTime) && hasTime(item.startTime)) {
      const prevEnd = timeToMinutes(prev.endTime) ?? timeToMinutes(prev.startTime) + 60;
      const gap = timeToMinutes(item.startTime) - prevEnd - (travel?.minutes || 0);
      if (gap >= 30 && gap <= 180) free = `${formatDuration(gap)} free`;
    }
    if (!travel && !free) return null;
    return (
      <View key={`gap-${item.id}`} style={styles.gapRow}>
        <View style={styles.gapLine} />
        {travel && (
          <Ionicons
            name={travel.mode === 'drive' ? 'car-outline' : travel.mode === 'walk' ? 'walk-outline' : 'location-outline'}
            size={13}
            color={COLORS.textMuted}
          />
        )}
        {/* The stop name shrinks with "…"; the travel time and free time always show. */}
        {travel && (
          <Text style={styles.gapText} numberOfLines={1}>
            From <Text style={styles.gapFrom}>{prev.title}</Text>
          </Text>
        )}
        <Text style={styles.gapInfo} numberOfLines={1}>
          {(travel ? '·  ' : '') + [travel ? travelLabel(travel) : null, free].filter(Boolean).join('  ·  ')}
        </Text>
      </View>
    );
  };

  /** A card: number (if on the map), title, optional time pill, type, note. */
  const renderItem = (item, slotKey) => {
    const cat = ITINERARY_CATEGORY[item.category] || ITINERARY_CATEGORY.custom;
    const thumb = thumbFor(item);
    const open = expandedId === item.id;
    const dragging = drag?.kind === 'item' && drag.item.id === item.id;
    const timed = hasTime(item.startTime);
    const hoverHere = hover?.key === `item:${item.id}` && !dragging;
    const n = stopNumber.get(item.id);
    // Just added and still saving: shown, but not editable or draggable yet.
    const saving = String(item.id).startsWith('temp-');
    const toggle = () => {
      if (!canEdit || saving || wasDrag()) return;
      animateNext();
      setExpandedId(open ? null : item.id);
    };
    return (
      <View key={item.id} ref={zones.register(`item:${item.id}`)} collapsable={false}>
        {hoverHere && !hover.after && <View style={styles.dropLine} />}
        <DragSource
          enabled={canEdit && !open && !saving}
          payload={{ kind: 'item', item: { ...item, slotKey }, title: item.title, thumb, bar: cat.bar }}
          {...dragHandlers}
        >
          <View style={[styles.item, open && styles.itemOpen, dragging && styles.itemDragging, saving && styles.itemSaving]}>
            <View style={[styles.itemBar, { backgroundColor: cat.bar }]} />
            <View style={styles.flex}>
              <TouchableOpacity
                style={styles.itemRow}
                onPress={toggle}
                disabled={!canEdit}
                activeOpacity={0.85}
                accessibilityRole={canEdit ? 'button' : undefined}
                accessibilityLabel={[n ? `Stop ${n}` : null, item.title, timed ? `at ${timeLabel(item.startTime)}` : null, cat.label].filter(Boolean).join(', ')}
                accessibilityHint={canEdit ? 'Tap to edit. Hold to drag.' : undefined}
              >
                {n ? (
                  <View style={[styles.stopNo, { backgroundColor: cat.bar }]}>
                    <Text style={styles.stopNoText}>{n}</Text>
                  </View>
                ) : (
                  <View style={[styles.stopNo, { backgroundColor: cat.tint }]}>
                    <Ionicons name={cat.icon} size={13} color={cat.color} />
                  </View>
                )}
                <View style={styles.itemText}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                  <View style={styles.itemMetaRow}>
                    {timed && (
                      <View style={styles.timePill}>
                        <Ionicons name="time" size={11} color={COLORS.primary} />
                        <Text style={styles.timePillText}>
                          {timeLabel(item.startTime)}{hasTime(item.endTime) ? `–${timeLabel(item.endTime)}` : ''}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.itemMeta} numberOfLines={1}>
                      <Text style={{ color: cat.color }}>{cat.label}</Text>
                      {!!item.notes && !open ? `  ·  ${item.notes}` : ''}
                    </Text>
                  </View>
                </View>
                {canEdit && (
                  <Ionicons
                    name={open ? 'chevron-up' : 'ellipsis-horizontal'}
                    size={16}
                    color={COLORS.textMuted}
                    style={styles.itemMore}
                  />
                )}
              </TouchableOpacity>
              {open && (
                <ItemEditor
                  item={item}
                  days={days}
                  currentDay={current.day}
                  onSlot={(slot) => moveItem(item.id, { day: current.day, slot })}
                  onTime={(time) => setItemTime(item, time)}
                  onClearTime={() => updateItem(item, { startTime: '', endTime: '' })}
                  onSave={(changes) => updateItem(item, changes)}
                  onMoveDay={(day) => { setExpandedId(null); moveItem(item.id, { day, slot: slotOf(item) }); }}
                  onRemove={() => removeItem(item)}
                />
              )}
            </View>
          </View>
        </DragSource>
        {hoverHere && hover.after && <View style={styles.dropLine} />}
      </View>
    );
  };

  /** Inline "type an entry" box for a part of the day. */
  const renderAddBox = (slotKey) => (
    <View style={styles.addRow}>
      <TextInput
        style={styles.addInput}
        value={addText}
        onChangeText={setAddText}
        placeholder="e.g. Check in, Flight to Osaka"
        placeholderTextColor={COLORS.textMuted}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => addCustom(slotKey)}
        maxLength={120}
      />
      {busyIds.has('new') ? (
        <ActivityIndicator size="small" color={COLORS.primary} />
      ) : (
        <>
          <TouchableOpacity onPress={() => addCustom(slotKey)} hitSlop={8} accessibilityLabel="Add">
            <Ionicons name="checkmark-circle" size={26} color={addText.trim() ? COLORS.accent : COLORS.border} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAddingSlot(null)} hitSlop={8} accessibilityLabel="Cancel">
            <Ionicons name="close" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  const renderSlot = (slot) => {
    const list = daySlots[slot.key];
    const hoverHere = hover?.key === `slot:${slot.key}`;
    const adding = canEdit && addingSlot === slot.key;
    // Anytime only shows when it has something (or while dragging / adding).
    if (slot.key === 'anytime' && !list.length && !drag && !adding) return null;
    return (
      <View
        key={slot.key}
        ref={zones.register(`slot:${slot.key}`)}
        collapsable={false}
        style={[styles.slot, hoverHere && styles.slotHover]}
      >
        <View style={styles.slotHead}>
          <Ionicons name={slot.icon} size={15} color={COLORS.primaryLight} />
          <Text style={styles.slotTitle}>{slot.label}</Text>
          {list.length > 0 && <Text style={styles.slotCount}>{list.length}</Text>}
          <View style={styles.flex} />
          {canEdit && !adding && (
            <TouchableOpacity
              style={styles.slotAdd}
              onPress={() => { setAddingSlot(slot.key); setAddText(''); }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Add something to ${slot.label.toLowerCase()}`}
            >
              <Ionicons name="add" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>

        {list.map((item) => {
          const at = dayOrder.indexOf(item);
          return (
            <React.Fragment key={item.id}>
              {at > 0 && renderGap(dayOrder[at - 1], item)}
              {renderItem(item, slot.key)}
            </React.Fragment>
          );
        })}

        {adding && renderAddBox(slot.key)}
        {!list.length && !adding && (
          <TouchableOpacity
            style={[styles.slotEmpty, hoverHere && styles.slotEmptyHover]}
            onPress={() => { if (canEdit && !drag) { setAddingSlot(slot.key); setAddText(''); } }}
            disabled={!canEdit}
            activeOpacity={0.7}
          >
            <Text style={[styles.slotEmptyText, hoverHere && styles.slotEmptyTextHover]}>
              {drag ? 'Drop here' : `Free ${slot.key === 'anytime' ? 'slot' : slot.label.toLowerCase()}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // The day on the map: numbered stops, plus this stop's unplanned spots
  // as faded pins (plannable from the full map).
  const extras = unplanned
    .filter((p) => p.destId === current.stop?.id && Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
    .map((p) => ({ id: p.id, title: p.placeName, latitude: p.latitude, longitude: p.longitude, place: p }));
  const heroMap = {
    stops: mapStops,
    extras,
    title: `Day ${current.index + 1}${current.stop ? ` · ${current.stop.name}` : ''}`,
    onPlan: canEdit ? (place, slot) => addPlace(place, { day: current.day, slot }) : undefined,
  };

  return wrap(
    <View>
      {/* Date and day strip */}
      <View style={styles.card}>
        <Text style={styles.longDate}>{longDayLabel(current.day)}</Text>
        <View style={styles.dayMetaRow}>
          <Text style={styles.dayMeta}>Day {current.index + 1} of {days.length}</Text>
          {!!current.stop && (
            <View style={styles.stopChip}>
              <View style={[styles.dayDot, { backgroundColor: current.color }]} />
              <Text style={styles.stopChipText} numberOfLines={1}>
                {current.fromStop ? `${current.fromStop.name} → ${current.stop.name}` : current.stop.name}
              </Text>
            </View>
          )}
          <Text style={styles.count}>{plannedDays}/{days.length} planned</Text>
        </View>
        <ScrollView
          ref={dayStripRef}
          horizontal
          scrollEnabled={!drag}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayStrip}
        >
          {days.map((d) => {
            const active = d.day === current.day;
            const s = slotsFor(d.day);
            const planned = DAY_SLOTS.some((x) => s[x.key].length);
            return (
              <TouchableOpacity
                key={d.day}
                style={[styles.dayPill, active && styles.dayPillActive]}
                onPress={() => { setExpandedId(null); setTrayPick(null); setSelectedDay(d.day); }}
                activeOpacity={0.85}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Day ${d.index + 1}, ${dayLabel(d.day)}${planned ? ', has plans' : ''}`}
              >
                <Text style={[styles.dayPillWeek, active && styles.dayPillTextActive]}>
                  {weekdayOf(d.day).toUpperCase()}
                </Text>
                <View style={[styles.dayPillRule, active && styles.dayPillRuleActive]} />
                <Text style={[styles.dayPillDate, active && styles.dayPillTextActive]}>{dateOf(d.day)}</Text>
                <View
                  style={[
                    styles.dayPillMark,
                    { backgroundColor: planned ? (active ? COLORS.white : d.color) : 'transparent' },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* The day: a map of the stops, then the story in order */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardTitle}>Day plan</Text>
          {dayCount > 0 && (
            <Text style={styles.count}>
              {dayCount} {dayCount === 1 ? 'stop' : 'stops'}
            </Text>
          )}
        </View>
        {canEdit && dayCount > 1 && (
          <Text style={styles.hint}>Tap to edit · hold to drag and reorder</Text>
        )}
        {DAY_SLOTS.map(renderSlot)}
      </View>

      {/* Saved spots not planned yet: a list grouped by type */}
      {canEdit && unplanned.length > 0 && (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>Not planned yet</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{unplanned.length}</Text>
            </View>
          </View>
          <Text style={styles.subText}>
            {multiStop ? 'Saved spots from every stop' : `Saved in ${current.stop?.name || 'this trip'}`}. Tap Plan, or hold a spot and drag it into the day.
          </Text>
          <ScrollView
            style={unplanned.length > 3 ? { maxHeight: UNPLANNED_HEIGHT } : null}
            nestedScrollEnabled
            scrollEnabled={!drag}
            showsVerticalScrollIndicator={unplanned.length > 3}
            keyboardShouldPersistTaps="handled"
          >
          {TRAY_GROUPS.map((g) => {
            const places = unplanned.filter((p) => placeToItineraryCategory(p.category) === g.key);
            if (!places.length) return null;
            const cat = ITINERARY_CATEGORY[g.key];
            return (
              <View key={g.key} style={styles.trayGroup}>
                <View style={styles.trayGroupHead}>
                  <View style={[styles.typeDot, { backgroundColor: cat.bar }]} />
                  <Text style={styles.trayGroupTitle}>{g.label}</Text>
                  <Text style={styles.trayGroupCount}>{places.length}</Text>
                </View>
                {places.map((p) => {
                  const thumb = placePhotoUrl(p.placeId, 160) || normalizePhotoUrl(p.photoUrl, 160);
                  const picked = trayPick?.id === p.id;
                  const busy = busyIds.has(p.id);
                  const dragging = drag?.kind === 'place' && drag.place.id === p.id;
                  const area = areaFromAddress(p.vicinity, p.destName);
                  const sub = [
                    multiStop ? p.destName : null,
                    ratingText(p.rating) || null,
                    area && area !== p.destName ? area : null,
                  ].filter(Boolean).join(' · ');
                  return (
                    <View key={p.id}>
                      <DragSource
                        payload={{ kind: 'place', place: p, title: p.placeName, thumb, bar: cat.bar }}
                        {...dragHandlers}
                      >
                        <View style={[styles.trayRow, picked && styles.trayRowPicked, dragging && styles.itemDragging]}>
                          {thumb ? (
                            <Image source={{ uri: thumb }} style={styles.trayPhoto} contentFit="cover" cachePolicy="memory-disk" />
                          ) : (
                            <View style={[styles.trayPhoto, styles.itemIconTile, { backgroundColor: cat.tint }]}>
                              <Ionicons name={cat.icon} size={20} color={cat.color} />
                            </View>
                          )}
                          <View style={styles.trayInfo}>
                            <Text style={styles.trayPlace} numberOfLines={1}>{p.placeName}</Text>
                            {!!sub && <Text style={styles.traySub} numberOfLines={1}>{sub}</Text>}
                          </View>
                          <TouchableOpacity
                            style={[styles.planButton, picked && styles.planButtonOn]}
                            onPress={() => { if (!wasDrag()) setTrayPick(picked ? null : p); }}
                            disabled={busy}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel={`Plan ${p.placeName} on day ${current.index + 1}`}
                          >
                            {busy ? (
                              <ActivityIndicator size="small" color={COLORS.accentDeep} />
                            ) : (
                              <>
                                <Ionicons name={picked ? 'close' : 'add'} size={15} color={picked ? COLORS.white : COLORS.accentDeep} />
                                <Text style={[styles.planButtonText, picked && styles.planButtonTextOn]}>
                                  {picked ? 'Cancel' : 'Plan'}
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      </DragSource>

                      {/* Where should it go? */}
                      {picked && (
                        <View style={styles.pickRow}>
                          <Text style={styles.pickText}>Add to Day {current.index + 1}:</Text>
                          <View style={styles.pickChips}>
                            {DAY_SLOTS.map((sl) => (
                              <TouchableOpacity
                                key={sl.key}
                                style={styles.pickChip}
                                onPress={() => addPlace(p, { day: current.day, slot: sl.key })}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                              >
                                <Ionicons name={sl.icon} size={14} color={COLORS.primary} />
                                <Text style={styles.pickChipText}>{sl.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}
          </ScrollView>
        </View>
      )}

      {/* Items on days outside the trip */}
      {outside.length > 0 && (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>Outside trip dates</Text>
            {canEdit && (
              clearing ? (
                <ActivityIndicator size="small" color={COLORS.error} />
              ) : (
                <TouchableOpacity onPress={clearOutside} accessibilityRole="button">
                  <Text style={styles.clearText}>Clear these</Text>
                </TouchableOpacity>
              )
            )}
          </View>
          {outside.map((i) => (
            <Text key={i.id} style={styles.outsideItem} numberOfLines={1}>
              {dayLabel(isoToDay(i.scheduledDate))} · {i.title}
            </Text>
          ))}
        </View>
      )}
    </View>,
    heroMap,
  );
}

/**
 * An item opened in place: part of the day, optional time, note, title and
 * category (own entries only), move to another day, remove.
 */
function ItemEditor({ item, days, currentDay, onSlot, onTime, onClearTime, onSave, onMoveDay, onRemove }) {
  const [notes, setNotes] = useState(item.notes || '');
  const [title, setTitle] = useState(item.title || '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftTime, setDraftTime] = useState(() => timeToDate(item.startTime));
  const isCustom = !item.tripPlaceId;

  const saveNotes = () => {
    if ((item.notes || '') !== notes.trim()) onSave({ notes: notes.trim() });
  };
  const saveTitle = () => {
    const t = title.trim();
    if (t && t !== item.title) onSave({ title: t });
    else setTitle(item.title);
  };
  const toTime = (date) => minutesToTime(date.getHours() * 60 + date.getMinutes());

  return (
    <View style={styles.editor}>
      {isCustom && (
        <TextInput
          style={styles.editorTitle}
          value={title}
          onChangeText={setTitle}
          onEndEditing={saveTitle}
          returnKeyType="done"
          maxLength={120}
          accessibilityLabel="Title"
        />
      )}

      <Text style={styles.editorLabel}>Part of the day</Text>
      <View style={styles.chipRow}>
        {DAY_SLOTS.map((sl) => {
          const on = sl.key === slotOf(item);
          return (
            <TouchableOpacity
              key={sl.key}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => !on && onSlot(sl.key)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{sl.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.editorLabel}>Time (only if it's fixed)</Text>
      <View style={styles.chipRow}>
        {hasTime(item.startTime) ? (
          <>
            <TouchableOpacity style={[styles.chip, styles.chipOn]} onPress={() => setPickerOpen(true)} activeOpacity={0.85}>
              <Ionicons name="time" size={14} color={COLORS.white} />
              <Text style={[styles.chipText, styles.chipTextOn]}>{timeLabel(item.startTime)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={onClearTime} activeOpacity={0.85} accessibilityLabel="Clear time">
              <Ionicons name="close" size={14} color={COLORS.textSecondary} />
              <Text style={styles.chipText}>No set time</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.chip} onPress={() => setPickerOpen(true)} activeOpacity={0.85}>
            <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.chipText}>Set a time</Text>
          </TouchableOpacity>
        )}
      </View>
      {pickerOpen && Platform.OS === 'ios' && (
        <View style={styles.pickerBox}>
          <DateTimePicker
            value={draftTime}
            mode="time"
            display="spinner"
            minuteInterval={5}
            is24Hour
            locale="en_GB"
            onChange={(_, date) => date && setDraftTime(date)}
            style={styles.picker}
          />
          <TouchableOpacity
            style={styles.pickerDone}
            onPress={() => { setPickerOpen(false); onTime(toTime(draftTime)); }}
            accessibilityRole="button"
          >
            <Text style={styles.pickerDoneText}>Set time</Text>
          </TouchableOpacity>
        </View>
      )}
      {pickerOpen && Platform.OS === 'android' && (
        <DateTimePicker
          value={draftTime}
          mode="time"
          display="default"
          minuteInterval={5}
          is24Hour
          onChange={(event, date) => {
            setPickerOpen(false);
            if (event.type === 'set' && date) onTime(toTime(date));
          }}
        />
      )}

      {isCustom && (
        <>
          <Text style={styles.editorLabel}>Type</Text>
          <View style={styles.chipRow}>
            {ITINERARY_CATEGORIES.map((c) => {
              const on = c.key === item.category;
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.chip, on && { backgroundColor: c.color, borderColor: c.color }]}
                  onPress={() => !on && onSave({ category: c.key })}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Ionicons name={c.icon} size={13} color={on ? COLORS.white : c.color} />
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      <TextInput
        style={styles.notesInput}
        value={notes}
        onChangeText={setNotes}
        onEndEditing={saveNotes}
        placeholder="Add a note (tickets, booking, who's going…)"
        placeholderTextColor={COLORS.textMuted}
        multiline
        maxLength={500}
        accessibilityLabel="Note"
      />

      {days.length > 1 && (
        <>
          <Text style={styles.editorLabel}>Move to another day</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {days.filter((d) => d.day !== currentDay).map((d) => (
              <TouchableOpacity
                key={d.day}
                style={styles.chip}
                onPress={() => onMoveDay(d.day)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Move to day ${d.index + 1}, ${dayLabel(d.day)}`}
              >
                <Text style={styles.chipText}>Day {d.index + 1} · {dateOf(d.day)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      <TouchableOpacity style={styles.removeButton} onPress={onRemove} activeOpacity={0.8} accessibilityRole="button">
        <Ionicons name="trash-outline" size={16} color={COLORS.error} />
        <Text style={styles.removeText}>Remove from plan</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Map + bottom sheet
  sheetScreen: {
    flex: 1,
  },
  planSheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    backgroundColor: '#f3f5f7',
    shadowColor: '#043247',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
  },
  sheetHandleArea: {
    paddingHorizontal: SIZES.spacing_base,
  },
  sheetHandleTap: {
    paddingTop: SIZES.spacing_sm,
    paddingBottom: SIZES.spacing_sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    marginBottom: SIZES.spacing_sm,
    backgroundColor: '#cfd6de',
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.spacing_sm,
  },
  sheetTitle: {
    flexShrink: 1,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  sheetContent: {
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: SIZES.spacing_xs,
  },
  mapFab: {
    position: 'absolute',
    right: SIZES.spacing_base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  mapFabText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  mapExtraCard: {
    position: 'absolute',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
    padding: SIZES.spacing_md,
    gap: SIZES.spacing_sm,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    zIndex: 5,
    shadowColor: '#043247',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  pinCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.spacing_md,
  },
  pinCardPhoto: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  pinCardSub: {
    marginTop: 1,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  pinCardNote: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f2f4f7',
  },
  pinCardActions: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
  },
  pinCardButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: SIZES.radius_full,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  pinCardButtonText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  mapExtraLabel: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  mapExtraTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  // Matches the trip screen's section cards.
  card: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_xl,
    padding: SIZES.spacing_base,
    marginBottom: SIZES.spacing_md,
    borderWidth: 1,
    borderColor: '#e9edf1',
    shadowColor: '#043247',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  center: {
    alignItems: 'center',
    paddingVertical: SIZES.spacing_xl,
    gap: SIZES.spacing_sm,
  },
  bigIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stateTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  stateText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  solidButton: {
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_xl,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accentDeep,
  },
  solidButtonText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.spacing_sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  cardTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  count: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },
  subText: {
    marginTop: 2,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  hint: {
    marginTop: SIZES.spacing_xs,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },

  // Date + day strip (rounded day squares, like a calendar)
  longDate: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  dayMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SIZES.spacing_sm,
    marginTop: 2,
  },
  dayMeta: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  dayStrip: {
    gap: 10,
    paddingTop: SIZES.spacing_md,
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  dayPill: {
    width: 56,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#edf0f4',
    shadowColor: '#043247',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  dayPillActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primaryLight,
    shadowOpacity: 0.25,
  },
  dayPillWeek: {
    fontSize: 11,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
    letterSpacing: 0.4,
  },
  dayPillRule: {
    width: 18,
    height: 1,
    marginVertical: 3,
    backgroundColor: COLORS.border,
  },
  dayPillRuleActive: {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dayPillDate: {
    fontSize: SIZES.xl,
    lineHeight: 26,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  dayPillMark: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 3,
  },
  dayPillTextActive: {
    color: COLORS.white,
  },
  dayDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  // Day
  stopChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 2,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.cardBackground,
  },
  stopChipText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },

  flex: {
    flex: 1,
  },
  slotTitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  slotCount: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  // A part of the day: soft panel with a label, its stops in order.
  slot: {
    marginTop: SIZES.spacing_md,
    padding: SIZES.spacing_sm,
    borderRadius: SIZES.radius_lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: '#f6f8fb',
    gap: 6,
  },
  slotHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  slotEmpty: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#dbe2ea',
  },
  slotHover: {
    borderColor: COLORS.accent,
    borderStyle: 'dashed',
    backgroundColor: '#fff6ef',
  },
  slotAdd: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#e2e8ee',
  },
  slotEmptyHover: {
    borderColor: COLORS.accent,
    backgroundColor: '#fff6ef',
  },
  slotEmptyText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  slotEmptyTextHover: {
    color: COLORS.accentDeep,
    fontFamily: 'Poppins_600SemiBold',
  },
  // Between stops: how far the next one is, and free time.
  gapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 22,
    paddingVertical: 1,
  },
  gapLine: {
    width: 2,
    height: 16,
    borderRadius: 1,
    marginRight: 6,
    backgroundColor: '#cfdae5',
  },
  gapText: {
    flexShrink: 1,
    fontSize: 11,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  gapFrom: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },
  // Travel/free time next to the stop name: never shrinks, so it's never cut off.
  gapInfo: {
    flexShrink: 0,
    fontSize: 11,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  // Card: number circle (matches the map pin), title, time pill + type.
  stopNo: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopNoText: {
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#e6f1fa',
  },
  timePillText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  dropLine: {
    height: 3,
    borderRadius: 2,
    marginVertical: 2,
    backgroundColor: COLORS.accent,
  },

  // Item cards: photo first, side colour by type
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingVertical: 7,
    paddingLeft: 10,
    paddingRight: 8,
  },
  itemPhoto: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  itemIconTile: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    fontSize: SIZES.md,
    lineHeight: 19,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  itemWhenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemMeta: {
    flexShrink: 1,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: SIZES.radius_full,
  },
  typeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  typePillText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
  },
  notePill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#f2f4f7',
  },
  notePillText: {
    flexShrink: 1,
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  item: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#eef1f5',
    shadowColor: '#043247',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  itemOpen: {
    borderColor: '#d4e3f3',
  },
  itemBar: {
    width: 4,
  },
  itemMore: {
    alignSelf: 'center',
  },
  itemSaving: {
    opacity: 0.7,
  },
  itemDragging: {
    opacity: 0.35,
  },

  // Open item
  editor: {
    paddingHorizontal: SIZES.spacing_md,
    paddingBottom: SIZES.spacing_md,
    gap: SIZES.spacing_sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: SIZES.spacing_sm,
  },
  editorTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    paddingVertical: 6,
    paddingHorizontal: SIZES.spacing_sm,
    borderRadius: SIZES.radius_sm || 8,
    backgroundColor: COLORS.cardBackground,
  },
  editorLabel: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipOn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  chipTextOn: {
    color: COLORS.white,
  },
  pickerBox: {
    borderRadius: SIZES.radius_md,
    backgroundColor: COLORS.cardBackground,
    paddingBottom: SIZES.spacing_sm,
    alignItems: 'center',
  },
  picker: {
    height: 160,
    alignSelf: 'stretch',
  },
  pickerDone: {
    paddingHorizontal: SIZES.spacing_lg,
    paddingVertical: 8,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.primary,
  },
  pickerDoneText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  notesInput: {
    minHeight: 40,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 8,
    borderRadius: SIZES.radius_md,
    backgroundColor: COLORS.cardBackground,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
    textAlignVertical: 'top',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 4,
  },
  removeText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.error,
  },

  // Inline add
  addRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingLeft: SIZES.spacing_md,
    paddingRight: SIZES.spacing_sm,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  addInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },

  // Tray
  countBadge: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: SIZES.radius_full,
    alignItems: 'center',
    backgroundColor: '#fff1e8',
  },
  countBadgeText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.accentDeep,
  },
  trayGroup: {
    marginTop: SIZES.spacing_sm,
    gap: SIZES.spacing_sm,
  },
  trayGroupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  trayGroupTitle: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  trayGroupCount: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  trayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    padding: 6,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#eef1f5',
  },
  trayRowPicked: {
    borderColor: COLORS.accent,
  },
  trayPhoto: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  trayInfo: {
    flex: 1,
    minWidth: 0,
  },
  trayPlace: {
    fontSize: SIZES.md,
    lineHeight: 19,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  traySub: {
    marginTop: 1,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  planButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minWidth: 72,
    justifyContent: 'center',
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#fff1e8',
  },
  planButtonOn: {
    backgroundColor: COLORS.accentDeep,
  },
  planButtonText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.accentDeep,
  },
  planButtonTextOn: {
    color: COLORS.white,
  },
  pickRow: {
    marginTop: 6,
    marginLeft: 8,
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_md,
    backgroundColor: '#fff6ef',
    gap: SIZES.spacing_sm,
  },
  thumbEmpty: {
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  pickChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#ffd9c2',
  },
  pickChipText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },

  // Outside the trip
  clearText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.error,
  },
  outsideItem: {
    marginTop: SIZES.spacing_xs,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },

  // Drag overlay
  ghost: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 240,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    padding: SIZES.spacing_sm,
    paddingLeft: SIZES.spacing_md,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    shadowColor: '#043247',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 14,
  },
  ghostBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  ghostThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  ghostTitle: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  dockTextOn: {
    color: COLORS.white,
  },
  dockBin: {
    position: 'absolute',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
    shadowColor: '#043247',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: SIZES.radius_md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#f3b4b4',
    backgroundColor: '#fff5f5',
  },
  dockBinOn: {
    backgroundColor: COLORS.error,
    borderColor: COLORS.error,
    borderStyle: 'solid',
  },
  dockBinText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.error,
  },
  toast: {
    position: 'absolute',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },
  toastText: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.white,
  },
  toastUndo: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_700Bold',
    color: '#ffb27a',
  },
});
