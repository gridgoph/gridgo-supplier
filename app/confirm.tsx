import { useEffect } from "react";
import { router } from "expo-router";

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

  // Whatever dismisses this sheet, the caller gets an answer.
  useEffect(() => () => settleConfirm(false), []);

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
