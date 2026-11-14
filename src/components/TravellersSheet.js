import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Dimensions,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants';
import {
  getStoredUser,
  getShareLinks,
  resetShareLink,
  getPendingInvitations,
  revokeInvitation,
  changeMemberRole,
  removeMember,
} from '../services';
import { avatarColorFor, initialsFor } from './TripStackCard';
import { showAlert, AppDialogHost } from './AppDialog';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';

const MAX_SHEET_HEIGHT = Dimensions.get('window').height * 0.9;

/** Role names as shown to people ("member" is called Editor, like the website). */
export const ROLE_INFO = {
  owner: { label: 'Owner', icon: 'star', hint: 'Created the trip', color: COLORS.accentDeep, bg: '#FDEFEA' },
  member: { label: 'Editor', icon: 'create-outline', hint: 'Can add and edit plans', color: COLORS.primary, bg: '#ECF1F5' },
  viewer: { label: 'Viewer', icon: 'eye-outline', hint: 'Can only view the trip', color: COLORS.textSecondary, bg: '#EEF1F3' },
};
const roleInfo = (role) => ROLE_INFO[(role || '').toLowerCase()] || ROLE_INFO.member;

/** "in 2 days", "in 5 hours", "in 20 min" until an ISO time. */
function timeLeft(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `in ${Math.round(hours / 24)} days`;
}

async function shareInvite(tripName, invite) {
  const role = roleInfo(invite.role).label.toLowerCase();
  const article = /^[aeiou]/.test(role) ? 'an' : 'a';
  const message = `Join my trip "${tripName}" on Wayraa as ${article} ${role}: ${invite.link}`;
  // iOS shows `url` as a link preview; Android only uses `message`.
  await Share.share({ message, url: invite.link }, { subject: `Join "${tripName}" on Wayraa` });
}

/**
 * Who's on the trip, and inviting more people.
 *
 * - Everyone sees the travellers and their roles.
 * - Owners and editors can invite: pick Editor or Viewer, then share that
 *   role's link through the phone's share sheet. It's one link per role for
 *   the whole group: anyone with it can join, until the owner resets it
 *   (owner only). Older single-use links that haven't
 *   been used yet are listed under "Pending invites" to share again or revoke.
 * - Owners can change a person's role or remove them.
 *
 * @param {boolean} visible
 * @param {object} trip       full trip (members, myRole, travelersCount)
 * @param {() => void} onClose
 * @param {() => void} onChanged  called after members change (reload the trip)
 */
