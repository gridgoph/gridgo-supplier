import { useEffect, useRef } from "react";
import { Platform, ScrollView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useNavigation } from "expo-router";

import { OptionList } from "@/components/controls/OptionList";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SheetSurface, sheetListMaxHeight } from "@/components/SheetSurface";
import { settlePick, useSheets } from "@/store/sheets";

/**
 * One choice from a list, as the platform's own sheet.
 *
 * The closed field on the board is a select; this is the list it opens. Picking
 * a row commits it. Dragging the sheet away, back, or "Keep this" leaves the
 * previous choice.
 *
 * The rows scroll inside the sheet once they outgrow the screen
 * (`sheetListMaxHeight`), and open on the current choice so a 6:00 PM closing
 * time is in view rather than forty rows down. `nestedScrollEnabled` is what
 * lets Android's bottom sheet hand a vertical drag to the list instead of
 * dragging the sheet away.
 */
export default function PickSheet() {
  const pending = useSheets((s) => s.pick);
  const navigation = useNavigation();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const revealed = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web") {
      return navigation.addListener("beforeRemove", () => settlePick(null));
    }
    return () => settlePick(null);
  }, [navigation]);

  if (!pending) return null;
  const { title, body, options, selected, cancelLabel } = pending.request;

  function close(value: string | null) {
    settlePick(value);
    router.back();
  }

  // Rows are one height, so the selected one sits at its share of the content.
  // One row above it stays visible, so the shop can see the list goes up too.
  function revealSelected(_width: number, contentHeight: number) {
    if (revealed.current) return;
    revealed.current = true;
    const index = options.findIndex((option) => option.value === selected);
    if (index <= 0) return;
    const row = contentHeight / options.length;
    scrollRef.current?.scrollTo({ y: row * (index - 1), animated: false });
  }

  return (
    <SheetSurface
      title={title}
      body={body}
      footer={
        <SecondaryButton label={cancelLabel ?? "Keep this"} onPress={() => close(null)} />
      }
    >
      <ScrollView
        ref={scrollRef}
        style={{ maxHeight: sheetListMaxHeight(height, insets) }}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={revealSelected}
        testID="pick-options"
      >
        <OptionList
          options={options}
          value={selected}
          onChange={(value) => close(value)}
          accessibilityLabel={title}
        />
      </ScrollView>
    </SheetSurface>
  );
}
