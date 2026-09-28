import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";

import { useTourStepActive } from "@/hooks/useTourStep";
import type { TourStepId } from "@/lib/tour";
import { useTour } from "@/store/tour";

/**
 * Marks the real control a tour step lights. It adds no chrome of its own —
 * the wrapper is layout-neutral apart from `collapsable={false}`, which Android
 * needs to keep a view it can measure.
 *
 * It measures only while its step is the one on screen, and again shortly
 * after: a pushed screen is still sliding in when it gains focus, and Home
 * scrolls its section into view, so the first reading is often not the last.
 */
const SETTLE_MS = [0, 120, 320, 650, 1000];

export function TourTarget({
  step,
  children,
  style,
  className,
  testID,
  onLayout,
}: {
  step: TourStepId;
  testID?: string;
  /** The target's own offset in its parent, for a screen that scrolls it into view. */
  onLayout?: (y: number) => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const ref = useRef<View>(null);
  const active = useTourStepActive(step);
  const { width, height } = useWindowDimensions();

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) useTour.getState().setRect(step, { x, y, width: w, height: h });
    });
  }, [step]);

  useEffect(() => {
    if (!active) return;
    const timers = SETTLE_MS.map((delay) => setTimeout(measure, delay));
    return () => {
      timers.forEach(clearTimeout);
      useTour.getState().clearRect(step);
    };
  }, [active, measure, step, width, height]);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={style}
      className={className}
      testID={testID}
      onLayout={(event) => {
        onLayout?.(event.nativeEvent.layout.y);
        if (active) measure();
      }}
    >
      {children}
    </View>
  );
}