export default function TravellersSheet({ visible, trip, onClose, onChanged }) {
  const insets = useSafeAreaInsets();
  const myRole = (trip?.myRole || '').toLowerCase();
  const isOwner = myRole === 'owner';
  const canInvite = myRole === 'owner' || myRole === 'member';

  const [myUserId, setMyUserId] = useState(null);
  const [inviteRole, setInviteRole] = useState('member');
  const [creating, setCreating] = useState(false);
  const [links, setLinks] = useState(null); // { member: { id, link }, viewer: { id, link } }
  const [linksBusy, setLinksBusy] = useState(false);
  const [pending, setPending] = useState([]);
  const [busyId, setBusyId] = useState(null); // member / invite being changed
  const [error, setError] = useState('');

  const loadPending = useCallback(async () => {
    if (!trip?.id || !canInvite) return;
    try {
      setPending(await getPendingInvitations(trip.id));
    } catch {
      // Not critical: the invite button still works.
    }
  }, [trip?.id, canInvite]);

  const loadLinks = useCallback(async () => {
    if (!trip?.id || !canInvite) return null;
    const next = await getShareLinks(trip.id);
    setLinks(next);
    return next;
  }, [trip?.id, canInvite]);

  useEffect(() => {
    if (!visible) return;
    setError('');
    getStoredUser().then((u) => setMyUserId(u?.id || null)).catch(() => {});
    loadPending();
    loadLinks().catch(() => {}); // fetched again when sharing if this fails
  }, [visible, loadPending, loadLinks]);

  // Owner first, then editors, then viewers; alphabetical within each.
  const order = { owner: 0, member: 1, viewer: 2 };
  const members = [...(trip?.members || [])].sort(
    (a, b) => (order[(a.role || '').toLowerCase()] ?? 1) - (order[(b.role || '').toLowerCase()] ?? 1)
      || (a.name || '').localeCompare(b.name || '')
  );
  const notJoined = Math.max(0, (trip?.travelersCount || 0) - members.length);

  // Share the chosen role's link.
  const handleInvite = async () => {
    if (creating || !trip) return;
    setCreating(true);
    setError('');
    try {
      const current = links?.[inviteRole] ? links : await loadLinks();
      const link = current?.[inviteRole];
      if (!link) throw new Error('Could not load the invite link. Please try again.');
      await shareInvite(trip.name, { role: inviteRole, link: link.link });
    } catch (e) {
      setError(e?.message || 'Could not share the invite. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const runLinkChange = async (action) => {
    setLinksBusy(true);
    setError('');
    try {
      setLinks(await action());
    } catch (e) {
      showAlert('Something went wrong', e?.message || 'Please try again.');
    } finally {
      setLinksBusy(false);
    }
  };

  const handleResetLink = () => {
    const label = roleInfo(inviteRole).label.toLowerCase();
    showAlert(`Reset the ${label} link?`, 'The current link stops working. Anyone who already joined stays on the trip.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset link', onPress: () => runLinkChange(() => resetShareLink(trip.id, inviteRole)) },
    ]);
  };

  const roleLabel = roleInfo(inviteRole).label.toLowerCase();

  const handleRevoke = (invite) => {
    showAlert('Revoke this invite?', 'The link will stop working.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          setBusyId(invite.id);
          try {
            await revokeInvitation(trip.id, invite.id);
            setPending((prev) => prev.filter((i) => i.id !== invite.id));
          } catch (e) {
            showAlert('Could not revoke', e?.message || 'Please try again.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const runMemberChange = async (member, action) => {
    setBusyId(member.userId);
    try {
      await action();
      onChanged?.();
    } catch (e) {
      showAlert('Something went wrong', e?.message || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const openMemberMenu = (member) => {
    const role = (member.role || '').toLowerCase();
    const other = role === 'viewer' ? 'member' : 'viewer';
    const name = member.name || 'This person';
    showAlert(name, `${roleInfo(role).label} · ${roleInfo(role).hint}`, [
      {
        text: `Make ${roleInfo(other).label.toLowerCase()}`,
        onPress: () => runMemberChange(member, () => changeMemberRole(trip.id, member.userId, other)),
      },
      {
        text: 'Remove from trip',
        style: 'destructive',
        onPress: () => showAlert(`Remove ${name}?`, 'They will lose access to this trip.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => runMemberChange(member, () => removeMember(trip.id, member.userId)),
          },
        ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { maxHeight: MAX_SHEET_HEIGHT, paddingBottom: insets.bottom + SIZES.spacing_base }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>Travellers</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Invite */}
            {canInvite && (
              <View style={styles.inviteCard}>
                <Text style={styles.inviteTitle}>Invite friends</Text>
                <Text style={styles.inviteHint}>Choose what they can do, then share the link.</Text>

                <View style={styles.roleRow} accessibilityRole="radiogroup">
                  {['member', 'viewer'].map((role) => {
                    const info = roleInfo(role);
                    const on = inviteRole === role;
                    return (
                      <TouchableOpacity
                        key={role}
                        style={[styles.roleOption, on && styles.roleOptionOn]}
                        onPress={() => setInviteRole(role)}
                        activeOpacity={0.85}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={`${info.label}, ${info.hint}`}
                      >
                        <View style={styles.roleOptionTop}>
                          <Ionicons name={info.icon} size={16} color={on ? COLORS.accentDeep : COLORS.textSecondary} />
                          <Text style={[styles.roleOptionLabel, on && styles.roleOptionLabelOn]}>{info.label}</Text>
                          <Ionicons
                            name={on ? 'radio-button-on' : 'radio-button-off'}
                            size={16}
                            color={on ? COLORS.accent : COLORS.textMuted}
                            style={styles.roleRadio}
                          />
                        </View>
                        <Text style={styles.roleOptionHint}>{info.hint}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={[styles.shareButton, creating && styles.shareButtonBusy]}
                  onPress={handleInvite}
                  disabled={creating}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel={`Share an invite link as ${roleInfo(inviteRole).label}`}
                >
                  {creating ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <>
                      <Ionicons name="share-outline" size={18} color={COLORS.white} />
                      <Text style={styles.shareButtonText}>Share invite link</Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={styles.inviteFoot}>
                  {`One link for the whole group: anyone with it joins as ${/^[aeiou]/.test(roleLabel) ? 'an' : 'a'} ${roleLabel}.`}
                </Text>
                {isOwner && links?.[inviteRole] && (
                  <View style={styles.linkActions}>
                    {linksBusy ? (
                      <ActivityIndicator size="small" color={COLORS.accent} />
                    ) : (
                      <TouchableOpacity onPress={handleResetLink} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.linkAction}>Reset {roleLabel} link</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {!!error && <Text style={styles.error}>{error}</Text>}
              </View>
            )}

            {/* Members */}
            <Text style={styles.sectionLabel}>
              On this trip · {members.length}
            </Text>
            {members.map((m) => {
              const role = (m.role || '').toLowerCase();
              const info = roleInfo(role);
              const isMe = myUserId && m.userId === myUserId;
              const manageable = isOwner && role !== 'owner' && !isMe;
              return (
                <View key={m.userId} style={styles.memberRow}>
                  <View style={[styles.avatar, { backgroundColor: avatarColorFor(m.name) }]}>
                    {m.photoUrl
                      ? <Image source={{ uri: cloudinarySized(m.photoUrl, IMAGE_WIDTH.AVATAR) }} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} contentFit="cover" />
                      : <Text style={styles.avatarText}>{initialsFor(m.name)}</Text>}
                  </View>
                  <View style={styles.memberText}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {m.name || 'Traveller'}{isMe ? ' (you)' : ''}
                    </Text>
                    {!!m.email && <Text style={styles.memberEmail} numberOfLines={1}>{m.email}</Text>}
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: info.bg }]}>
                    <Text style={[styles.roleBadgeText, { color: info.color }]}>{info.label}</Text>
                  </View>
                  {busyId === m.userId ? (
                    <ActivityIndicator size="small" color={COLORS.accent} style={styles.memberMore} />
                  ) : manageable ? (
                    <TouchableOpacity
                      style={styles.memberMore}
                      onPress={() => openMemberMenu(m)}
                      accessibilityRole="button"
                      accessibilityLabel={`Options for ${m.name || 'this traveller'}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
            {notJoined > 0 && (
              <Text style={styles.notJoined}>
                {notJoined} more {notJoined === 1 ? 'traveller hasn\'t' : 'travellers haven\'t'} joined the app yet.
              </Text>
            )}

            {/* Pending invites */}
            {canInvite && pending.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Pending invites · {pending.length}</Text>
                {pending.map((invite) => {
                  const info = roleInfo(invite.role);
                  return (
                    <View key={invite.id} style={styles.inviteRow}>
                      <View style={styles.inviteIcon}>
                        <Ionicons name="link" size={16} color={COLORS.primaryLight} />
                      </View>
                      <View style={styles.memberText}>
                        <Text style={styles.memberName}>{info.label} invite</Text>
                        <Text style={styles.memberEmail}>Expires {timeLeft(invite.expiresAt)}</Text>
                      </View>
                      {busyId === invite.id ? (
                        <ActivityIndicator size="small" color={COLORS.accent} />
                      ) : (
                        <>
                          <TouchableOpacity
                            style={styles.inviteAction}
                            onPress={() => shareInvite(trip.name, invite).catch(() => {})}
                            accessibilityRole="button"
                            accessibilityLabel={`Share ${info.label} invite again`}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                          >
                            <Ionicons name="share-outline" size={17} color={COLORS.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.inviteAction}
                            onPress={() => handleRevoke(invite)}
                            accessibilityRole="button"
                            accessibilityLabel={`Revoke ${info.label} invite`}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                          >
                            <Ionicons name="close" size={18} color={COLORS.error} />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </View>
      {/* Alerts from this sheet open inside its modal (see AppDialog). */}
      <AppDialogHost />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SIZES.spacing_md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SIZES.spacing_md,
  },
  title: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },

  inviteCard: {
    padding: SIZES.spacing_base,
    borderRadius: SIZES.radius_lg,
    backgroundColor: '#FEF9F7',
    borderWidth: 1,
    borderColor: '#FADED6',
    marginBottom: SIZES.spacing_lg,
  },
  inviteTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  inviteHint: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginBottom: SIZES.spacing_md,
  },
  roleRow: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
  },
  roleOption: {
    flex: 1,
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_md,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  roleOptionOn: {
    borderColor: COLORS.accent,
  },
  roleOptionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roleOptionLabel: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  roleOptionLabelOn: {
    color: COLORS.accentDeep,
  },
  roleRadio: {
    marginLeft: 'auto',
  },
  roleOptionHint: {
    marginTop: 2,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.spacing_sm,
    height: 48,
    marginTop: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accent,
  },
  shareButtonBusy: {
    opacity: 0.8,
  },
  shareButtonText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  linkActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_sm,
  },
  linkAction: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  inviteFoot: {
    marginTop: SIZES.spacing_sm,
    textAlign: 'center',
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  error: {
    marginTop: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: '#D33F2F',
    textAlign: 'center',
  },

  sectionLabel: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: SIZES.spacing_md,
    marginBottom: SIZES.spacing_xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingVertical: SIZES.spacing_sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  memberText: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  memberEmail: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  roleBadge: {
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
  },
  roleBadgeText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
  },
  memberMore: {
    width: 28,
    alignItems: 'center',
  },
  notJoined: {
    marginTop: SIZES.spacing_xs,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingVertical: SIZES.spacing_sm,
  },
  inviteIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ECF1F5',
  },
  inviteAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
});
