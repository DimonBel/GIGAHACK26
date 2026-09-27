import { Badge, createTheme, List, rem, Title, type MantineColorsTuple } from '@mantine/core';

/** Medpark's teal (medpark.md): #00a2a4 for accents (shade 5), #008286 for buttons and panels (shade 6). */
const teal: MantineColorsTuple = [
  '#e8f6f6',
  '#d0eced',
  '#b2e3e4',
  '#7fcfd0',
  '#4dbcbd',
  '#00a2a4',
  '#008286',
  '#006e72',
  '#005a5d',
  '#004548',
];

/** Medpark's light grey behind the white panels. */
export const CANVAS = '#f7f8f8';

/** Montserrat, Medpark's typeface, is bundled with the app (@fontsource): nothing is loaded from the network. */
const FONT = "'Montserrat Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export const theme = createTheme({
  primaryColor: 'teal',
  primaryShade: 6,
  colors: { teal },
  black: '#000e19',
  fontFamily: FONT,
  // Montserrat runs wider than system fonts: one step smaller than Mantine's defaults reads the same.
  fontSizes: { xs: rem(12), sm: rem(13.5), md: rem(15), lg: rem(17), xl: rem(20) },
  lineHeights: { xs: '1.4', sm: '1.45', md: '1.55', lg: '1.55', xl: '1.5' },
  headings: {
    fontFamily: FONT,
    fontWeight: '600',
    sizes: {
      h1: { fontSize: rem(30), lineHeight: '1.25' },
      h2: { fontSize: rem(24), lineHeight: '1.3' },
      h3: { fontSize: rem(20), lineHeight: '1.35' },
      h4: { fontSize: rem(17), lineHeight: '1.4' },
      h5: { fontSize: rem(15), lineHeight: '1.45' },
      h6: { fontSize: rem(14), lineHeight: '1.45' },
    },
  },
  defaultRadius: 'md',
  cursorType: 'pointer',
  components: {
    // A badge's label may be clipped, which lets table columns squeeze it to "APPR…"; badges here are short.
    Badge: Badge.extend({ styles: { label: { overflow: 'visible' } } }),
    Title: Title.extend({ styles: { root: { letterSpacing: '-0.02em' } } }),
    // The text flows right after the bullet: Mantine's inline-flex wrapper can push a long item below it (Safari).
    List: List.extend({ styles: { itemWrapper: { display: 'inline' } } }),
  },
});
