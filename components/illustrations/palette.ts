/**
 * The five-step ramp every GRIDGO illustration is drawn in.
 *
 * Ordered dark to light. Each step maps to an existing theme token, so an
 * illustration inverts with the theme instead of being authored twice.
 */
export type IllustrationPalette = {
  /** Outlines. `accent` */
  ink: string;
  /** Dark planes. `textSecondary` */
  shade: string;
  /** Mid planes. `textMuted` */
  mid: string;
  /** Light planes. `outline` */
  tint: string;
  /** Highlights. `surface` */
  highlight: string;
};
