import { Dimensions } from 'react-native';

export { COLORS, FONTS, SIZES } from './theme';

/**
 * Height of the cover photo on the trip detail screen (and its skeleton):
 * about 46% of the screen, so it scales with the device (~390px on iPhone 15).
 */
/** Top tab headers: a soft brand-blue wash fading into white. */
export const HEADER_TINT = ['#dcefff', '#eef7ff', '#ffffff'];

export const TRIP_HERO_HEIGHT = Math.round(Dimensions.get('window').height * 0.46);

/**
 * Global bottom navigation tabs, shared across main screens.
 * `route` is the stack screen each tab maps to.
 */
export const MAIN_TABS = [
  { key: 'Explore', label: 'Home', icon: 'home-outline', activeIcon: 'home', route: 'Explore' },
  { key: 'MyTrips', label: 'My trips', icon: 'map-outline', activeIcon: 'map', route: 'MyTrips' },
  { key: 'Favorites', label: 'Favorites', icon: 'heart-outline', activeIcon: 'heart', route: 'Favorites' },
  { key: 'Community', label: 'Community', icon: 'people-outline', activeIcon: 'people', route: 'Community' },
];
