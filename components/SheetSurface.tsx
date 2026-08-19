import type { ReactNode } from "react";
import { Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "@/constants/theme";

type Props = {
  /** What the sheet is asking, as a heading. */
  title: string;
  /** One or two sentences of consequence. */
  body?: string;
  children?: ReactNode;
  /** The actions. One primary, and the way out. */
  footer: ReactNode;
};

/**
 * The inside of a sheet route.
 *
 * The navigator owns the presentation — height, physics, drag-to-dismiss, the
 * scrim and the grabber all come from the platform. This only paints the
 * surface and keeps the same rhythm inside every sheet: what is being asked,
 * what it means, then the actions with room around them.
 *
 * Height is left to the content, so the sheet's own `fitToContents` detent can
 * measure it — nothing here may claim `flex-1`.
 *
 * Bottom padding is the system inset plus one page step: the last action is a
 * real target, not a kiss against the home indicator. Measuring only
 * `max(inset, 16)` sat Sign out on the gesture zone on a gesture-nav phone.
 */
export function sheetBottomPadding(insetBottom: number): number {
  return insetBottom + spacing.xl;
}

export function SheetSurface({ title, body, children, footer }: Props) {
  const insets = useSafeAreaInsets();

  const surface = (
    <View
      className="rounded-t-card border-t border-outline bg-surface px-4"
      // The only deliberate platform split in this component: iOS draws its
      // grabber inside the sheet's own top edge, so the heading needs a further
      // 8pt to clear it. Android's bottom sheet puts the handle in its own strip
      // above the content. Everything else — radius, colour, spacing — is one
      // value on both.
      style={{
        paddingTop: Platform.OS === "ios" ? 24 : 16,
        paddingBottom: sheetBottomPadding(insets.bottom),
      }}
      accessibilityViewIsModal
      testID="sheet-surface"
    >
      <View className="gap-2">
        <Text className="text-h3 text-text-primary" accessibilityRole="header">
          {title}
        </Text>
        {body ? <Text className="text-body text-text-secondary">{body}</Text> : null}
      </View>

      {children ? <View className="mt-5">{children}</View> : null}

      <View className="mt-6 gap-3">{footer}</View>
    </View>
  );

  // The web build has no native sheet to be presented by, so the route holds
  // the surface at the foot of the screen itself. On iOS and Android the
  // navigator owns that, and claiming the height here would break the sheet's
  // own content-sized detent.
  if (Platform.OS === "web") {
    return (
      <View className="flex-1 justify-end" style={{ backgroundColor: "transparent" }}>
        {surface}
      </View>
    );
  }

  return surface;
}
