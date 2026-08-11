import type { ReactNode } from "react";
import { Platform, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { spacing } from "@/constants/theme";

type Props = {
  children: ReactNode;
  /** The page's own spacing, as design-system classes. */
  contentClassName?: string;
  /** Set when the content must fill the screen to centre itself. */
  fillHeight?: boolean;
  /** Room between the caret and the keyboard. Raise it to clear a footer. */
  bottomOffset?: number;
};

/**
 * The only scroll surface in this app a keyboard is allowed to open over.
 *
 * React Native's own `KeyboardAvoidingView` shifts a *container*; it has no
 * idea which field is focused, so on a form of five it lifts the whole page by
 * the keyboard's height and the field being typed into can still end up under
 * it. This scrolls the focused input into view instead, measured in window
 * coordinates — which is why it is also the only thing here that is correct
 * under a navigation header and inside a form sheet, where a container's own
 * bottom edge is not the bottom of the screen.
 *
 * Three defaults every form in this app wants, set once so no screen can ship
 * with two of the three:
 *
 * - `bottomOffset` keeps a gap between the caret and the keyboard, so the field
 *   sits *above* the keyboard rather than flush against its top edge.
 * - `keyboardShouldPersistTaps="handled"` is what makes tapping the page
 *   dismiss the keyboard while a button under the thumb still fires on the
 *   first tap — the sensible outside-tap gesture, without a wrapper that eats
 *   presses.
 * - `keyboardDismissMode` lets a drag put the keyboard away. iOS can track the
 *   finger (`interactive`); Android only supports `on-drag`, and RN maps an
 *   unsupported value to nothing at all, so this is one of the few genuine
 *   platform splits left in this file.
 *
 * The page's spacing arrives as classes on a `View` inside, not as classes on
 * the scroll view itself: NativeWind rewrites imports from `react-native`, so a
 * `className` on a component from another package resolves to nothing at all —
 * silently, which is the failure this project has already shipped once.
 */
export function FormScrollView({
  children,
  contentClassName,
  fillHeight,
  bottomOffset,
}: Props) {
  return (
    <KeyboardAwareScrollView
      style={{ flex: 1 }}
      contentContainerStyle={fillHeight ? { flexGrow: 1 } : undefined}
      bottomOffset={bottomOffset ?? spacing.xl}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      showsVerticalScrollIndicator={false}
    >
      <View className={contentClassName}>{children}</View>
    </KeyboardAwareScrollView>
  );
}
