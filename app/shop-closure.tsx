import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { DangerButton } from "@/components/DangerButton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { DateTimeField } from "@/components/controls/DateTimeField";
import { FieldShell } from "@/components/controls/FieldShell";
import { NoteField } from "@/components/controls/NoteField";
import { OptionList } from "@/components/controls/OptionList";
import {
  BLACKOUT_REASONS,
  blackoutSpanLabel,
  validateBlackout,
  type BlackoutReasonId,
} from "@/lib/blackouts";
import { fromDayKey, toDayKey } from "@/lib/day";
import { askConfirm } from "@/store/sheets";
import { newBlackoutId, useShopPlan } from "@/store/shopPlan";

/**
 * One shop closure: the days you are shut and why.
 *
 * Both dates come from the platform calendar rather than a typed string, so a
 * closure can never be saved as text the schedule cannot read.
 */
export default function ShopClosureScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const blackouts = useShopPlan((s) => s.blackouts);
  const addBlackout = useShopPlan((s) => s.addBlackout);
  const updateBlackout = useShopPlan((s) => s.updateBlackout);
  const removeBlackout = useShopPlan((s) => s.removeBlackout);

  const existing = useMemo(
    () => (id ? (blackouts.find((b) => b.id === id) ?? null) : null),
    [blackouts, id],
  );

  const today = toDayKey(new Date());
  const [startDay, setStartDay] = useState(existing?.startDay ?? today);
  const [endDay, setEndDay] = useState(existing?.endDay ?? today);
  const [reason, setReason] = useState<BlackoutReasonId>(existing?.reason ?? "holiday");
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!existing) return;
    const confirmed = await askConfirm({
      question: `Remove the closure on ${blackoutSpanLabel(existing)}?`,
      consequence:
        "Your schedule will treat those days as open again and stop warning you about them.",
      confirmLabel: "Remove closure",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!confirmed) return;
    removeBlackout(existing.id);
    router.back();
  }

  function save() {
    const problem = validateBlackout({ startDay, endDay }, blackouts, existing?.id);
    if (problem) {
      setError(problem);
      return;
    }
    if (existing) {
      updateBlackout(existing.id, { startDay, endDay, reason, note: note.trim() });
    } else {
      addBlackout({
        id: newBlackoutId(),
        startDay,
        endDay,
        reason,
        note: note.trim(),
      });
    }
    router.back();
  }

  return (
    <View className="gg-screen">
      {/*
        No drawn way out. This is a pushed screen, so the stack's own back
        control is the way back — a bare chevron with the platform's accessible
        name and its own 44dp target, identical to every other pushed screen
        here. Nothing is committed until the action below is pressed, which is
        what the old "Cancel" was really saying.
      */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16 pt-4"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">
            {existing ? "Edit closure" : "Add a closure"}
          </Text>
          <Text className="text-body text-text-secondary">
            Your schedule marks these days and warns you before you promise a job on one. Closures
            stay on this device — GRIDGO cannot route work around them yet.
          </Text>
        </View>

        <View className="mt-8 gap-6">
          <FieldShell label="First day closed">
            <DateTimeField
              value={fromDayKey(startDay)}
              mode="date"
              onChange={(next) => {
                const key = toDayKey(next);
                setStartDay(key);
                if (key > endDay) setEndDay(key);
                setError(null);
              }}
              accessibilityLabel="First day closed"
              placeholder="Choose the first closed day"
            />
          </FieldShell>

          <FieldShell
            label="Last day closed"
            hint="Same day for a single-day closure."
            error={error}
          >
            <DateTimeField
              value={fromDayKey(endDay)}
              mode="date"
              minimumDate={fromDayKey(startDay) ?? undefined}
              onChange={(next) => {
                setEndDay(toDayKey(next));
                setError(null);
              }}
              accessibilityLabel="Last day closed"
              placeholder="Choose the last closed day"
            />
          </FieldShell>

          <FieldShell label="Reason">
            <OptionList
              options={BLACKOUT_REASONS.map((r) => ({ value: r.id, label: r.label }))}
              value={reason}
              onChange={setReason}
              accessibilityLabel="Reason for closing"
            />
          </FieldShell>

          <FieldShell label="Note (optional)" hint="Only you see this.">
            <NoteField
              value={note}
              onChange={setNote}
              placeholder="Press service booked for the morning."
              accessibilityLabel="Closure note"
              maxLength={120}
            />
          </FieldShell>
        </View>

        <View className="mt-8 gap-3">
          <PrimaryButton
            label={existing ? "Save closure" : "Add closure"}
            onPress={save}
          />
          {existing ? (
            <DangerButton label="Remove closure" onPress={() => void remove()} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
