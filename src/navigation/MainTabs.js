import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppTabBar } from '../components';
import { MAIN_TABS } from '../constants';
import {
  ExploreScreen,
  MyTripsScreen,
  FavoritesScreen,
  CommunityScreen,
  DestinationDetailScreen,
  CategoryResultsScreen,
  PlaceDetailScreen,
  TripDetailScreen,
  JoinTripScreen,
  ProfileScreen,
  JournalDetailScreen,
  DestinationPlacesScreen,
  NearbyPlacesScreen,
  MyStoriesScreen,
  BlockedPeopleScreen,
} from '../screens';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const commonStackOptions = { headerShown: false };

/**
 * Each tab owns its own native stack, so a tab remembers the screen it was on
 * (e.g. a destination detail) when you switch away and come back.
 * DestinationDetail lives in the Explore stack.
 */
function ExploreStack({ route }) {
  const user = route?.params?.user;
  return (
    <Stack.Navigator screenOptions={commonStackOptions}>
      <Stack.Screen name="ExploreHome" component={ExploreScreen} initialParams={{ user }} />
      <Stack.Screen name="DestinationDetail" component={DestinationDetailScreen} />
      {/* All places / search inside a destination. */}
      <Stack.Screen name="DestinationPlaces" component={DestinationPlacesScreen} />
      <Stack.Screen name="CategoryResults" component={CategoryResultsScreen} />
      {/* Home's "Near you" → See all. */}
      <Stack.Screen name="NearbyPlaces" component={NearbyPlacesScreen} />
      <Stack.Screen name="PlaceDetail" component={PlaceDetailScreen} />
      {/* Stories that tag a place open from its page. */}
      <Stack.Screen name="JournalDetail" component={JournalDetailScreen} />
      {/* Opened from the avatar on Home. */}
      <Stack.Screen name="Profile" component={ProfileScreen} />
      {/* Your stories (from Profile): everything you've shared, hidden ones too. */}
      <Stack.Screen name="MyStories" component={MyStoriesScreen} />
      {/* Blocked people (from Profile): unblock. */}
      <Stack.Screen name="BlockedPeople" component={BlockedPeopleScreen} />
    </Stack.Navigator>
  );
}

function MyTripsStack() {
  return (
    <Stack.Navigator screenOptions={commonStackOptions}>
      <Stack.Screen name="MyTripsHome" component={MyTripsScreen} />
      <Stack.Screen name="TripDetail" component={TripDetailScreen} />
      {/* Saved places on a trip open the shared place page from this stack. */}
      <Stack.Screen name="PlaceDetail" component={PlaceDetailScreen} />
      {/* Stories that tag a place open from its page. */}
      <Stack.Screen name="JournalDetail" component={JournalDetailScreen} />
      {/* "Add place" on a trip opens the destination here, in picking mode, so
          back returns to the trip instead of switching to the Explore tab. */}
      <Stack.Screen name="DestinationDetail" component={DestinationDetailScreen} />
      {/* All places / search inside a destination. */}
      <Stack.Screen name="DestinationPlaces" component={DestinationPlacesScreen} />
      {/* Joining a shared trip: from an invite link, or by pasting one. */}
      <Stack.Screen name="JoinTrip" component={JoinTripScreen} />
    </Stack.Navigator>
  );
}

function FavoritesStack() {
  return (
    <Stack.Navigator screenOptions={commonStackOptions}>
      <Stack.Screen name="FavoritesHome" component={FavoritesScreen} />
      {/* Tapping a saved place opens its details. */}
      <Stack.Screen name="PlaceDetail" component={PlaceDetailScreen} />
      {/* Stories that tag a place open from its page. */}
      <Stack.Screen name="JournalDetail" component={JournalDetailScreen} />
    </Stack.Navigator>
  );
}

function CommunityStack() {
  return (
    <Stack.Navigator screenOptions={commonStackOptions}>
      <Stack.Screen name="CommunityHome" component={CommunityScreen} />
      <Stack.Screen name="JournalDetail" component={JournalDetailScreen} />
      {/* Places mentioned in a journal open the shared place page. */}
      <Stack.Screen name="PlaceDetail" component={PlaceDetailScreen} />
    </Stack.Navigator>
  );
}

const STACKS = {
  Explore: ExploreStack,
  MyTrips: MyTripsStack,
  Favorites: FavoritesStack,
  Community: CommunityStack,
};

/**
 * MainTabs — bottom-tab navigator with one persistent custom glass tab bar
 * (AppTabBar). Each tab is a native stack (see above).
 */
export default function MainTabs({ route }) {
  const user = route?.params?.user;

  return (
    <Tab.Navigator
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { position: 'absolute', backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0 },
      }}
    >
      {MAIN_TABS.map((tab) => (
        <Tab.Screen
          key={tab.key}
          name={tab.key}
          component={STACKS[tab.key]}
          initialParams={tab.key === 'Explore' ? { user } : undefined}
        />
      ))}
    </Tab.Navigator>
  );
}
