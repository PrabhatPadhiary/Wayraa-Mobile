import React, { useRef } from 'react';
import { Animated, StyleSheet, RefreshControl, View } from 'react-native';
import { SIZES } from '../constants';
import { TRIP_CARD_HEIGHT } from './TripStackCard';

// At rest the cards are a tight fan: each one sits this far below the previous,
// so only its top strip shows. Fewer cards -> a bit more peek; more cards ->
// tighter, like the app switcher. Never below MIN_PEEK so none fully vanishes.
const MAX_PEEK = 96;
const MIN_PEEK = 56;
// Peek of each card once it has collapsed into the parked stack at the very
// top (smaller than the rest peek, so the stack looks compressed).
const PARK_PEEK = 34;
// How many collapsed cards show at the very top before the rest hide behind.
const MAX_STACK = 3;

/**
 * Vertical, scroll-driven fan of trip cards (the iOS app switcher turned
 * vertical). At rest the cards overlap in a tight fan. As you scroll, the top
 * cards collapse and park in a small stack at the top, while the cards below
 * slide up and reveal more of themselves.
 *
 * Cards are positioned absolutely from the scroll offset, so normal vertical
 * scrolling and momentum are preserved while the cards transform.
 *
 * @param {Array} trips
 * @param {(trip, index) => React.ReactNode} renderCard
 * @param {number} topInset     clears the header
 * @param {number} bottomInset  clears the tab bar
 * @param {object} [refreshControlProps]
 * @param {(y:number) => void} [onScrollY]
 * @param {boolean} [scrollEnabled]  false while a card is being swiped sideways
 * @param {() => void} [onScrollBeginDrag]
 */
export default function TripFan({
  trips,
  renderCard,
  topInset = 0,
  bottomInset = 120,
  refreshControlProps,
  onScrollY,
  scrollEnabled = true,
  onScrollBeginDrag,
}) {
  const scrollY = useRef(new Animated.Value(0)).current;

  const n = trips.length;
  const peek = Math.max(MIN_PEEK, MAX_PEEK - Math.max(0, n - MAX_STACK) * 10);

  // Scroll range: enough to bring the last card up to the focused position,
  // plus room to reveal it fully. The tall spacer is what you actually scroll.
  const lastRestTop = topInset + (n - 1) * peek;
  const scrollRange = Math.max(0, lastRestTop - topInset) + TRIP_CARD_HEIGHT;
  const contentHeight = topInset + TRIP_CARD_HEIGHT + scrollRange + bottomInset;

  return (
    <Animated.ScrollView
      style={styles.fill}
      showsVerticalScrollIndicator={false}
      scrollEnabled={scrollEnabled}
      onScrollBeginDrag={onScrollBeginDrag}
      scrollEventThrottle={16}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        {
          useNativeDriver: true,
          listener: onScrollY ? (e) => onScrollY(e.nativeEvent.contentOffset.y) : undefined,
        }
      )}
      refreshControl={
        refreshControlProps ? <RefreshControl {...refreshControlProps} /> : undefined
      }
    >
      <View style={{ height: contentHeight }} pointerEvents="box-none">
        {trips.map((trip, index) => {
          // Rest position in the tight fan (overlapped by `peek`). Cards live
          // inside the scrolling content, so they move up 1:1 with scroll for
          // free — translateY below only adds the "park at the top" offset.
          const restTop = topInset + index * peek;

          // The parked slot this card holds in the collapsed top stack: a
          // smaller peek per card above it, capped at MAX_STACK layers.
          const parkTop = topInset + Math.min(index, MAX_STACK - 1) * PARK_PEEK;

          // Scroll offset at which the card, moving up with content, reaches
          // its park slot. Past this we translate it down by the overshoot so
          // it holds in place (collapsing into the stack) instead of leaving.
          const parkAt = restTop - parkTop;

          const translateY = scrollY.interpolate({
            inputRange: [parkAt, parkAt + 1],
            outputRange: [0, 1],
            extrapolateLeft: 'clamp',   // not yet parked: ride with the scroll
            extrapolateRight: 'extend', // parked: hold at the slot
          });

          // Parked cards shrink and fade a touch so the stack recedes. The
          // effect grows over the next card's travel distance (one peek).
          const scale = scrollY.interpolate({
            inputRange: [parkAt, parkAt + peek * (MAX_STACK - 1)],
            outputRange: [1, 0.9],
            extrapolate: 'clamp',
          });
          const opacity = scrollY.interpolate({
            inputRange: [parkAt + peek * (MAX_STACK - 1), parkAt + peek * MAX_STACK],
            outputRange: [1, 0],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={trip.id || index}
              style={[
                styles.card,
                {
                  top: restTop,
                  zIndex: index,
                  opacity,
                  transform: [{ translateY }, { scale }],
                },
              ]}
            >
              {renderCard(trip, index)}
            </Animated.View>
          );
        })}
      </View>
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  card: {
    position: 'absolute',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
  },
});
