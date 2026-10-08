import { useCallback, useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";

import { MapFrame, type MapFrameHandle } from "@/components/MapFrame";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { useNow } from "@/hooks/useNow";
import { useRiderApproach } from "@/hooks/useRiderApproach";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { buildApproachMapHtml, type ApproachMapModel } from "@/lib/approachMapHtml";
import type { ShopMapEvent } from "@/lib/mapHtml";
import { approachReadout, isGeoPoint } from "@/lib/riderApproach";

/** Tall enough to see a few streets around both points; the card reads below it. */
const MAP_HEIGHT = 220;

type Props = {
  orderId: string;
  /** The shop's own pin on the job, until GRIDGO's answer names it. */
  shopPin?: { lat: number; lng: number } | null;
  riderFirstName: string | null;
  /** GRIDGO said the rider has collected the job: re-read it. */
  onPickedUp?: () => void;
};

/**
 * The rider on the way to the shop, on a map, with the three facts a shop
 * asks for: how far, roughly how long, and how fresh that is.
 *
 * Drawn only while the job is `rider_assigned`. GRIDGO stops sharing the
 * position at pick-up and so does this panel; it is never a way to follow the
 * rider to the client. The freshness is said as a chip in words, so a faded
 * pin is never the only sign that a position is old.
 */
export function RiderApproachPanel({ orderId, shopPin, riderFirstName, onPickedUp }: Props) {
  const colors = useThemeColors();
  const theme = useThemeName();
  const now = useNow(5_000);
  const answer = useRiderApproach(orderId, { enabled: true, onPickedUp });
  const { route, failed, unavailable } = answer;
  // A first poll that failed still shows the shop, with the failure said below it.
  const approach = answer.approach ?? (failed ? { ping: null, shop: null, hidden: null } : null);
  const frame = useRef<MapFrameHandle>(null);
  const ready = useRef(false);

  const shop = approach?.shop ?? (isGeoPoint(shopPin) ? { lat: shopPin.lat, lng: shopPin.lng } : null);
  const readout = approach
    ? approachReadout({ approach: { ...approach, shop }, route, riderName: riderFirstName, now: now.getTime() })
    : null;

  const model: ApproachMapModel = useMemo(
    () => ({
      theme: theme === "dark" ? "dark" : "light",
      shop,
      rider: approach?.ping ? { lat: approach.ping.lat, lng: approach.ping.lng } : null,
      riderLabel: riderFirstName ?? "",
      faded: readout?.faded ?? false,
      route: route?.coordinates ?? [],
      colors: {
        route: colors.actionYellow,
        casing: "#1A1A1A",
        rider: colors.info,
        shopFill: colors.accent,
        shopInk: colors.accentOn,
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on what the map draws
    [theme, shop?.lat, shop?.lng, approach?.ping?.lat, approach?.ping?.lng, riderFirstName, readout?.faded, route, colors],
  );

  // The document is rebuilt only when the theme flips; every other change is posted into it.
  const html = useMemo(() => buildApproachMapHtml(model), [model.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const post = useCallback(() => {
    if (ready.current) frame.current?.post(JSON.stringify(model));
  }, [model]);

  useEffect(() => {
    post();
  }, [post]);

  const onMapEvent = useCallback(
    (event: ShopMapEvent) => {
      if (event.type !== "ready") return;
      ready.current = true;
      post();
    },
    [post],
  );

  if (unavailable) return null;

  const mapLabel = riderFirstName
    ? `Map of ${riderFirstName}'s way to your shop`
    : "Map of the rider's way to your shop";

  return (
    <View className="gap-3" testID="rider-approach">
      <View
        className="overflow-hidden rounded-field border border-outline"
        style={{ height: MAP_HEIGHT, backgroundColor: colors.surfaceVariant }}
      >
        {readout ? (
          <MapFrame
            ref={frame}
            html={html}
            onReady={() => {
              ready.current = true;
              post();
            }}
            onEvent={onMapEvent}
            accessibilityLabel={mapLabel}
          />
        ) : (
          <SkeletonBlock className="h-full w-full rounded-field" />
        )}
      </View>

      {readout ? (
        <View className="gap-2" accessibilityLiveRegion="polite">
          <View className="gap-0.5">
            <Text className="text-h3 text-text-primary">{readout.headline}</Text>
            {readout.distance ? (
              <Text className="text-body text-text-secondary">{readout.distance} from your shop</Text>
            ) : null}
          </View>
          <View className="flex-row">
            <StatusChip tone={readout.freshness.tone} label={readout.freshness.label} icon={readout.freshness.icon} />
          </View>
          {readout.detail ? <Text className="text-caption text-text-muted">{readout.detail}</Text> : null}
        </View>
      ) : (
        <View className="gap-2">
          <SkeletonBlock className="h-6 w-2/3" />
          <SkeletonBlock className="h-5 w-1/2" />
        </View>
      )}

      {failed ? (
        <Text className="text-caption text-text-muted">
          Could not check for a newer position just now. GRIDGO tries again in a few seconds.
        </Text>
      ) : null}
    </View>
  );
}
