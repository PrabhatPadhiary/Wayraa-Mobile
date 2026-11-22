import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants';
import RankBadge from './RankBadge';
import { RANK_LOOKS, rankNeeds } from '../utils/ranks';

/**
 * Rank details, as a bottom sheet. Either one rank (its emblem, what it takes,
 * and whether you have it) or "How ranks work" (the points list).
 *
 * @param {boolean} visible
 * @param {object} rank        from rankFromProfile()
 * @param {number|'how'} show  a rank's level, or 'how'
 * @param {(show) => void} onShow  switch what the sheet shows
 * @param {() => void} onClose
 */
export default function RankSheet({ visible, rank, show, onShow, onClose }) {
  const insets = useSafeAreaInsets();
  if (!rank) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SIZES.spacing_base }]}>
          <View style={styles.grabber} />
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
            <Feather name="x" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {show === 'how'
              ? <HowItWorks rank={rank} onOpenRank={onShow} />
              : <OneRank rank={rank} level={show} onHow={() => onShow('how')} />}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function OneRank({ rank, level, onHow }) {
  const look = RANK_LOOKS[level];
  const step = rank.ladder[level];
  if (!look || !step) return null;
  const earned = level <= rank.level;
  const isNext = level === rank.level + 1;
  const status = level === rank.level ? "You're here" : earned ? 'Earned' : 'Locked';

  return (
    <View style={styles.one}>
      <RankBadge level={level} size={132} locked={!earned} />
      <View style={[styles.status, earned ? styles.statusOn : styles.statusOff]}>
        <Feather name={earned ? 'check' : 'lock'} size={12} color={earned ? COLORS.success : COLORS.textSecondary} />
        <Text style={[styles.statusText, earned && styles.statusTextOn]}>{status}</Text>
      </View>
      <Text style={styles.rankNum}>Rank {level + 1} of {Math.min(rank.ladder.length, RANK_LOOKS.length)}</Text>
      <Text style={styles.rankName}>{look.name}</Text>
      <Text style={styles.tag}>{look.tag}</Text>

      <View style={styles.needs}>
        {rankNeeds(step).map((n, i) => (
          <View key={n} style={[styles.chip, i === 0 && step.points > 0 && styles.chipPts]}>
            <Text style={[styles.chipText, i === 0 && step.points > 0 && styles.chipPtsText]}>{n}</Text>
          </View>
        ))}
      </View>

      {isNext && rank.checks.length > 0 && (
        <View style={styles.left}>
          <Text style={styles.leftTitle}>Still to do</Text>
          {rank.checks.map((c) => (
            <View key={c.key} style={styles.check}>
              <Feather name={c.done ? 'check-circle' : 'circle'} size={15} color={c.done ? COLORS.success : '#B9C6D1'} />
              <Text style={styles.checkText}>{c.label}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity onPress={onHow} style={styles.howLink} accessibilityRole="button">
        <Text style={styles.howLinkText}>How to earn points</Text>
        <Feather name="chevron-right" size={14} color={COLORS.accentDeep} />
      </TouchableOpacity>
    </View>
  );
}

function HowItWorks({ rank, onOpenRank }) {
  const e = rank.earn;
  const rows = [
    { icon: 'book-open', title: 'Share a story', sub: 'Public, with at least one photo', pts: e.story },
    { icon: 'flag', title: 'Take a trip', sub: 'Its dates have passed, and you planned it before it ended', pts: e.tripTaken },
    { icon: 'map', title: 'Plan a trip', sub: 'With at least one destination', pts: e.tripPlanned },
    { icon: 'map-pin', title: 'Visit a new city', sub: 'Each city on a trip you\'ve taken counts once', pts: e.city },
    { icon: 'heart', title: 'Get a like on a story', sub: `Up to ${e.likeCap} points from likes`, pts: e.like },
    { icon: 'bookmark', title: 'Add a place to a trip', sub: `Up to ${e.placeCap} points from places`, pts: e.place },
  ];
  return (
    <View>
      <Text style={styles.howTitle}>How ranks work</Text>
      <Text style={styles.howIntro}>
        Earn points for what you do on Wayraa. Sharing stories is worth the most, because it helps other travellers.
        The higher ranks also need real stories, cities and trips, not just points.
      </Text>
      <View style={styles.rows}>
        {rows.map((r, i) => (
          <View key={r.title} style={[styles.row, i < rows.length - 1 && styles.rowLine]}>
            <View style={styles.rowIcon}><Feather name={r.icon} size={17} color={COLORS.primary} /></View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{r.title}</Text>
              <Text style={styles.rowSub}>{r.sub}</Text>
            </View>
            <Text style={styles.rowPts}>+{r.pts}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.ladderTitle}>The ranks</Text>
      {rank.ladder.slice(0, RANK_LOOKS.length).map((step, i) => (
        <TouchableOpacity
          key={step.name}
          style={styles.ladderRow}
          onPress={() => onOpenRank(i)}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <RankBadge level={i} size={40} locked={i > rank.level} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{RANK_LOOKS[i].name}</Text>
            <Text style={styles.rowSub}>{rankNeeds(step).join(' · ')}</Text>
          </View>
          {i === rank.level && <Text style={styles.here}>You</Text>}
          <Feather name="chevron-right" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '88%',
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_sm,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    backgroundColor: COLORS.white,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DCE3E8',
    marginBottom: SIZES.spacing_sm,
  },
  close: {
    position: 'absolute',
    top: SIZES.spacing_base,
    right: SIZES.spacing_base,
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.backgroundWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingTop: SIZES.spacing_sm, paddingBottom: SIZES.spacing_base },

  one: { alignItems: 'center' },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: SIZES.spacing_md,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusOn: { backgroundColor: '#E6F3EC' },
  statusOff: { backgroundColor: COLORS.backgroundWarm },
  statusText: { fontSize: SIZES.sm, fontFamily: 'Poppins_600SemiBold', color: COLORS.textSecondary },
  statusTextOn: { color: COLORS.success },
  rankNum: {
    marginTop: SIZES.spacing_md,
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  rankName: { fontSize: 26, lineHeight: 34, fontFamily: 'Poppins_700Bold', color: COLORS.textPrimary },
  tag: {
    marginTop: 2,
    fontSize: SIZES.md,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  needs: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: SIZES.spacing_base },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: COLORS.backgroundWarm,
  },
  chipText: { fontSize: SIZES.sm, fontFamily: 'Poppins_500Medium', color: COLORS.textSecondary },
  chipPts: { backgroundColor: '#FDEFEA' },
  chipPtsText: { color: COLORS.accentDeep, fontFamily: 'Poppins_600SemiBold' },
  left: {
    alignSelf: 'stretch',
    marginTop: SIZES.spacing_lg,
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.backgroundWarm,
    gap: 8,
  },
  leftTitle: { fontSize: SIZES.sm, fontFamily: 'Poppins_600SemiBold', color: COLORS.textPrimary },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { flex: 1, fontSize: SIZES.sm, fontFamily: 'Poppins_400Regular', color: COLORS.textSecondary },
  howLink: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: SIZES.spacing_lg },
  howLinkText: { fontSize: SIZES.sm, fontFamily: 'Poppins_600SemiBold', color: COLORS.accentDeep },

  howTitle: { fontSize: 22, fontFamily: 'Poppins_700Bold', color: COLORS.textPrimary, paddingRight: 40 },
  howIntro: {
    marginTop: 4,
    fontSize: SIZES.md,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  rows: { marginTop: SIZES.spacing_base },
  row: { flexDirection: 'row', alignItems: 'center', gap: SIZES.spacing_md, paddingVertical: SIZES.spacing_md },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DCE3E8' },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.backgroundWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: SIZES.md, fontFamily: 'Poppins_600SemiBold', color: COLORS.textPrimary },
  rowSub: { fontSize: SIZES.sm, fontFamily: 'Poppins_400Regular', color: COLORS.textMuted },
  rowPts: { fontSize: SIZES.base, fontFamily: 'Poppins_700Bold', color: COLORS.accentDeep },
  ladderTitle: {
    marginTop: SIZES.spacing_lg,
    marginBottom: SIZES.spacing_xs,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  ladderRow: { flexDirection: 'row', alignItems: 'center', gap: SIZES.spacing_md, paddingVertical: 8 },
  here: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
