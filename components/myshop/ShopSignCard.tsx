import { Pencil } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { router, type Href } from "expo-router";

import { ShopPortrait } from "@/components/ShopPortrait";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { nightChipLabel, signOf, type ShopStatusRecord } from "@/lib/shopStatus";

type Props = {
  shopName: string;
  imageUrl?: string | null;
  /** One line under the name: the shop's place, or the person signed in. */
  subtitle: string;
  status: ShopStatusRecord | null;
  /** Owner only: the sign and the pencil act; for Staff they only say. */
  canChange: boolean;
  /** Called when the sign is tapped; the screen decides (confirm, open, resume). */
  onSignPress: () => void;
  /** Accredited or not, as the shop's standing chip. Null leaves it off. */
  verification: { approved: boolean } | null;
  /** The card's own way into the shop's details. Absent for Staff. */
  onDetailsPress?: () => void;
};

/**
 * The top of My shop: who the shop is, a sign saying whether it is open, and
 * the chips that open the status sheet (gridgo-supplier#267).
 *
 * The sign is the one thing on this screen drawn to be noticed. It hangs from
 * a nail like the one on a shop door, says OPEN or CLOSED in a single word,
 * and under it the one fact that goes with the word: today's hours, the night
 * window, when it opens next, or how long a pause has left. Tapping it does
 * what the word suggests — close an open shop, open a closed one, resume a
 * paused one — and a closed-by-hours shop goes to its hours, since that is the
 * only way to open it.
 */
export function ShopSignCard({
  shopName,
  imageUrl,
  subtitle,
  status,
  canChange,
  onSignPress,
  verification,
  onDetailsPress,
}: Props) {
  const colors = useThemeColors();
  const sign = status ? signOf(status, new Date()) : null;
  const night = status ? nightChipLabel(status.nightJobs) : null;

  return (
    <View className="gg-card gap-4">
      <View className="flex-row items-start gap-3">
        <Pressable
          onPress={onDetailsPress}
          disabled={!onDetailsPress}
          accessibilityRole={onDetailsPress ? "button" : undefined}
          accessibilityLabel={onDetailsPress ? "Your shop details" : undefined}
          accessibilityHint={onDetailsPress ? "Change your shop photo, name, contact person, number and email" : undefined}
          className="min-w-0 flex-1 flex-row items-center gap-3"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <ShopPortrait imageUrl={imageUrl ?? undefined} shopName={shopName} size={52} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-h3 text-text-primary" numberOfLines={2}>
              {shopName}
            </Text>
            <Text className="text-caption text-text-muted" numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </Pressable>

        {sign ? (
          <View className="items-center" style={{ width: 116 }}>
            <Pressable
              onPress={onSignPress}
              disabled={!canChange}
              accessibilityRole={canChange ? "button" : "text"}
              accessibilityLabel={`${sign.open ? "Open" : "Closed"}. ${sign.line}.`}
              accessibilityHint={canChange ? sign.actionLabel : undefined}
              testID="shop-sign"
              className="items-center"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              {/* The nail and the cord the sign hangs from. */}
              <View className="items-center" style={{ height: 14 }} aria-hidden>
                <View className="h-1.5 w-1.5 rounded-pill bg-text-muted" />
                <View className="flex-row" style={{ marginTop: -1 }}>
                  <View
                    className="bg-text-muted"
                    style={{ width: 1.5, height: 14, transform: [{ rotate: "38deg" }], marginRight: 7 }}
                  />
                  <View
                    className="bg-text-muted"
                    style={{ width: 1.5, height: 14, transform: [{ rotate: "-38deg" }], marginLeft: 7 }}
                  />
                </View>
              </View>
              <View
                className={
                  sign.open
                    ? "items-center rounded-field border-2 border-success bg-surface px-3 py-1"
                    : "items-center rounded-field border-2 border-error bg-surface px-3 py-1"
                }
                style={{ transform: [{ rotate: sign.open ? "-2deg" : "2deg" }] }}
              >
                <Text
                  className={sign.open ? "text-h3 font-black text-success" : "text-h3 font-black text-error"}
                  style={{ letterSpacing: 3 }}
                >
                  {sign.word}
                </Text>
              </View>
            </Pressable>
            <View className="mt-1 flex-row items-center gap-1">
              <Text className="text-center text-caption font-medium text-text-secondary" numberOfLines={2}>
                {sign.line}
              </Text>
              {canChange ? (
                <Pressable
                  onPress={() => router.push("/shop-hours" as Href)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit your hours"
                  hitSlop={12}
                >
                  <Pencil size={14} color={colors.textMuted} aria-hidden />
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        {status ? (
          <Pressable
            onPress={() => router.push("/shop-status" as Href)}
            accessibilityRole="button"
            accessibilityLabel={`${status.expressEnabled ? "Express on" : "Express off"}${night ? `, ${night}` : ""}. Open shop status.`}
            className="gg-touch flex-row flex-wrap content-center items-center gap-2"
            testID="status-chips"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <StatusChip
              tone={status.expressEnabled ? "info" : "neutral"}
              icon="zap"
              label={status.expressEnabled ? "Express on" : "Express off"}
            />
            <StatusChip tone="neutral" icon="moon" label={night ?? "No night jobs"} />
          </Pressable>
        ) : null}
        {verification ? (
          verification.approved ? (
            <StatusChip tone="success" icon="circle-check" label="Accredited" />
          ) : (
            <Pressable
              onPress={() => router.push("/accreditation")}
              accessibilityRole="button"
              accessibilityLabel="With Operations. Open accreditation."
              className="gg-touch justify-center"
            >
              <StatusChip tone="warning" icon="clock" label="With Operations" />
            </Pressable>
          )
        ) : null}
      </View>
    </View>
  );
}
