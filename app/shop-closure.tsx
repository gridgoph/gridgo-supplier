import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { DangerButton } from "@/components/DangerButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { DateTimeField } from "@/components/controls/DateTimeField";
import { FieldShell } from "@/components/controls/FieldShell";
import { fromDayKey, toDayKey } from "@/lib/day";
import {
  closureLabel,
  closureLengthLabel,
  manilaClock,
  sameClosure,
  validateClosure,
  withClosure,
  withoutClosure,
  type Closure,
} from "@/lib/shopHours";
import { askConfirm } from "@/store/sheets";
import { saveSchedule } from "@/store/shopSchedule";
import { useShopHours } from "@/store/shopHours";

/**
 * One run of closure dates, saved with GRIDGO.
 *
 * Both dates come from the platform calendar rather than a typed string. A
 * closure is known by its dates — GRIDGO keeps no id for one — so changing it
 * replaces that run, and nothing is sent until the action below is pressed.
 */
export default function ShopClosureScreen() {
  const { start, end } = useLocalSearchParams<{ start?: string; end?: string }>();
  const hours = useShopHours((s) => s.hours);
  const saving = useShopHours((s) => s.saving);
  const load = useShopHours((s) => s.load);

  const existing: Closure | null =
    start && end ? (hours?.closures.find((c) => sameClosure(c, { startDay: start, endDay: end })) ?? null) : null;
  const today = manilaClock(new Date()).dayKey;
  const [startDay, setStartDay] = useState(existing?.startDay ?? start ?? today);
  const [endDay, setEndDay] = useState(existing?.endDay ?? end ?? today);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hours) void load();
  }, [hours, load]);

  async function remove() {
    if (!existing || !hours) return;
    const confirmed = await askConfirm({
      question: `Remove the closure on ${closureLabel(existing)}?`,
      consequence: "GRIDGO will count those dates as open days again when it times new jobs.",
      confirmLabel: "Remove closure",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!confirmed) return;
    const refused = await saveSchedule({ closures: withoutClosure(hours.closures, existing) });
    if (refused) setError(refused);
    else router.back();
  }

  async function save() {
    if (!hours) return;
    const candidate = { startDay, endDay };
    const problem = validateClosure(candidate, hours.closures, existing);
    if (problem) {
      setError(problem);
      return;
    }
    const refused = await saveSchedule({ closures: withClosure(hours.closures, candidate, existing) });
    if (refused) setError(refused);
    else router.back();
  }

  const candidate = { startDay, endDay };

  return (
    <View className="gg-screen">
      {/*
        No drawn way out. This is a pushed screen, so the stack's own back
        control is the way back — a bare chevron with the platform's accessible
        name and its own 44dp target, identical to every other pushed screen
        here. Nothing is committed until the action below is pressed, which is
        what the old "Cancel" was really saying.
      */}
      <FormScrollView contentClassName="gg-page pb-16 pt-4">
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">{existing ? "Change closure dates" : "Add closure dates"}</Text>
          <Text className="text-body text-text-secondary">
            GRIDGO does not count these dates when it times a job, and clients see your shop as closed on them.
            Jobs you already accepted keep their dates.
          </Text>
        </View>

        <View className="mt-8 gap-6">
          <FieldShell label="First closed date">
            <DateTimeField
              value={fromDayKey(startDay)}
              mode="date"
              minimumDate={fromDayKey(existing && existing.startDay < today ? existing.startDay : today) ?? undefined}
              onChange={(next) => {
                const key = toDayKey(next);
                setStartDay(key);
                if (key > endDay) setEndDay(key);
                setError(null);
              }}
              accessibilityLabel="First closed date"
              placeholder="Choose the first closed date"
            />
          </FieldShell>

          <FieldShell label="Last closed date" hint="The same date for a one-day closure.">
            <DateTimeField
              value={fromDayKey(endDay)}
              mode="date"
              minimumDate={fromDayKey(startDay) ?? undefined}
              onChange={(next) => {
                setEndDay(toDayKey(next));
                setError(null);
              }}
              accessibilityLabel="Last closed date"
              placeholder="Choose the last closed date"
            />
          </FieldShell>

          {endDay >= startDay ? (
            <Text className="text-body text-text-primary">
              Closed {closureLabel(candidate)} — {closureLengthLabel(candidate)}.
            </Text>
          ) : null}
        </View>

        {error ? (
          <View className="mt-6">
            <ErrorNotice message={error} />
          </View>
        ) : null}

        <View className="mt-8 gap-3">
          <PrimaryButton
            label={saving ? "Saving…" : existing ? "Save closure dates" : "Add closure dates"}
            disabled={saving || !hours}
            onPress={() => void save()}
          />
          {existing ? <DangerButton label="Remove closure" onPress={() => void remove()} /> : null}
        </View>
      </FormScrollView>
    </View>
  );
}
