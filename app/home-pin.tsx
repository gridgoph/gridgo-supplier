import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { HomePinFields } from "@/components/home/HomePinFields";
import { spacing } from "@/constants/theme";
import {
  EMPTY_HOME_PIN,
  homePinDraftFrom,
  homePinProblems,
  homePinValue,
  nextPinChangeLine,
  type HomePinDraft,
} from "@/lib/homePrinter";
import { useHomePrinter } from "@/store/homePrinter";
import { askConfirm } from "@/store/sheets";

/**
 * Moving a home printer's private pin (gridgo-api#412 §10). Once a month,
 * with the consent asked again; a move switches the printer offline until
 * they switch on from home. A printer who cannot move it yet is told the
 * date instead of being shown a button that would be refused.
 */
export default function HomePinScreen() {
  const insets = useSafeAreaInsets();
  const home = useHomePrinter((s) => s.home);
  const update = useHomePrinter((s) => s.update);
  const [draft, setDraft] = useState<HomePinDraft>(EMPTY_HOME_PIN);
  const [consented, setConsented] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [blocker, setBlocker] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filled = useRef(false);

  useFocusEffect(
    useCallback(() => {
      void useHomePrinter.getState().load();
    }, []),
  );
  useEffect(() => {
    if (filled.current || !home) return;
    filled.current = true;
    setDraft(homePinDraftFrom(home.pin));
  }, [home]);

  if (!home) {
    return (
      <View className="gg-screen gg-page gap-3 pt-4" accessibilityRole="progressbar" accessibilityLabel="Loading">
        <SkeletonBlock className="h-72 w-full rounded-card" />
        <SkeletonBlock className="h-12 w-full" />
      </View>
    );
  }

  const later = nextPinChangeLine(home.pin);
  const wording = home.status.pinConsentWording;
  const problems = homePinProblems(draft, consented);
  const shown = showProblems ? { ...problems, ...(blocker ? { pin: blocker } : {}) } : {};

  async function save() {
    setError(null);
    const value = homePinValue(draft, wording);
    if (Object.keys(problems).length || blocker || !value) {
      setShowProblems(true);
      return;
    }
    const firstPin = home ? !home.pin.barangay : false;
    if (!firstPin) {
      const ok = await askConfirm({
        question: "Move your home pin here?",
        consequence: "You can move it once a month. You go offline now; switch on again from home.",
        confirmLabel: "Move my pin",
        cancelLabel: "Keep my pin",
      });
      if (!ok) return;
    }
    setBusy(true);
    const result = await update({ pin: value }, "save your home pin");
    setBusy(false);
    if (result.status === "ok") {
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/home");
    } else setError(result.message);
  }

  return (
    <View className="gg-screen">
      <FormScrollView contentClassName="gg-page gap-6 pb-8 pt-4">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">Your home pin</Text>
          <Text className="text-body text-text-secondary">
            {later ?? "Where your rider picks up. You can move it once a month."}
          </Text>
        </View>
        {later ? null : (
          <HomePinFields
            draft={draft}
            onChange={(change) => setDraft((current) => ({ ...current, ...change }))}
            problems={shown}
            wording={wording}
            consented={consented}
            onConsent={setConsented}
            onBlockerChange={setBlocker}
          />
        )}
      </FormScrollView>
      {later ? null : (
        <View className="gg-page gap-3 bg-canvas pt-4" style={{ paddingBottom: insets.bottom + spacing.lg }}>
          {error ? <ErrorNotice message={error} /> : null}
          <PrimaryButton label={busy ? "Saving…" : "Save my pin"} disabled={busy} onPress={() => void save()} />
        </View>
      )}
    </View>
  );
}
