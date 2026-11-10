import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import {
  JOURNAL_VIBES,
  getMyTrips,
  getTripById,
  getPlaceDetails,
  journalCategoryFor,
  searchRadiusFor,
  placeCoords,
  searchAnyPlace,
  reverseGeocode,
} from '../services';
import PlaceSearchField from '../components/PlaceSearchField';
import { startStoryUpload, isStoryUploading } from '../services/storyUpload';

const MAX_PHOTOS = 10;
const MAX_PLACES = 20;
const PLACE_ICONS = { food: 'coffee', stay: 'home', attraction: 'camera', other: 'map-pin' };

/** A trip's saved-place category ("stays", "food", ...) as a journal place category. */
function categoryFromTrip(category) {
  const c = (category || '').toLowerCase();
  if (c.startsWith('stay')) return 'stay';
  if (c === 'food' || c.startsWith('restaurant')) return 'food';
  return 'attraction';
}

/** "Karnataka, India" -> "India": the country is the last part of an address line. */
function countryOf(secondary) {
  const parts = (secondary || '').split(',').map((x) => x.trim()).filter(Boolean);
  return parts[parts.length - 1] || '';
}

/**
 * Share a trip story — one screen:
 *
 *  - Photos: "Add photos" opens the library (up to 10, in selection order).
 *    Picked photos show as a strip in the order picked: tap one to mark it as
 *    the cover (highlighted, nothing moves), ✕ to remove, "+" to add more.
 *    The cover is uploaded first, since the feed uses the first photo. Photos are optional (stories without one show a
 *    destination gradient in the feed).
 *  - Title + story (the "caption").
 *  - Destination: a Google search for a city or region ("Bengaluru"), or one
 *    of your Wayraa trips (fills dates, travellers and the trip's saved places).
 *  - Places you went: tag the spots you visited ("Guerrilla Diner"), searched
 *    only inside the destination once one is set. They show as "Places
 *    mentioned" on the story and open each place's page.
 *  - Vibes, an optional pro tip and budget, and who can see it.
 *
 * Sharing hands the post to the background uploader (services/storyUpload)
 * and goes straight back to the Community feed, which shows a progress card
 * until it's live — like Instagram. Opens over the tabs, sliding up.
 */
/** A place page's category (stays / food / activities) as a journal category. */
function categoryFromPlacePage(category) {
  const c = (category || '').toLowerCase();
  if (c.startsWith('stay')) return 'stay';
  if (c === 'food' || c.startsWith('restaurant')) return 'food';
  if (c) return 'attraction';
  return 'other';
}

/** City from an address line: "…, Bengaluru, Karnataka 560008, India" -> "Bengaluru". */
function cityFromAddress(address) {
  const parts = (address || '').split(',').map((x) => x.replace(/\d+/g, '').trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 3];
  return parts[0] || '';
}

