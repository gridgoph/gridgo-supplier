import type { ReactNode } from "react";
import { View } from "react-native";

type Props = {
  children: ReactNode;
  /** Room the marks sit in. `tight` for a small strip, `standard` on the wall. */
  gutter?: "tight" | "standard";
};

/**
 * A sample, trimmed.
 *
 * The one visual risk on the board, and it is content rather than chrome: crop
 * marks are the register marks a printer trims to, so a photo inside them reads
 * as a print sample clipped to a shop wall instead of a product tile from any
 * marketplace. That is exactly what a shop's board is, and it is the one place
 * in this app where a borrowed ecommerce card would say the wrong thing.
 *
 * The marks live in the gutter, aligned with the trimmed edge — four pairs of
 * hairlines that stop short of the corner, the way real ones do. They are drawn
 * from tokens and never animate, so nothing here needs a reduced-motion path.
 *
 * Both gutters are written out in full rather than composed from a variable:
 * NativeWind reads class names as literals, so a class built from a template
 * string resolves to nothing at all — silently, which this project has shipped
 * once already.
 */
export function CropMarkFrame({ children, gutter = "standard" }: Props) {
  const marks = gutter === "tight" ? TIGHT : STANDARD;

  return (
    <View
      collapsable={false}
      className={gutter === "tight" ? "relative p-1.5" : "relative p-2"}
    >
      <View
        collapsable={false}
        className="overflow-hidden rounded-sm border border-outline bg-surface-variant"
      >
        {children}
      </View>
      {marks.map((className) => (
        <Mark key={className} className={className} />
      ))}
    </View>
  );
}

/** Eight hairlines: two at each corner, meeting on the trimmed edge. */
const STANDARD = [
  "absolute left-0 top-2 h-px w-2",
  "absolute left-2 top-0 h-2 w-px",
  "absolute right-0 top-2 h-px w-2",
  "absolute right-2 top-0 h-2 w-px",
  "absolute bottom-2 left-0 h-px w-2",
  "absolute bottom-0 left-2 h-2 w-px",
  "absolute bottom-2 right-0 h-px w-2",
  "absolute bottom-0 right-2 h-2 w-px",
];

const TIGHT = [
  "absolute left-0 top-1.5 h-px w-1.5",
  "absolute left-1.5 top-0 h-1.5 w-px",
  "absolute right-0 top-1.5 h-px w-1.5",
  "absolute right-1.5 top-0 h-1.5 w-px",
  "absolute bottom-1.5 left-0 h-px w-1.5",
  "absolute bottom-0 left-1.5 h-1.5 w-px",
  "absolute bottom-1.5 right-0 h-px w-1.5",
  "absolute bottom-0 right-1.5 h-1.5 w-px",
];

/** One hairline. Muted ink, so the sample stays the loudest thing in the frame. */
function Mark({ className }: { className: string }) {
  return <View className={`${className} bg-text-muted`} accessibilityElementsHidden />;
}
