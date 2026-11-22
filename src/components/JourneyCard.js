import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import RankBadge from './RankBadge';
import { RANK_LOOKS } from '../utils/ranks';

/**
 * "Your journey" on the profile: your rank's emblem, a progress bar to the
 * next rank with a checklist of what's still missing, and the whole ladder
 * (earned ranks in colour, the ones ahead greyed out with a lock).
 *
 * @param {object} rank           from rankFromProfile()
 * @param {(level) => void} onOpenRank  tap an emblem: that rank's sheet
 * @param {() => void} onOpenHow  "How ranks work"
 */
export default function JourneyCard({ rank, onOpenRank, onOpenHow }) {
  const { level, look, points, next, nextLook, checks, percent, ladder } = rank;
  const total = Math.min(ladder.length, RANK_LOOKS.length);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.top}
        onPress={() => onOpenRank(level)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Your rank: ${look.name}, rank ${level + 1} of ${total}, ${points} points. Details`}
      >
        <RankBadge level={level} size={72} />
        <View style={styles.topText}>
          <Text style={styles.kicker}>Your rank</Text>
          <Text style={styles.title}>{look.name}</Text>
          <Text style={styles.sub}>Rank {level + 1} of {total} · {points.toLocaleString('en')} points</Text>
        </View>
      </TouchableOpacity>

      {next ? (
        <View style={styles.next}>
          <View style={styles.nextHead}>
            <Text style={styles.nextLabel}>Next: <Text style={styles.nextName}>{nextLook.name}</Text></Text>
            <Text style={styles.nextPts}>
              {points.toLocaleString('en')} / {next.points.toLocaleString('en')}
            </Text>
          </View>
          <View
            style={styles.bar}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Points toward ${nextLook.name}`}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(percent * 100) }}
          >
            <LinearGradient
              colors={[look.palette[0], COLORS.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.barFill, { width: `${Math.max(4, percent * 100)}%` }]}
            />
          </View>
          <View style={styles.checks}>
            {checks.map((c) => (
              <View key={c.key} style={styles.check}>
                <View style={[styles.dot, c.done && styles.dotDone]}>
                  {c.done && <Feather name="check" size={10} color={COLORS.white} />}
                </View>
                <Text style={[styles.checkText, c.done && styles.checkDone]}>{c.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.next}>
          <Text style={styles.topRank}>You've reached the top rank. Safe travels!</Text>
        </View>
      )}

      {/* The ladder */}
      <View style={styles.ladder}>
        <View style={styles.ladderLine} />
        {RANK_LOOKS.slice(0, total).map((l, i) => (
          <TouchableOpacity
            key={l.name}
            style={styles.step}
            onPress={() => onOpenRank(i)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${l.name}, ${i <= level ? 'earned' : 'locked'}`}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <View style={[styles.stepBadge, i === level && styles.stepCurrent]}>
              <RankBadge level={i} size={38} locked={i > level} />
            </View>
            <Text style={[styles.stepName, i === level && styles.stepNameCurrent]} numberOfLines={1}>
              {l.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity onPress={onOpenHow} style={styles.how} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.howText}>How ranks work</Text>
        <Feather name="chevron-right" size={14} color={COLORS.accentDeep} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: SIZES.radius_xl,
    backgroundColor: COLORS.white,
    padding: SIZES.spacing_base,
    gap: SIZES.spacing_base,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
  },
  topText: { flex: 1, minWidth: 0 },
  kicker: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  sub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  next: {
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.backgroundWarm,
    padding: SIZES.spacing_md,
    gap: 10,
  },
  nextHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextLabel: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  nextName: { fontFamily: 'Poppins_600SemiBold', color: COLORS.textPrimary },
  nextPts: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  bar: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#DCE3E8',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 5 },
  checks: { gap: 6 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#B9C6D1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { borderColor: COLORS.success, backgroundColor: COLORS.success },
  checkText: {
    flex: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  checkDone: { color: COLORS.textMuted, textDecorationLine: 'line-through' },
  topRank: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  ladder: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ladderLine: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 21,
    height: 2,
    backgroundColor: '#DCE3E8',
  },
  step: { width: 50, alignItems: 'center', gap: 4 },
  stepBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  stepCurrent: { borderColor: COLORS.accent },
  stepName: {
    fontSize: 9.5,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  stepNameCurrent: { fontFamily: 'Poppins_600SemiBold', color: COLORS.textPrimary },
  how: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 2,
  },
  howText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
});
