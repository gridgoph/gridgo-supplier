import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SheetSurface } from "@/components/SheetSurface";
import { useThemeName } from "@/hooks/useTheme";
import { settleDate, useSheets } from "@/store/sheets";

/**
 * The calendar, presented as the platform's own sheet.
 *
 * Android opens its system date and time dialogs imperatively instead, so this
 * route is what every other platform gets. Scrolling the picker changes nothing
 * on its own: a promised finish time only moves when the shop confirms it.
 */
export default function PickDateSheet() {
  const pending = useSheets((s) => s.date);
  const scheme = useThemeName();
  const request = pending?.request ?? null;

  const [draft, setDraft] = useState<Date>(() => startFrom(request));

  useEffect(() => () => settleDate(null), []);

  if (!request) return null;

  const minimumDate = toDate(request.minimum);
  const maximumDate = toDate(request.maximum);

  function close(iso: string | null) {
    settleDate(iso);
    router.back();
  }

  return (
    <SheetSurface
      title={request.title}
      footer={
        <>
          <PrimaryButton
            label={request.confirmLabel}
            onPress={() => close(clamp(draft, minimumDate, maximumDate).toISOString())}
          />
          <SecondaryButton label="Keep what is set" onPress={() => close(null)} />
        </>
      }
    >
      <View className="items-center">
        <DateTimePicker
          value={draft}
          mode={request.mode === "date" ? "date" : "datetime"}
          display="inline"
          themeVariant={scheme}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(_event, picked) => {
            if (picked) setDraft(picked);
          }}
        />
      </View>
    </SheetSurface>
  );
}

function toDate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function startFrom(request: { initial: string | null; minimum?: string } | null): Date {
  const initial = toDate(request?.initial ?? undefined);
  if (initial) return initial;
  const minimum = toDate(request?.minimum);
  const now = new Date();
  return minimum && minimum > now ? minimum : now;
}

function clamp(value: Date, min?: Date, max?: Date): Date {
  if (min && value < min) return new Date(min);
  if (max && value > max) return new Date(max);
  return value;
}
