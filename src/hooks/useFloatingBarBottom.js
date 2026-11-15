import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SIZES } from '../constants';

/**
 * Space under the app's floating bottom bars (the tab pill and the glass bars).
 *
 * Android draws the app behind the system navigation area. With the
 * three-button navigation bar (back / home / recents, about 48dp tall) the pill
 * would sit under the buttons, so it moves up to just above them. With gesture
 * navigation the area is only a thin handle, so the pill stays where it was.
 * iOS is unchanged.
 */
const BUTTON_BAR_MIN = 32; // gesture handles report less than this; the button bar more

export default function useFloatingBarBottom() {
  const { bottom } = useSafeAreaInsets();
  if (Platform.OS === 'ios') return 28;
  if (bottom >= BUTTON_BAR_MIN) return bottom + 10; // just above the system buttons
  return SIZES.spacing_lg;                           // as before
}
