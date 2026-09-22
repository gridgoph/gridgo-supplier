import { useEffect } from "react";
import { Platform } from "react-native";
import { router, useNavigation } from "expo-router";

import { OptionList } from "@/components/controls/OptionList";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SheetSurface } from "@/components/SheetSurface";
import { settlePick, useSheets } from "@/store/sheets";

/**
 * One choice from a short list, as the platform's own sheet.
 *
 * The closed field on the board is a select; this is the list it opens. Picking
 * a row commits it. Dragging the sheet away, back, or "Keep this" leaves the
 * previous choice.
 */
export default function PickSheet() {
  const pending = useSheets((s) => s.pick);
  const navigation = useNavigation();

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

  return (
    <SheetSurface
      title={title}
      body={body}
      footer={
        <SecondaryButton label={cancelLabel ?? "Keep this"} onPress={() => close(null)} />
      }
    >
      <OptionList
        options={options}
        value={selected}
        onChange={(value) => close(value)}
        accessibilityLabel={title}
      />
    </SheetSurface>
  );
}
