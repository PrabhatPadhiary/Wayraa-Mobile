/**
 * Centralized theme constants for the Wayraa Mobile app.
 *
 * Three colours, used 60 / 30 / 10 (shades of each count as the same colour):
 *   60%  Alpine frost  #EEF2F4  page backgrounds, sheets, quiet fills
 *   30%  Slate blue    #3F5A73  text (its darkest shade), icons, headings,
 *                               borders (its lightest), secondary surfaces
 *   10%  Blood orange  #D9481C  main buttons, active states, likes, stars
 * White cards sit on the frost. Error red and success green are kept muted
 * and only for their meaning. The logo keeps its own colours.
 */

/** The palette: each colour and its shades. Use COLORS (below) in screens. */
export const PALETTE = {
  frost: '#EEF2F4',
  frostDeep: '#E3E9ED',
  frostLight: '#F6F8F9',

  slate: '#3F5A73',
  slateLight: '#5E7A93',
  slatePale: '#DCE3E8',
  slateDark: '#2B3F51',
  slateInk: '#1C2833',

  orange: '#D9481C',
  orangeDeep: '#A8360F', // small text and labels: 4.5:1+ on white and frost
  orangeDark: '#B53A16',
  orangeTint: '#FDEFEA',
};

export const COLORS = {
  // 30%: slate blue
  primary: PALETTE.slateDark,
  primaryLight: PALETTE.slate,

  // 10%: blood orange
  accent: PALETTE.orange,
  accentHover: PALETTE.orangeDark,
  // Deeper orange for SMALL text and white-on-orange labels (the bright one is
  // too light for small text on white).
  accentDeep: PALETTE.orangeDeep,

  // 60%: alpine frost
  backgroundDark: '#121C25',
  backgroundWarm: PALETTE.frost,
  backgroundLight: '#ffffff',
  cardBackground: PALETTE.frostLight,
  // Image placeholders and soft card fills.
  sand: PALETTE.frostDeep,

  // Text: shades of slate
  textPrimary: PALETTE.slateInk,
  textSecondary: '#4F6070',
  textMuted: '#7F8D99',
  textLight: '#94A1AC',
  textWhite: '#ffffff',

  // Utility colors
  white: '#ffffff',
  black: '#000000',
  error: '#C8352B',
  success: '#3E8E63',
  warning: PALETTE.orange,

  // Border colors: palest slate
  border: PALETTE.slatePale,
  borderLight: '#E8EDF0',
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
