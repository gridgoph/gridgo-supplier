import { Bell, Moon, Pause, Zap } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { router } from "expo-router";

import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { SwitchRow } from "@/components/controls/SwitchRow";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SheetSurface } from "@/components/SheetSurface";
import { useThemeColors } from "@/hooks/useTheme";
import { isPaused, NIGHT_CHOICES, PAUSE_CHOICES, pauseLine, type NightJobs, type ShopStatusPatch } from "@/lib/shopStatus";
import { isShopStaff, useSession } from "@/store/session";
import { useShopStatus } from "@/store/shopStatus";

/**
 * The status sheet (gridgo-supplier#267): what clients can send this shop right
 * now, changed in one place with one thumb.
 *
 * Opened from the status pill on To do and the chips under the shop's name on
 * My shop. It replaces the old Express pill that sent a shop to Products to
 * find a switch. Every control saves the moment it is touched — there is no
 * Save button to forget — and says what changed in a sentence under the
 * heading, so a shop knows it took without looking anywhere else.
 *
 * Staff see the same sheet with every control held still: they can tell a
 * client whether the shop is taking Express tonight, but the Owner decides.
 */
export default function ShopStatusSheet() {
  const colors = useThemeColors();
  const staff = useSession((s) => isShopStaff(s.user));
  const status = useShopStatus((s) => s.status);
  const phase = useShopStatus((s) => s.phase);
  const loadError = useShopStatus((s) => s.error);
  const saving = useShopStatus((s) => s.saving);
  const load = useShopStatus((s) => s.load);
  const save = useShopStatus((s) => s.save);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  async function change(patch: ShopStatusPatch) {
    setFeedback(null);
    const outcome = await save(patch);
    if (outcome.message) setFeedback({ ok: outcome.ok, message: outcome.message });
  }

  const locked = staff || saving || !status;
  const now = new Date();
  const paused = status ? isPaused(status, now) : false;

  return (
    <SheetSurface
      title="Shop status"
      body={staff ? "Only the shop owner can change these." : undefined}
      footer={<SecondaryButton label="Done" onPress={() => router.back()} />}
    >
      {feedback ? (
        <Text
          className={feedback.ok ? "mb-3 text-body text-success" : "mb-3 text-body text-error"}
          accessibilityLiveRegion="polite"
          testID="shop-status-feedback"
        >
          {feedback.message}
        </Text>
      ) : null}

      {!status ? (
        <Text className="text-body text-text-secondary" accessibilityLiveRegion="polite">
          {phase === "not_open_yet"
            ? "GRIDGO is not taking shop status changes yet. Your hours still apply."
            : phase === "failed"
              ? (loadError ?? "Your shop status could not load.")
              : "Loading your shop status…"}
        </Text>
      ) : (
        <View className="gap-1">
          <SettingRow icon={<Zap size={20} color={colors.textPrimary} aria-hidden />}>
            <SwitchRow
              label="Express jobs"
              hint="Documents printed in minutes"
              value={status.expressEnabled}
              disabled={locked}
              onChange={(next) => void change({ expressEnabled: next })}
            />
          </SettingRow>

          <View className="gg-divider" />

          <SettingRow icon={<Moon size={20} color={colors.textPrimary} aria-hidden />}>
            <View className="gap-2 py-2">
              <Text className="text-body-lg text-text-primary">Night jobs</Text>
              <Text className="text-caption text-text-muted">
                Express documents after closing time. Pickup only when riders are off duty.
              </Text>
              <SegmentedControl<NightJobs>
                options={NIGHT_CHOICES}
                value={status.nightJobs}
                onChange={(next) => {
                  if (next !== status.nightJobs) void change({ nightJobs: next });
                }}
                accessibilityLabel="Night jobs until"
                disabled={locked}
              />
            </View>
          </SettingRow>

          <View className="gg-divider" />

          <SettingRow icon={<Bell size={20} color={colors.textPrimary} aria-hidden />}>
            <SwitchRow
              label="Ping me when clients need a printer"
              hint="At night, at most 3 a night, never after your night-jobs time"
              value={status.printerDemandPings}
              disabled={locked}
              onChange={(next) => void change({ printerDemandPings: next })}
            />
          </SettingRow>

          <View className="gg-divider" />

          <SettingRow icon={<Pause size={20} color={colors.textPrimary} aria-hidden />}>
            <View className="gap-2 py-2">
              <Text className="text-body-lg text-text-primary">Pause shop</Text>
              <Text className="text-caption text-text-muted" testID="pause-line">
                {paused && status.pausedUntil
                  ? `${pauseLine(status.pausedUntil, now)}. Jobs you already have still finish.`
                  : "No new jobs for a while. Jobs you already have still finish."}
              </Text>
              {paused ? (
                <PauseButton
                  label="Resume now"
                  disabled={locked}
                  onPress={() => void change({ pause: null })}
                />
              ) : (
                <View className="flex-row gap-2">
                  {PAUSE_CHOICES.map((choice) => (
                    <PauseButton
                      key={choice.value}
                      label={choice.label}
                      accessibilityLabel={`Pause for ${choice.label.toLowerCase()}`}
                      disabled={locked}
                      onPress={() => void change({ pause: choice.value })}
                    />
                  ))}
                </View>
              )}
            </View>
          </SettingRow>
        </View>
      )}
    </SheetSurface>
  );
}

function SettingRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <View className="flex-row gap-3">
      <View className="pt-3">{icon}</View>
      <View className="min-w-0 flex-1">{children}</View>
    </View>
  );
}

/** A pill-shaped action: charcoal outline, never yellow — the sheet has no primary. */
function PauseButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      className={
        disabled
          ? "gg-touch gg-disabled items-center justify-center rounded-pill border border-outline bg-surface px-4"
          : "gg-touch items-center justify-center rounded-pill border border-accent bg-surface px-4"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Text className="text-button text-text-primary">{label}</Text>
    </Pressable>
  );
}
