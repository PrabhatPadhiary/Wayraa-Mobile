import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Animated,
  Easing,
  BackHandler,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';

/*
 * Wayraa's own alerts, in place of the system ones (Alert.alert /
 * ActionSheetIOS), so they look the same on iPhone and Android.
 *
 *   showAlert(title, message?, buttons?, options?)
 *
 * Same arguments as React Native's Alert.alert, so swapping one for the other
 * needs no other change. Buttons: [{ text, style?: 'default' | 'cancel' |
 * 'destructive', onPress? }] (default: a single "OK").
 *
 *  - Up to two buttons: a card in the middle of the screen.
 *  - Three or more (a menu): a sheet from the bottom, one row per option
 *    with an icon (picked from the text, or a button's own `icon`), and
 *    Cancel set apart at the end.
 *
 * options.sheet: true shows it as a menu sheet even with fewer buttons.
 *
 * Tapping outside or the Android back button closes it as Cancel (or OK when
 * that's the only button), unless options.cancelable === false. A button's
 * onPress runs once the dialog has closed, so it can open the next one; alerts
 * raised while one is showing wait their turn.
 *
 * <AppDialogHost /> is mounted once, in App.js.
 */

// Menu rows get an icon from their text unless the button sets one
// ({ text, icon: 'ionicons-name' }).
const ICON_RULES = [
  [/primary|star/i, 'star-outline'],
  [/date|calendar/i, 'calendar-outline'],
  [/photo|picture|image/i, 'image-outline'],
  [/edit|rename|change/i, 'create-outline'],
  [/share/i, 'share-outline'],
  [/invite|add .*(friend|traveller)/i, 'person-add-outline'],
  [/link|copy/i, 'link-outline'],
  [/revoke|block/i, 'ban-outline'],
  [/delete|remove|clear|discard/i, 'trash-outline'],
  [/leave|log ?out|sign ?out/i, 'log-out-outline'],
  [/move|reorder/i, 'swap-vertical-outline'],
  [/view|open|see/i, 'eye-outline'],
  [/editor|viewer|owner|admin|role/i, 'person-outline'],
];
function iconFor(button) {
  if (button.icon) return button.icon;
  const rule = ICON_RULES.find(([re]) => re.test(button.text || ''));
  return rule ? rule[1] : 'ellipse-outline';
}

let enqueue = null;
let nextId = 1;
const pending = []; // alerts raised before the host mounted

export function showAlert(title, message, buttons, options) {
  const dialog = {
    id: nextId++,
    title: title ?? '',
    message: message || null,
    buttons: Array.isArray(buttons) && buttons.length ? buttons : [{ text: 'OK' }],
    options: options || {},
  };
  if (enqueue) enqueue(dialog);
  else pending.push(dialog);
}

export function AppDialogHost() {
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    enqueue = (dialog) => setQueue((q) => [...q, dialog]);
    if (pending.length) setQueue((q) => [...q, ...pending.splice(0)]);
    return () => { enqueue = null; };
  }, []);

  const current = queue[0] || null;
  const done = useCallback(() => setQueue((q) => q.slice(1)), []);

  if (!current) return null;
  return <Dialog key={current.id} dialog={current} onDone={done} />;
}

