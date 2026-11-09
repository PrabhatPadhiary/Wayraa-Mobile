import React, { useRef, useState } from 'react';
import { Animated, StyleSheet, RefreshControl, View } from 'react-native';
import { SIZES } from '../constants';
import { TRIP_CARD_HEIGHT } from './TripStackCard';

// At rest the cards are a tight fan: each one sits this far below the previous,
// so only its top strip shows. Fewer cards -> a bit more peek; more cards ->
// tighter, like the app switcher. Never below MIN_PEEK, which is tall enough
// to show each card's name and its destination/dates line.
const MAX_PEEK = 96;
const MIN_PEEK = 76;
// Peek of each card once it has collapsed into the parked stack at the very
// top (smaller than the rest peek, so the stack looks compressed).
const PARK_PEEK = 34;
// How many collapsed cards show at the very top before the rest hide behind.
const MAX_STACK = 3;
// How much each layer behind the front card shrinks (scaled from its top edge,
// so every parked strip keeps its full PARK_PEEK height).
const LAYER_SHRINK = 0.04;
// Space between the last card and the footer.
const FOOTER_GAP = SIZES.spacing_base;

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
 * @param {React.ReactNode} [footer]  shown under the last card (e.g. "See all")
 *
 * Scrolling snaps once per card: each stop brings the next trip to the front
 * of the parked stack, so a long list is stepped through one trip at a time.
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
  footer,
}) {
  const scrollY = useRef(new Animated.Value(0)).current;
  // Visible height of the scroller and of the footer, measured on layout.
  const [viewportHeight, setViewportHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);

  const n = trips.length;
  const peek = Math.max(MIN_PEEK, MAX_PEEK - Math.max(0, n - MAX_STACK) * 10);

  // Scroll offset at which card `i` reaches its slot in the parked stack.
  const parkAtOf = (i) => i * peek - Math.min(i, MAX_STACK - 1) * PARK_PEEK;

  // One snap stop per card: the offset where it becomes the front card.
  const snapOffsets = trips.map((_, i) => parkAtOf(i));
  const maxScroll = parkAtOf(Math.max(0, n - 1));

  // The footer rides with the content, just under the last card.
  const lastRestTop = topInset + (n - 1) * peek;
  const footerTop = lastRestTop + TRIP_CARD_HEIGHT + FOOTER_GAP;

  // Content is sized so scrolling ends when the last card reaches the front
  // (no dead scroll after it), while still fitting the footer above the tab
  // bar. Before the viewport is measured, fall back to a generous estimate.
  const contentHeight = Math.max(
    viewportHeight > 0
      ? viewportHeight + maxScroll
      : lastRestTop + 2 * TRIP_CARD_HEIGHT + bottomInset,
    footerTop + (footer ? footerHeight : 0) + bottomInset
  );

  return (
    <Animated.ScrollView
      style={styles.fill}
      showsVerticalScrollIndicator={false}
      onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
      snapToOffsets={n > 1 ? snapOffsets : undefined}
      decelerationRate="fast"
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

          // The slot this card first parks in: the stack grows downward one
          // PARK_PEEK per card until it holds MAX_STACK layers.
          const parkSlot = Math.min(index, MAX_STACK - 1);
          const parkTop = topInset + parkSlot * PARK_PEEK;

          // Scroll offset at which the card, moving up with content, reaches
          // its park slot. Past this we translate it down by the overshoot so
          // it holds in place (collapsing into the stack) instead of leaving.
          const parkAt = restTop - parkTop;

          const holdY = scrollY.interpolate({
            inputRange: [parkAt, parkAt + 1],
            outputRange: [0, 1],
            extrapolateLeft: 'clamp',   // not yet parked: ride with the scroll
            extrapolateRight: 'extend', // parked: hold at the slot
          });

          // Once the stack is full, every new card that arrives in the front
          // slot pushes the parked cards back one slot. The push happens while
          // that card travels its last `peek` into place, so it is continuous.
          // `shiftStart` is when the first push affecting this card begins.
          const shiftStart = parkAtOf(Math.max(index, MAX_STACK - 1));
          // How many cards will arrive after this one (i.e. can push it back).
          const arrivals = Math.max(0, n - 1 - Math.max(index, MAX_STACK - 1));
          // It moves up until it reaches the back slot (slot 0), then holds.
          const maxShift = Math.min(parkSlot, arrivals);
          const shiftY = scrollY.interpolate({
            inputRange: [shiftStart, shiftStart + peek * Math.max(1, maxShift)],
            outputRange: [0, PARK_PEEK * maxShift],
            extrapolate: 'clamp',
          });
          const translateY = Animated.subtract(holdY, shiftY);

          // Depth = how many parked cards sit in front of this one. Each layer
          // recedes a little; the card only fades once it is pushed past the
          // back of the stack (more than MAX_STACK - 1 layers in front).
          const depthInput = [parkAt];
          const depthOutput = [0];
          for (let j = index + 1; j < n && j - index <= MAX_STACK; j++) {
            depthInput.push(parkAtOf(j));
            depthOutput.push(j - index);
          }
          if (depthInput.length === 1) {
            depthInput.push(parkAt + 1);
            depthOutput.push(0);
          }
          const depth = scrollY.interpolate({
            inputRange: depthInput,
            outputRange: depthOutput,
            extrapolate: 'clamp',
          });
          const scale = depth.interpolate({
            inputRange: [0, MAX_STACK - 1],
            outputRange: [1, 1 - LAYER_SHRINK * (MAX_STACK - 1)],
            extrapolate: 'clamp',
          });
          const opacity = depth.interpolate({
            inputRange: [MAX_STACK - 1, MAX_STACK],
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

        {footer ? (
          <View
            style={[styles.footer, { top: footerTop, zIndex: n }]}
            onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
          >
            {footer}
          </View>
        ) : null}
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
    transformOrigin: 'top',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
  },
  footer: {
    position: 'absolute',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
  },
});