export default function WriteJournalScreen({ navigation, route }) {
  const prefillPlace = route?.params?.prefillPlace || null;
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState([]); // picker assets, in picked order
  const [coverIndex, setCoverIndex] = useState(0);

  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [destination, setDestination] = useState(''); // city text saved on the story
  // The chosen destination as shown: { kind: 'region'|'trip', name, secondary }.
  const [where, setWhere] = useState(null);
  // Where to search for "Places you went": { name, lat, lng, radius } or null.
  const [area, setArea] = useState(null);
  const [trip, setTrip] = useState(null); // picked trip (fills dates etc.)
  // Tagged places: { placeName, googlePlaceId, category, fromTrip? }.
  const [places, setPlaces] = useState([]);
  const [myTrips, setMyTrips] = useState([]);
  const [vibes, setVibes] = useState([]);
  const [tips, setTips] = useState('');
  const [budget, setBudget] = useState('');
  const [visibility, setVisibility] = useState('public');

  const [error, setError] = useState('');

  // Your trips, for one-tap "where was it".
  useEffect(() => {
    getMyTrips().then((t) => setMyTrips(Array.isArray(t) ? t : [])).catch(() => {});
  }, []);

  // Opened from a place's "Share a story": tag the place, and set its city as
  // the destination (the phone's geocoder, else the address), matched to
  // Google's city so the place search is limited to it like a normal pick.
  useEffect(() => {
    if (!prefillPlace?.placeId) return;
    let cancelled = false;
    addPlaces([{
      placeName: prefillPlace.name,
      googlePlaceId: prefillPlace.placeId,
      category: categoryFromPlacePage(prefillPlace.category),
    }]);
    (async () => {
      const c = prefillPlace.coords;
      const city = (c && await reverseGeocode(c.lat, c.lng)) || cityFromAddress(prefillPlace.address);
      if (!city || cancelled) return;
      const near = c ? { lat: c.lat, lng: c.lng, radius: 50000 } : null;
      const matches = await searchAnyPlace(city, { regionsOnly: true, near });
      if (cancelled) return;
      if (matches[0]) {
        pickWhere(matches[0]);
      } else {
        // No match: still show the city, searching around the place itself.
        setWhere({ kind: 'region', name: city, secondary: '' });
        setDestination(city);
        if (c) setArea({ name: city, lat: c.lat, lng: c.lng, radius: 50000 });
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  async function pickPhotos() {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      Alert.alert('That\'s the limit', `A story can have up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos access needed', 'Allow access to your photos in Settings to add them to your story.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: room,
      quality: 1,
    });
    if (result.canceled || !result.assets?.length) return;
    setPhotos((prev) => [...prev, ...result.assets].slice(0, MAX_PHOTOS));
  }

  // Keep the cover pointing at the same photo when another one is removed;
  // if the cover itself goes, the first photo becomes the cover.
  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setCoverIndex((c) => (index === c ? 0 : index < c ? c - 1 : c));
  };

  // Add places to the tagged list, skipping ones already there.
  const addPlaces = (list) => setPlaces((prev) => {
    const seen = new Set(prev.map((p) => p.googlePlaceId || p.placeName));
    const fresh = list.filter((p) => !seen.has(p.googlePlaceId || p.placeName));
    return [...prev, ...fresh].slice(0, MAX_PLACES);
  });
  const removePlace = (key) => setPlaces((prev) => prev.filter((p) => (p.googlePlaceId || p.placeName) !== key));

  const clearWhere = () => {
    if (trip) setPlaces((prev) => prev.filter((p) => !p.fromTrip));
    setWhere(null);
    setTrip(null);
    setArea(null);
    setDestination('');
  };

  // A destination from the search: a city or region. Its coordinates then
  // keep the "Places you went" search inside it.
  const pickWhere = async (r) => {
    if (trip) setPlaces((prev) => prev.filter((p) => !p.fromTrip));
    setTrip(null);
    const country = countryOf(r.secondary);
    setWhere({ kind: 'region', name: r.name, secondary: r.secondary });
    setDestination(country && country !== r.name ? `${r.name}, ${country}` : r.name);
    setArea(null);
    const radius = searchRadiusFor(r.types);
    if (!radius) return; // a whole country: search places anywhere
    const coords = placeCoords(await getPlaceDetails(r.placeId));
    if (coords) setArea({ name: r.name, ...coords, radius });
  };

  // One of your trips: fills where, dates, travellers and the trip's saved places.
  const pickTrip = async (t) => {
    if (trip?.id === t.id) {
      clearWhere();
      return;
    }
    setPlaces((prev) => prev.filter((p) => !p.fromTrip));
    setArea(null);
    setTrip(t);
    setWhere({ kind: 'trip', name: t.primaryDestination || t.name, secondary: `From your trip · ${t.name}` });
    setDestination(t.primaryDestination || t.name || '');
    if (!title.trim()) setTitle(t.name || '');
    try {
      const full = await getTripById(t.id);
      const stops = [...(full?.destinations || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const first = stops[0];
      if (first && Number.isFinite(first.latitude) && Number.isFinite(first.longitude)) {
        // Multi-stop trips search wider so places at every stop can be found.
        setArea({
          name: t.primaryDestination || first.name,
          lat: first.latitude,
          lng: first.longitude,
          radius: stops.length > 1 ? 400000 : 50000,
        });
      }
      const saved = stops.flatMap((d) => d.places || []).map((p) => ({
        placeName: p.placeName,
        googlePlaceId: p.placeId,
        category: categoryFromTrip(p.category),
        fromTrip: true,
      }));
      addPlaces(saved);
    } catch {
      // The trip still sets where and when; places can be added by hand.
    }
  };

  const toggleVibe = (v) => {
    setVibes((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const close = () => {
    const dirty = photos.length || title.trim() || story.trim();
    if (!dirty) {
      navigation.goBack();
      return;
    }
    Alert.alert('Discard this story?', 'Your photos and text won\'t be saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  const missing = !title.trim() ? 'a title' : !story.trim() ? 'your story' : !destination.trim() ? 'where it was' : null;

  const share = () => {
    if (missing) {
      setError(`Add ${missing} to share.`);
      return;
    }
    if (isStoryUploading()) {
      Alert.alert('Still posting', 'Your last story is still uploading. Try again once it\'s posted.');
      return;
    }
    const amount = parseFloat(budget.replace(/[^\d.]/g, ''));
    const hasBudget = Number.isFinite(amount) && amount > 0;
    startStoryUpload({
      title: title.trim(),
      body: story.trim(),
      destination: destination.trim(),
      tripId: trip?.id || null,
      startDate: trip?.startDate || null,
      endDate: trip?.endDate || null,
      travelersCount: trip?.travelersCount || null,
      budget: hasBudget ? amount : null,
      currency: hasBudget ? (trip?.currency || '₹') : null,
      proTips: tips.trim() || null,
      vibes,
      visibility,
      places: places.map((p) => ({ placeName: p.placeName, category: p.category, googlePlaceId: p.googlePlaceId || null })),
    }, [photos[coverIndex], ...photos.filter((_, i) => i !== coverIndex)].filter(Boolean));
    // Back to the feed at once; it shows the upload's progress.
    navigation.navigate('Main', { screen: 'Community', params: { screen: 'CommunityHome' } });
  };

  return (
    <View style={[styles.light, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.topBar, styles.topBarLight]}>
        <TouchableOpacity onPress={close} hitSlop={10} accessibilityLabel="Close">
          <Feather name="x" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>New story</Text>
        <TouchableOpacity onPress={share} hitSlop={10} accessibilityRole="button" accessibilityLabel="Share">
          <Text style={styles.shareText}>Share</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Photos */}
          {photos.length === 0 ? (
            <TouchableOpacity
              style={styles.addPhotos}
              onPress={pickPhotos}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Add photos, up to ${MAX_PHOTOS}`}
            >
              <View style={styles.addPhotosIcon}>
                <Feather name="camera" size={22} color={COLORS.accentDeep} />
              </View>
              <Text style={styles.addPhotosTitle}>Add photos</Text>
              <Text style={styles.addPhotosHint}>Up to {MAX_PHOTOS} from your trip</Text>
            </TouchableOpacity>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.stripScroll}
                contentContainerStyle={styles.strip}
              >
                {photos.map((p, i) => (
                  <TouchableOpacity
                    key={`${p.uri}-${i}`}
                    onPress={() => setCoverIndex(i)}
                    activeOpacity={0.85}
                    style={[styles.thumb, i === coverIndex && styles.thumbCover]}
                    accessibilityState={{ selected: i === coverIndex }}
                    accessibilityLabel={i === coverIndex ? `Photo ${i + 1}, cover` : `Photo ${i + 1}, set as cover`}
                  >
                    <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    {i === coverIndex && (
                      <View style={styles.coverBadge}><Text style={styles.coverBadgeText}>Cover</Text></View>
                    )}
                    <TouchableOpacity
                      style={styles.thumbRemove}
                      onPress={() => removePhoto(i)}
                      hitSlop={6}
                      accessibilityLabel={`Remove photo ${i + 1}`}
                    >
                      <Feather name="x" size={12} color={COLORS.white} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <TouchableOpacity style={[styles.thumb, styles.thumbAdd]} onPress={pickPhotos} accessibilityLabel="Add more photos">
                    <Feather name="plus" size={24} color={COLORS.accentDeep} />
                  </TouchableOpacity>
                )}
              </ScrollView>
              {photos.length > 1 && <Text style={styles.stripHint}>Tap a photo to set it as the cover</Text>}
            </>
          )}

          {/* Title + story */}
          <View style={styles.caption}>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Give your story a title"
              placeholderTextColor={COLORS.textMuted}
              maxLength={120}
              accessibilityLabel="Title"
            />
            <TextInput
              style={styles.storyInput}
              value={story}
              onChangeText={setStory}
              placeholder="Write a caption… what made this trip special?"
              placeholderTextColor={COLORS.textMuted}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Your story"
            />
          </View>

          {/* Destination */}
          <Text style={styles.label}>Destination</Text>
          <Text style={styles.hint}>The city or region you visited</Text>
          {where ? (
            <View style={styles.whereCard}>
              <View style={styles.whereIcon}>
                <Feather name={where.kind === 'trip' ? 'briefcase' : 'map-pin'} size={16} color={COLORS.accentDeep} />
              </View>
              <View style={styles.whereText}>
                <Text style={styles.whereName} numberOfLines={1}>{where.name}</Text>
                {!!where.secondary && <Text style={styles.whereSub} numberOfLines={1}>{where.secondary}</Text>}
              </View>
              <TouchableOpacity onPress={clearWhere} hitSlop={10} accessibilityLabel="Change destination">
                <Feather name="x" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : (
            <PlaceSearchField
              icon="map-pin"
              placeholder="Search a city or region"
              regionsOnly
              onSelect={pickWhere}
            />
          )}
          {myTrips.length > 0 && (
            <>
              <Text style={styles.subLabel}>Or pick one of your trips (fills dates, travellers and places)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
                {myTrips.map((t) => {
                  const on = trip?.id === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.tripChip, on && styles.tripChipOn]}
                      onPress={() => pickTrip(t)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Feather name={on ? 'check' : 'briefcase'} size={13} color={on ? COLORS.white : COLORS.primary} />
                      <Text style={[styles.tripChipText, on && styles.tripChipTextOn]} numberOfLines={1}>{t.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* Places you went */}
          <Text style={styles.label}>Places you went <Text style={styles.optional}>(optional)</Text></Text>
          <Text style={styles.hint}>
            {area ? `Cafés, stays and sights in ${area.name}` : 'Cafés, stays and sights. Pick a destination first to search inside it.'}
          </Text>
          {places.length > 0 && (
            <View style={styles.placeChips}>
              {places.map((p) => {
                const key = p.googlePlaceId || p.placeName;
                return (
                  <View key={key} style={styles.placeChip}>
                    <Feather name={PLACE_ICONS[p.category] || 'map-pin'} size={13} color={COLORS.accentDeep} />
                    <Text style={styles.placeChipText} numberOfLines={1}>{p.placeName}</Text>
                    <TouchableOpacity onPress={() => removePlace(key)} hitSlop={8} accessibilityLabel={`Remove ${p.placeName}`}>
                      <Feather name="x" size={14} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
          {places.length < MAX_PLACES && (
            <PlaceSearchField
              // New area -> fresh field (clears any half-typed search).
              key={area ? `${area.lat},${area.lng}` : 'anywhere'}
              icon="plus"
              placeholder={area ? `Search places in ${area.name}` : 'Add a café, stay or sight'}
              near={area}
              clearOnSelect
              onSelect={(r) => addPlaces([{ placeName: r.name, googlePlaceId: r.placeId, category: journalCategoryFor(r.types) }])}
            />
          )}

          {/* Vibes */}
          <Text style={styles.label}>Vibes</Text>
          <View style={styles.vibes}>
            {JOURNAL_VIBES.map((v) => {
              const on = vibes.includes(v);
              return (
                <TouchableOpacity
                  key={v}
                  style={[styles.vibe, on && styles.vibeOn]}
                  onPress={() => toggleVibe(v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Text style={[styles.vibeText, on && styles.vibeTextOn]}>{v}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Extras */}
          <Text style={styles.label}>Pro tip <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            style={[styles.box, styles.tipsInput]}
            value={tips}
            onChangeText={setTips}
            placeholder="Something you'd tell a friend going there"
            placeholderTextColor={COLORS.textMuted}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Pro tip"
          />

          <Text style={styles.label}>Total budget <Text style={styles.optional}>(optional)</Text></Text>
          <View style={styles.inputRow}>
            <Text style={styles.currency}>{trip?.currency || '₹'}</Text>
            <TextInput
              style={styles.rowInput}
              value={budget}
              onChangeText={setBudget}
              placeholder="0"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
              accessibilityLabel="Total budget"
            />
          </View>

          {/* Audience */}
          <Text style={styles.label}>Who can see it</Text>
          <View style={styles.audience}>
            {[
              { key: 'public', icon: 'globe', label: 'Everyone', hint: 'Shown in Community' },
              { key: 'private', icon: 'lock', label: 'Only me', hint: 'Saved privately' },
            ].map((o) => {
              const on = visibility === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.audienceOption, on && styles.audienceOptionOn]}
                  onPress={() => setVisibility(o.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Feather name={o.icon} size={17} color={on ? COLORS.accentDeep : COLORS.textSecondary} />
                  <View style={styles.flex}>
                    <Text style={[styles.audienceLabel, on && styles.audienceLabelOn]}>{o.label}</Text>
                    <Text style={styles.audienceHint}>{o.hint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.shareButton, !!missing && styles.shareButtonOff]}
            onPress={share}
            activeOpacity={0.9}
            accessibilityRole="button"
          >
            <Text style={styles.shareButtonText}>Share story</Text>
          </TouchableOpacity>
          {!!missing && <Text style={styles.missing}>Add {missing} to share</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  light: { flex: 1, backgroundColor: COLORS.white },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.spacing_base,
    height: 52,
  },
  topBarLight: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  topTitle: { fontSize: SIZES.lg, fontFamily: 'Poppins_600SemiBold', color: COLORS.textPrimary },
  shareText: { fontSize: SIZES.base, fontFamily: 'Poppins_600SemiBold', color: COLORS.accentDeep },

  form: { padding: SIZES.spacing_base },
  addPhotos: {
    alignItems: 'center', justifyContent: 'center', height: 150, borderRadius: SIZES.radius_xl,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#ffc8a8', backgroundColor: '#fff8f3',
  },
  addPhotosIcon: {
    width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#ffe8d9', marginBottom: SIZES.spacing_sm,
  },
  addPhotosTitle: { fontSize: SIZES.base, fontFamily: 'Poppins_600SemiBold', color: COLORS.textPrimary },
  addPhotosHint: { fontSize: SIZES.sm, fontFamily: 'Poppins_400Regular', color: COLORS.textSecondary },
  stripScroll: { marginHorizontal: -SIZES.spacing_base, flexGrow: 0 },
  strip: { gap: SIZES.spacing_sm, paddingHorizontal: SIZES.spacing_base },
  thumb: { width: 96, height: 120, borderRadius: SIZES.radius_md, overflow: 'hidden', backgroundColor: COLORS.cardBackground },
  thumbCover: { borderWidth: 3, borderColor: COLORS.accent },
  thumbAdd: {
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff8f3',
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#ffc8a8',
  },
  coverBadge: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,0.55)' },
  coverBadgeText: { textAlign: 'center', fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: COLORS.white },
  thumbRemove: {
    position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)',
  },
  stripHint: { marginTop: SIZES.spacing_sm, fontSize: SIZES.sm, fontFamily: 'Poppins_400Regular', color: COLORS.textSecondary },
  caption: { marginTop: SIZES.spacing_base },
  titleInput: { fontSize: SIZES.lg, fontFamily: 'Poppins_600SemiBold', color: COLORS.textPrimary, paddingVertical: 4 },
  storyInput: {
    minHeight: 110, fontSize: SIZES.md, lineHeight: 21, fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary, paddingVertical: 4,
  },

  label: {
    marginTop: SIZES.spacing_lg, marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.md, fontFamily: 'Poppins_600SemiBold', color: COLORS.textPrimary,
  },
  optional: { fontFamily: 'Poppins_400Regular', color: COLORS.textMuted },
  hint: {
    marginTop: -4,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  whereCard: {
    flexDirection: 'row', alignItems: 'center', gap: SIZES.spacing_md, minHeight: 56,
    paddingHorizontal: SIZES.spacing_md, borderRadius: SIZES.radius_md,
    borderWidth: 1, borderColor: '#ffd9c2', backgroundColor: '#fffaf6',
  },
  whereIcon: {
    width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffe8d9',
  },
  whereText: { flex: 1, minWidth: 0 },
  whereName: { fontSize: SIZES.md, fontFamily: 'Poppins_600SemiBold', color: COLORS.textPrimary },
  whereSub: { fontSize: SIZES.sm, fontFamily: 'Poppins_400Regular', color: COLORS.textSecondary },
  placeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.spacing_sm, marginBottom: SIZES.spacing_sm },
  placeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%',
    paddingLeft: SIZES.spacing_md, paddingRight: SIZES.spacing_sm, paddingVertical: 7,
    borderRadius: SIZES.radius_full, backgroundColor: '#fff1e8',
  },
  placeChipText: { flexShrink: 1, fontSize: SIZES.sm, fontFamily: 'Poppins_500Medium', color: COLORS.textPrimary },
  subLabel: { marginTop: SIZES.spacing_sm, fontSize: SIZES.sm, fontFamily: 'Poppins_400Regular', color: COLORS.textSecondary },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: SIZES.spacing_sm, height: 48,
    paddingHorizontal: SIZES.spacing_base, borderRadius: SIZES.radius_md, borderWidth: 1, borderColor: COLORS.border,
  },
  rowInput: { flex: 1, fontSize: SIZES.base, fontFamily: 'Poppins_400Regular', color: COLORS.textPrimary },
  currency: { fontSize: SIZES.base, fontFamily: 'Poppins_600SemiBold', color: COLORS.textSecondary },
  chipScroll: { marginHorizontal: -SIZES.spacing_base, marginTop: SIZES.spacing_sm, flexGrow: 0 },
  chips: { gap: SIZES.spacing_sm, paddingHorizontal: SIZES.spacing_base },
  tripChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 200,
    paddingHorizontal: SIZES.spacing_md, paddingVertical: 7, borderRadius: SIZES.radius_full, backgroundColor: '#e6f4fb',
  },
  tripChipOn: { backgroundColor: COLORS.primary },
  tripChipText: { flexShrink: 1, fontSize: SIZES.sm, fontFamily: 'Poppins_500Medium', color: COLORS.primary },
  tripChipTextOn: { color: COLORS.white, fontFamily: 'Poppins_600SemiBold' },
  vibes: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.spacing_sm },
  vibe: {
    paddingHorizontal: SIZES.spacing_md, paddingVertical: 7, borderRadius: SIZES.radius_full,
    borderWidth: 1, borderColor: COLORS.border,
  },
  vibeOn: { backgroundColor: '#fff1e8', borderColor: COLORS.accent },
  vibeText: { fontSize: SIZES.sm, fontFamily: 'Poppins_500Medium', color: COLORS.textPrimary },
  vibeTextOn: { color: COLORS.accentDeep, fontFamily: 'Poppins_600SemiBold' },
  box: {
    borderRadius: SIZES.radius_md, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SIZES.spacing_base, paddingVertical: SIZES.spacing_md,
    fontSize: SIZES.md, fontFamily: 'Poppins_400Regular', color: COLORS.textPrimary,
  },
  tipsInput: { minHeight: 80 },
  audience: { flexDirection: 'row', gap: SIZES.spacing_sm },
  audienceOption: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: SIZES.spacing_sm, padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_md, borderWidth: 1.5, borderColor: COLORS.border,
  },
  audienceOptionOn: { borderColor: COLORS.accent, backgroundColor: '#fffaf6' },
  audienceLabel: { fontSize: SIZES.md, fontFamily: 'Poppins_600SemiBold', color: COLORS.textPrimary },
  audienceLabelOn: { color: COLORS.accentDeep },
  audienceHint: { fontSize: SIZES.xs, fontFamily: 'Poppins_400Regular', color: COLORS.textSecondary },
  error: { marginTop: SIZES.spacing_base, fontSize: SIZES.sm, fontFamily: 'Poppins_500Medium', color: '#d32f2f' },
  shareButton: {
    marginTop: SIZES.spacing_xl, height: 52, borderRadius: SIZES.radius_full,
    justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.accentDeep,
  },
  shareButtonOff: { opacity: 0.5 },
  shareButtonText: { fontSize: SIZES.lg, fontFamily: 'Poppins_600SemiBold', color: COLORS.white },
  missing: { marginTop: SIZES.spacing_sm, textAlign: 'center', fontSize: SIZES.sm, fontFamily: 'Poppins_400Regular', color: COLORS.textMuted },
});
