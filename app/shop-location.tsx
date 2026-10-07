import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { router } from "expo-router";

import { BusyOverlay } from "@/components/BusyOverlay";
import { FormScrollView } from "@/components/FormScrollView";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ShopLocationPicker } from "@/components/ShopLocationPicker";
import { spacing } from "@/constants/theme";
import * as api from "@/lib/api";
import { isSamePin, pinProblem, type ShopPin } from "@/lib/shopLocation";
import { PIN_NOT_OPEN_YET, saveShopLocation } from "@/lib/verification";
import { askConfirm } from "@/store/sheets";
import { useSession } from "@/store/session";

/**
 * Moving the shop's own pin, after accreditation.
 *
 * The same picker onboarding uses, because the decision is the same one and a
 * second layout for it would teach a shop two maps. What is different is the
 * stakes: this pin is already pricing live jobs, so the change is confirmed
 * before it is sent and nothing is drawn to press until something has moved.
 *
 * The picker keeps a usable map height, while the form scrolls to keep the
 * address reachable with larger text or an open keyboard. The save action
 * follows the keyboard just as it does in onboarding.
 */
export default function ShopLocationScreen() {
  const user = useSession((s) => s.user);
  const refresh = useSession((s) => s.refresh);
  const [footerHeight, setFooterHeight] = useState(0);

  const saved: ShopPin | null = user?.shop ?? null;
  const [initialPin] = useState(saved);
  const [pin, setPin] = useState<ShopPin | null>(saved);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .getSupplierProfile()
      .then((profile) => {
        if (cancelled || !profile.shop) return;
        setPin((current) => {
          if (current && initialPin && !isSamePin(current, initialPin)) return current;
          return profile.shop;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initialPin]);

  const problem = pinProblem(pin, pin?.label ?? "");
  const unchanged = isSamePin(saved, pin);

  async function save() {
    if (!pin || problem) return;
    const confirmed = await askConfirm({
      question: "Move your shop to this pin?",
      consequence: `GRIDGO will measure every delivery fee from ${pin.label} from now on. Jobs already on your floor keep the pin they were priced with.`,
      confirmLabel: "Move my pin",
      cancelLabel: "Leave it where it is",
    });
    if (!confirmed) return;

    setSaving(true);
    setNotice(null);
    const outcome = await saveShopLocation(pin);
    setSaving(false);

    if (outcome.status === "saved") {
      await refresh();
      router.back();
      return;
    }
    setNotice(outcome.status === "not_open_yet" ? PIN_NOT_OPEN_YET : outcome.message);
  }

  return (
    <View className="gg-screen">
      <FormScrollView bottomOffset={footerHeight + spacing.md}>
        <ShopLocationPicker pin={pin} onChange={setPin} />
      </FormScrollView>

      <KeyboardStickyView>
        <View
          className="gg-page gap-3 bg-canvas pb-6 pt-3"
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        >
          {notice ? <ErrorNotice message={notice} /> : null}
          {unchanged ? (
            // Nothing to save is not a state worth drawing a dead yellow button
            // for — the screen says so instead.
            <Text className="text-caption text-text-muted">
              This is where GRIDGO already has you. Move the pin to change it.
            </Text>
          ) : (
            <PrimaryButton
              label={saving ? "Saving…" : "Save this pin"}
              disabled={saving || Boolean(problem)}
              onPress={() => void save()}
            />
          )}
          {problem && !unchanged ? (
            <Text className="text-caption text-error">{problem}</Text>
          ) : null}
        </View>
      </KeyboardStickyView>

      <BusyOverlay visible={saving} label="Saving your shop's pin" />
    </View>
  );
}
