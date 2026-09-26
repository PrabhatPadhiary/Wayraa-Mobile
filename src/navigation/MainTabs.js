import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GlassTabBar } from '../components';
import { MAIN_TABS } from '../constants';
import { ExploreScreen, MyTripsScreen, FavoritesScreen, CommunityScreen } from '../screens';

const Tab = createBottomTabNavigator();

const SCREEN_COMPONENTS = {
  Explore: ExploreScreen,
  MyTrips: MyTripsScreen,
  Favorites: FavoritesScreen,
  Community: CommunityScreen,
};

/**
 * Adapts React Navigation's tab bar props onto our shared GlassTabBar.
 * The bar lives here (navigator level), so it stays mounted while screens
 * swap underneath — letting the capsule slide between tabs instead of
 * re-snapping on each screen mount.
 */
function CustomTabBar({ state, navigation }) {
  const activeKey = state.routes[state.index].name;

  const onTabPress = (key) => {
    const route = state.routes.find((r) => r.name === key);
    const isFocused = state.routes[state.index].name === key;

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(key);
    }
  };

  return <GlassTabBar items={MAIN_TABS} activeKey={activeKey} onTabPress={onTabPress} />;
}

/**
 * MainTabs - the app shell with the persistent floating glass bar.
 * Screens draw their own content full-bleed under the bar.
 */
export default function MainTabs({ route }) {
  const user = route?.params?.user;

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {MAIN_TABS.map((tab) => (
        <Tab.Screen
          key={tab.key}
          name={tab.key}
          component={SCREEN_COMPONENTS[tab.key]}
          initialParams={tab.key === 'Explore' ? { user } : undefined}
        />
      ))}
    </Tab.Navigator>
  );
}
