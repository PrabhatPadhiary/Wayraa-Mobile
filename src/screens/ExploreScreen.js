import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  StatusBar,
  Image,
  Dimensions,
  FlatList,
  ScrollView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.75;
const CARD_HEIGHT = 380;

const CATEGORIES = ['All', 'Asia', 'Europe', 'South America', 'Africa', 'North America'];

const PLACES = [
  {
    id: '1',
    name: 'Bali',
    country: 'Indonesia',
    rating: 4.8,
    reviews: 256,
    image: 'https://images.pexels.com/photos/2166559/pexels-photo-2166559.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    id: '2',
    name: 'Santorini',
    country: 'Greece',
    rating: 5.0,
    reviews: 143,
    image: 'https://images.pexels.com/photos/1010657/pexels-photo-1010657.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    id: '3',
    name: 'Kyoto',
    country: 'Japan',
    rating: 4.9,
    reviews: 198,
    image: 'https://images.pexels.com/photos/1440476/pexels-photo-1440476.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    id: '4',
    name: 'Machu Picchu',
    country: 'Peru',
    rating: 4.9,
    reviews: 312,
    image: 'https://images.pexels.com/photos/2929906/pexels-photo-2929906.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    id: '5',
    name: 'Cape Town',
    country: 'South Africa',
    rating: 4.7,
    reviews: 167,
    image: 'https://images.pexels.com/photos/259447/pexels-photo-259447.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
];

/**
 * ExploreScreen - Main home screen with destination cards.
 */
export default function ExploreScreen({ route }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const user = route?.params?.user;

  const displayName = user?.name?.split(' ')[0] || 'Explorer';

  const renderPlaceCard = ({ item }) => (
    <View style={styles.card}>
      <Image source={{ uri: item.image }} style={styles.cardImage} />
      {/* Favourite button */}
      <TouchableOpacity style={styles.favouriteButton} accessibilityLabel="Add to favourites">
        <Ionicons name="heart-outline" size={22} color={COLORS.white} />
      </TouchableOpacity>
      {/* Card content overlay */}
      <View style={styles.cardOverlay}>
        <Text style={styles.cardCountry}>{item.country}</Text>
        <Text style={styles.cardName}>{item.name}</Text>
        <View style={styles.cardRating}>
          <Text style={styles.ratingIcon}>⭐</Text>
          <Text style={styles.ratingValue}>{item.rating}</Text>
          <Text style={styles.reviewCount}>{item.reviews} reviews</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello, {displayName}</Text>
            <Text style={styles.subGreeting}>Welcome to Wayraa</Text>
          </View>
          <Image
            source={require('../../assets/wayraa_logo.png')}
            style={styles.profileImage}
            resizeMode="contain"
          />
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color={COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search destinations..."
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
          <TouchableOpacity style={styles.filterButton}>
            <Ionicons name="options-outline" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Section Title */}
        <Text style={styles.sectionTitle}>Select your next trip</Text>

        {/* Category Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryContainer}
        >
          {CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryChip,
                activeCategory === category && styles.categoryChipActive,
              ]}
              onPress={() => setActiveCategory(category)}
            >
              <Text
                style={[
                  styles.categoryText,
                  activeCategory === category && styles.categoryTextActive,
                ]}
              >
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Place Cards - Horizontal Swipeable */}
        <FlatList
          data={PLACES}
          renderItem={renderPlaceCard}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + 16}
          decelerationRate="fast"
          contentContainerStyle={styles.cardsContainer}
        />

        {/* See More Button */}
        <TouchableOpacity style={styles.seeMoreButton}>
          <Text style={styles.seeMoreText}>See more</Text>
          <View style={styles.seeMoreArrow}>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textPrimary} />
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="home" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="journal-outline" size={22} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="heart-outline" size={22} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="grid-outline" size={22} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_lg,
    paddingBottom: SIZES.spacing_base,
  },
  greeting: {
    fontSize: SIZES.xxl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  subGreeting: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  profileImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_lg,
    marginBottom: SIZES.spacing_lg,
    gap: SIZES.spacing_md,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    borderRadius: SIZES.radius_md,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_md,
    gap: SIZES.spacing_sm,
  },
  searchInput: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: SIZES.radius_md,
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    paddingHorizontal: SIZES.spacing_lg,
    marginBottom: SIZES.spacing_base,
  },
  categoryScroll: {
    marginBottom: SIZES.spacing_lg,
  },
  categoryContainer: {
    paddingHorizontal: SIZES.spacing_lg,
    gap: SIZES.spacing_sm,
  },
  categoryChip: {
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_sm,
    borderRadius: SIZES.radius_full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryChipActive: {
    backgroundColor: COLORS.textPrimary,
    borderColor: COLORS.textPrimary,
  },
  categoryText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  categoryTextActive: {
    color: COLORS.white,
  },
  cardsContainer: {
    paddingHorizontal: SIZES.spacing_lg,
    gap: 16,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: SIZES.radius_lg,
    overflow: 'hidden',
    backgroundColor: COLORS.cardBackground,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  favouriteButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SIZES.spacing_base,
    paddingTop: SIZES.spacing_xl,
    background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderBottomLeftRadius: SIZES.radius_lg,
    borderBottomRightRadius: SIZES.radius_lg,
  },
  cardCountry: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.8)',
  },
  cardName: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
    marginBottom: SIZES.spacing_xs,
  },
  cardRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_xs,
  },
  ratingIcon: {
    fontSize: 14,
  },
  ratingValue: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  reviewCount: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.7)',
    marginLeft: SIZES.spacing_xs,
  },
  seeMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: SIZES.spacing_lg,
    paddingVertical: SIZES.spacing_base,
    marginHorizontal: SIZES.spacing_lg,
    backgroundColor: COLORS.cardBackground,
    borderRadius: SIZES.radius_full,
    gap: SIZES.spacing_sm,
  },
  seeMoreText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  seeMoreArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingVertical: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_lg,
    borderTopLeftRadius: SIZES.radius_lg,
    borderTopRightRadius: SIZES.radius_lg,
  },
  navItem: {
    padding: SIZES.spacing_sm,
  },
});
