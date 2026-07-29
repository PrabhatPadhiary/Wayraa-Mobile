/**
 * Centralized theme constants for the Wayraa Mobile app.
 * Colors derived from the web app's landing page v2 palette.
 */

export const COLORS = {
  // Primary brand colors (from hero gradient)
  primary: '#043247', // Deep navy-teal
  primaryLight: '#0685c0', // Lighter teal-blue

  // Accent/CTA colors
  accent: '#e85d04', // Orange from search/CTA buttons
  accentHover: '#c0392b', // Darker orange-red

  // Background colors
  backgroundDark: '#0d1b2a', // Dark navy for dark theme
  backgroundWarm: '#fffbf8', // Warm white from hero
  backgroundLight: '#ffffff',
  cardBackground: '#f8f9fa',

  // Text colors
  textPrimary: '#1a1a1a',
  textSecondary: '#666666',
  textMuted: '#999999',
  textLight: '#aaaaaa',
  textWhite: '#ffffff',

  // Utility colors
  white: '#ffffff',
  black: '#000000',
  error: '#ff4444',
  success: '#4CAF50',
  warning: '#FFC107',

  // Border colors
  border: '#e8e8e8',
  borderLight: '#f0f0f0',
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  semiBold: 'System',
  bold: 'System',
};

export const SIZES = {
  // Font sizes
  xs: 10,
  sm: 12,
  md: 14,
  base: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 36,
  title: 42,

  // Spacing
  spacing_xs: 4,
  spacing_sm: 8,
  spacing_md: 12,
  spacing_base: 16,
  spacing_lg: 24,
  spacing_xl: 32,
  spacing_xxl: 48,

  // Border radius
  radius_sm: 8,
  radius_md: 12,
  radius_lg: 20,
  radius_xl: 30,
  radius_full: 50,
};

export default { COLORS, FONTS, SIZES };
