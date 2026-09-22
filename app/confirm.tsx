import { useEffect } from "react";
import { Platform } from "react-native";
import { router, useNavigation } from "expo-router";

import { DangerButton } from "@/components/DangerButton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SheetSurface } from "@/components/SheetSurface";
import { settleConfirm, useSheets } from "@/store/sheets";

/**
 * A deliberate confirmation, presented as the platform's own sheet.
 *
 * "Are you sure?" tells a shop nothing. This names the job, says what GRIDGO
 * will do next, and labels both actions with the outcome — so the safe choice
 * can be taken without reading the whole thing.
 *
 * Every way out of a sheet means the same thing here: drag it down, swipe back,
 * press the hardware back key, tap the scrim or press the second button, and
 * nothing is committed. Only the first button commits.
 */
export default function ConfirmSheet() {
  const pending = useSheets((s) => s.confirm);
  const navigation = useNavigation();

  // Native: the sheet is gone when this screen unmounts (drag, back, scrim).
  // Web: that cleanup also runs on React Strict Mode's first remount, which
  // resolved every confirm as "no" before a button was pressed. beforeRemove
  // is the leave that a remount is not.
  useEffect(() => {
    if (Platform.OS === "web") {
      return navigation.addListener("beforeRemove", () => settleConfirm(false));
    }
    return () => settleConfirm(false);
  }, [navigation]);

  if (!pending) return null;
  const { question, consequence, confirmLabel, cancelLabel, destructive } = pending.request;

  function answer(value: boolean) {
    settleConfirm(value);
    router.back();
  }

  return (
    <SheetSurface
      title={question}
      body={consequence}
      footer={
        <>
          {destructive ? (
            <DangerButton label={confirmLabel} onPress={() => answer(true)} />
          ) : (
            <PrimaryButton label={confirmLabel} onPress={() => answer(true)} />
          )}
          <SecondaryButton label={cancelLabel} onPress={() => answer(false)} />
        </>
      }
    />
  );
}
