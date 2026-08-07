import { ProofIllustration } from "./ProofIllustration";
import { ScooterIllustration } from "./ScooterIllustration";
import { WorkstationIllustration } from "./WorkstationIllustration";
import type { IllustrationPalette } from "./palette";

export type { IllustrationPalette };

/**
 * The illustration set, keyed by the beat each one carries.
 *
 * Every piece is an object rather than a character, drawn in one construction
 * — thick outline, flat fill, speckle — so the three read as one system once
 * they are recoloured onto the shared ramp.
 *
 * Aspect travels with the art because the source viewBoxes differ, and a
 * screen should only have to choose a width.
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
  /** Order — the job specified before anything is printed. */
  workstation: { Component: WorkstationIllustration, aspect: 678.7 / 395.44 },
  /** Approve — the proof held up against the mounted one, before it prints. */
  proof: { Component: ProofIllustration, aspect: 873.49 / 740.76 },
  /** Track — the rider bringing the finished job to the door. */
  scooter: { Component: ScooterIllustration, aspect: 659.89 / 509.94 },
} satisfies Record<string, Illustration>;

export type IllustrationName = keyof typeof illustrations;
