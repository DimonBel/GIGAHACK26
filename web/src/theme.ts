import { Badge, createTheme } from '@mantine/core';

/** Light hospital look; Mantine's system font stack, so nothing is loaded from the network. */
export const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'md',
  cursorType: 'pointer',
  components: {
    // A badge's label may be clipped, which lets table columns squeeze it to "APPR…"; badges here are short.
    Badge: Badge.extend({ styles: { label: { overflow: 'visible' } } }),
  },
});
