import { Text, View } from "react-native";

import { ShopDayRuler } from "@/components/ShopDayRuler";
import { StatusChip, type StatusIconName, type StatusTone } from "@/components/StatusChip";
import { closureOnDay, manilaClock, shopStatus, type ShopHours, type ShopStatus } from "@/lib/shopHours";

const CHIP: Record<ShopStatus["state"], { tone: StatusTone; icon: StatusIconName; label: string }> = {
  open: { tone: "success", icon: "circle-check", label: "Open" },
  closed: { tone: "neutral", icon: "clock", label: "Closed" },
  temporarily_closed: { tone: "warning", icon: "circle-pause", label: "Closed for now" },
  unreadable: { tone: "warning", icon: "triangle-alert", label: "Needs your hours" },
};

/** Open now or not, what happens next, and today drawn as a bar. */
export function ShopStatusCard({ hours, now }: { hours: ShopHours; now: Date }) {
  const status = shopStatus(hours, now);
  const chip = CHIP[status.state];
  const clock = manilaClock(now);
  // Nothing is drawn open on a closure date or while closed for a while.
  const shut = hours.temporarilyClosed || closureOnDay(hours.closures, clock.dayKey) != null;
  const today = shut ? null : (hours.week.find((row) => row.weekday === clock.weekday) ?? null);
  const extension = hours.todayExtension?.day === clock.dayKey ? hours.todayExtension : null;

  return (
    <View className="gg-card gap-4" accessibilityLiveRegion="polite">
      <View className="gap-2">
        <View className="flex-row">
          <StatusChip tone={chip.tone} icon={chip.icon} label={chip.label} />
        </View>
        <Text className="text-h2 text-text-primary" accessibilityRole="header">
          {status.title}
        </Text>
        <Text className="text-body text-text-secondary">{status.detail}</Text>
      </View>
      {status.state === "unreadable" ? null : (
        <ShopDayRuler
          opensMinute={today?.opensMinute ?? null}
          closesMinute={today?.closesMinute ?? null}
          extensionUntil={shut ? null : (extension?.closesMinute ?? null)}
          nowMinute={clock.minute}
        />
      )}
      <Text className="text-caption text-text-muted">Times are Philippine time.</Text>
    </View>
  );
}
