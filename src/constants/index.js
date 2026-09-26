export { COLORS, FONTS, SIZES } from './theme';

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