function Dialog({ dialog, onDone }) {
  const { title, message, buttons, options } = dialog;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const asSheet = buttons.length > 2 || options.sheet === true;
  const anim = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: asSheet ? 280 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim, asSheet]);

  // Close, then run the chosen button's action, only once the dialog's window
  // is fully gone: on iPhone, a share sheet, photo picker or the next alert
  // can't open while it's still closing (iOS silently drops it).
  const [shown, setShown] = useState(true);
  const chosen = useRef(null);
  const finished = useRef(false);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
    chosen.current?.onPress?.();
  }, [onDone]);

  const close = useCallback((button) => {
    if (closing.current) return;
    closing.current = true;
    chosen.current = button || null;
    Animated.timing(anim, {
      toValue: 0,
      duration: 170,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setShown(false);
      // iOS reports the window gone through onDismiss; Android has no such
      // event and is ready straight away. (A fallback in case onDismiss
      // never comes.)
      setTimeout(finish, Platform.OS === 'ios' ? 600 : 0);
    });
  }, [anim, finish]);

  // Outside tap / back button: the Cancel button, or the only button.
  const cancelButton = buttons.find((b) => b.style === 'cancel') || (buttons.length === 1 ? buttons[0] : null);
  const dismissable = options.cancelable !== false && !!cancelButton;
  const dismiss = () => { if (dismissable) close(cancelButton); };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  });

  const hasDestructive = buttons.some((b) => b.style === 'destructive');

  const backdrop = (
    <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close" />
    </Animated.View>
  );

  if (asSheet) {
    const actions = buttons.filter((b) => b.style !== 'cancel');
    const cancel = buttons.find((b) => b.style === 'cancel');
    return (
      <Modal transparent visible={shown} statusBarTranslucent animationType="none" onRequestClose={dismiss} onDismiss={finish}>
        {backdrop}
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + SIZES.spacing_sm },
            { transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [height * 0.5, 0] }) }] },
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.sheetHandle} />
          {(!!title || !!message) && (
            <View style={styles.sheetHead}>
              {!!title && <Text style={styles.sheetTitle} numberOfLines={2} accessibilityRole="header">{title}</Text>}
              {!!message && <Text style={styles.sheetMessage}>{message}</Text>}
            </View>
          )}
          <View style={styles.sheetList}>
            {actions.map((b, i) => {
              const danger = b.style === 'destructive';
              return (
                <TouchableOpacity
                  key={`${b.text}-${i}`}
                  style={styles.sheetRow}
                  onPress={() => close(b)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                >
                  <View style={[styles.sheetIcon, danger && styles.sheetIconDanger]}>
                    <Ionicons name={iconFor(b)} size={19} color={danger ? DESTRUCTIVE : COLORS.primary} />
                  </View>
                  <Text style={[styles.sheetRowText, danger && styles.destructiveText]} numberOfLines={1}>
                    {b.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {cancel && (
            <TouchableOpacity
              style={styles.sheetCancel}
              onPress={() => close(cancel)}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={styles.sheetCancelText}>{cancel.text}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </Modal>
    );
  }

  // Card: the main button on the right (or full width when it's alone).
  const ordered = [...buttons].sort((a, b) => (a.style === 'cancel' ? -1 : b.style === 'cancel' ? 1 : 0));
  return (
    <Modal transparent visible={shown} statusBarTranslucent animationType="none" onRequestClose={dismiss} onDismiss={finish}>
      {backdrop}
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              opacity: anim,
              transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
            },
          ]}
          accessibilityViewIsModal
        >
          {hasDestructive && (
            <View style={styles.iconWrap}>
              <Ionicons name="alert-circle" size={26} color={DESTRUCTIVE} />
            </View>
          )}
          {!!title && <Text style={styles.title} accessibilityRole="header">{title}</Text>}
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={styles.buttons}>
            {ordered.map((b, i) => {
              const isCancel = b.style === 'cancel' && ordered.length > 1;
              const isDestructive = b.style === 'destructive';
              return (
                <TouchableOpacity
                  key={`${b.text}-${i}`}
                  style={[
                    styles.button,
                    isCancel ? styles.buttonSecondary : styles.buttonPrimary,
                    isDestructive && styles.buttonDestructive,
                  ]}
                  onPress={() => close(b)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Text
                    style={[styles.buttonText, isCancel ? styles.buttonTextSecondary : styles.buttonTextPrimary]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {b.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const DESTRUCTIVE = '#d93025';

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(4, 22, 32, 0.5)',
  },

  // Card (one or two buttons)
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_xl,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    paddingTop: SIZES.spacing_lg,
    paddingHorizontal: SIZES.spacing_lg,
    paddingBottom: SIZES.spacing_base,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fdecea',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.spacing_md,
  },
  title: {
    fontSize: SIZES.lg,
    lineHeight: 24,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  message: {
    marginTop: SIZES.spacing_sm,
    fontSize: SIZES.md,
    lineHeight: 21,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
    alignSelf: 'stretch',
    marginTop: SIZES.spacing_lg,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_sm,
  },
  buttonPrimary: {
    backgroundColor: COLORS.accent,
  },
  buttonDestructive: {
    backgroundColor: DESTRUCTIVE,
  },
  buttonSecondary: {
    backgroundColor: '#f0f2f5',
  },
  buttonText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
  },
  buttonTextPrimary: {
    color: COLORS.white,
  },
  buttonTextSecondary: {
    color: COLORS.textPrimary,
  },

  // Sheet (three or more buttons: a menu)
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SIZES.spacing_base,
  },
  sheetHead: {
    marginBottom: SIZES.spacing_sm,
  },
  sheetTitle: {
    fontSize: SIZES.lg + 1,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  sheetMessage: {
    marginTop: 2,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  sheetList: {
    paddingVertical: SIZES.spacing_xs,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingVertical: 10,
  },
  sheetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eef4f8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetIconDanger: {
    backgroundColor: '#fdecea',
  },
  sheetRowText: {
    flex: 1,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  destructiveText: {
    color: DESTRUCTIVE,
  },
  sheetCancel: {
    marginTop: SIZES.spacing_md,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
  },
  sheetCancelText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
});
