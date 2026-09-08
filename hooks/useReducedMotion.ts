import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * True when the device asks for reduced motion.
 *
 * The design system allows one orchestrated transition per flow, and none of
 * them may carry state on their own — so every animation in the app checks
 * this and simply renders the destination instead.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => setReduced(value),
    );
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
