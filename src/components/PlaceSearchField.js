import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { searchAnyPlace, isRegionResult, journalCategoryFor } from '../services';

const CATEGORY_ICONS = { food: 'coffee', stay: 'home', attraction: 'camera', other: 'map-pin' };
const DEBOUNCE_MS = 300;
const MAX_RESULTS = 6;

/** Icon for a search result: a pin for a city / area, else by category. */
export function placeIconFor(result) {
  return isRegionResult(result) ? 'map-pin' : CATEGORY_ICONS[journalCategoryFor(result?.types)] || 'map-pin';
}

/**
 * Google place search with inline suggestions (cities and specific places,
 * e.g. "Bengaluru" or "Guerrilla Diner"). Results show under the field (not
 * floating), so they work inside a ScrollView; pick one to call onSelect.
 *
 * @param {(result) => void} onSelect  result: { placeId, name, secondary, types }
 * @param {string} placeholder
 * @param {string} [icon]               Feather icon in the field
 * @param {boolean} [clearOnSelect]     empty the field after a pick (adding to a list)
 * @param {boolean} [regionsOnly]       suggest cities / regions only
 * @param {{ lat, lng, radius }} [near] only suggest places inside this area
 * @param {boolean} [autoFocus]       focus the field (and open the keyboard) on mount
 */
export default function PlaceSearchField({
  onSelect,
  placeholder,
  icon = 'search',
  clearOnSelect = false,
  regionsOnly = false,
  near = null,
  autoFocus = false,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const latest = useRef('');

  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (text) => {
    setQuery(text);
    clearTimeout(timer.current);
    const q = text.trim();
    latest.current = q;
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const found = await searchAnyPlace(q, { regionsOnly, near });
      if (latest.current !== q) return; // a newer query is on its way
      setResults(found.slice(0, MAX_RESULTS));
      setLoading(false);
    }, DEBOUNCE_MS);
  };

  const pick = (result) => {
    setResults([]);
    setQuery(clearOnSelect ? '' : result.name);
    latest.current = '';
    onSelect(result);
  };

  return (
    <View>
      <View style={styles.field}>
        <Feather name={icon} size={17} color={COLORS.accent} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType="search"
          accessibilityLabel={placeholder}
        />
        {loading && <ActivityIndicator size="small" color={COLORS.accent} />}
        {!loading && !!query && (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={8} accessibilityLabel="Clear">
            <Feather name="x-circle" size={17} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {results.length > 0 && (
        <View style={styles.results} accessibilityRole="list">
          {results.map((r, i) => (
            <TouchableOpacity
              key={r.placeId}
              style={[styles.result, i > 0 && styles.resultDivider]}
              onPress={() => pick(r)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${r.name}${r.secondary ? `, ${r.secondary}` : ''}`}
            >
              <View style={styles.resultIcon}>
                <Feather name={placeIconFor(r)} size={15} color={COLORS.primary} />
              </View>
              <View style={styles.resultText}>
                <Text style={styles.resultName} numberOfLines={1}>{r.name}</Text>
                {!!r.secondary && <Text style={styles.resultSub} numberOfLines={1}>{r.secondary}</Text>}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    height: 48,
    paddingHorizontal: SIZES.spacing_base,
    borderRadius: SIZES.radius_md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  input: {
    flex: 1,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  results: {
    marginTop: 6,
    borderRadius: SIZES.radius_md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    minHeight: 52,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: SIZES.spacing_sm,
  },
  resultDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ECF1F5',
  },
  resultText: {
    flex: 1,
    minWidth: 0,
  },
  resultName: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  resultSub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
});
