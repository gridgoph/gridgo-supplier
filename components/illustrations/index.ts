import { PackagesIllustration } from "./PackagesIllustration";
import { StorefrontIllustration } from "./StorefrontIllustration";
import { WorkingIllustration } from "./WorkingIllustration";
import type { IllustrationPalette } from "./palette";

export type { IllustrationPalette };

/**
 * Supplier illustration set, keyed by the beat each one carries.
 *
 * Every piece is collapsed onto the five-step GRIDGO ramp so it inverts with
 * the theme. Aspect travels with the art because the source viewBoxes differ.
 */

type Illustration = {
  Component: (props: {
    width: number;
    height: number;
    palette: IllustrationPalette;
  }) => React.JSX.Element;
  /** width / height, from the source viewBox. */
  aspect: number;
};

export const illustrations = {
  /** Jobs find you — the shop open on GRIDGO. */
  storefront: { Component: StorefrontIllustration, aspect: 776.69 / 657.16 },
  /** Produce and check — accept work, print, and pack for the joint pickup checks. */
  working: { Component: WorkingIllustration, aspect: 905.13 / 707.5 },
  /** Hand off and get paid — pack for pickup and track settlement. */
  packages: { Component: PackagesIllustration, aspect: 533.57 / 345.77 },
} satisfies Record<string, Illustration>;

export type IllustrationName = keyof typeof illustrations;
