import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  /** What the primary step commits the shop to, in one sentence. */
  consequence?: string | null;
  children: ReactNode;
};

/**
 * The job's next step, pinned under the page.
 *
 * A shop opens a job to do one thing to it, and that thing used to sit under
 * the specification, the earnings, the artwork and the timeline — the fourth
 * screen down. It lives here now, in the same place on every job, the way the
 * client's checkout keeps its total and its one button in view while the
 * order above it scrolls.
 *
 * A hairline and the surface rather than a shadow: the border carries the
 * separation and is still there in Dark, where a shadow over black is nothing.
 * The bottom inset stacks under the design padding, never replaces it — the
 * inset is the system's keep-out strip and the padding is breathing room.
 *
 * It holds at most one yellow control. Every other step here is secondary.
 */
export function JobActionBar({ consequence, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="job-action-bar"
      className="gap-3 border-t border-outline bg-surface px-4 pt-3"
      style={{ paddingBottom: 12 + insets.bottom }}
    >
      {consequence ? <Text className="text-caption text-text-secondary">{consequence}</Text> : null}
      <View className="gap-2">{children}</View>
    </View>
  );
}
