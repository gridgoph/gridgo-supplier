import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import {
  RELEASE_LABEL_LOOK,
  RELEASE_LABELS,
  WHATS_NEW_HISTORY_COPY,
  releaseAccessibilityLabel,
  releasePlace,
  type ReleaseNotes,
  type ReleasePlace,
} from "@/lib/whatsNewHistory";

type Props = {
  releases: ReleaseNotes[];
  /** A CI build's version, or `null` where there is no honest one (dev, Expo Go). */
  installedVersion: string | null;
};

/**
 * Every release, newest first, as one timeline: the releases really are a
 * sequence, so a rail runs down the left and each version is a stop on it.
 * The version number leads (it is what a person looks for), the label sits
 * opposite it, and the notes read under it as plain bullets.
 *
 * The stop marks where this phone is: a ringed ink dot on the installed version,
 * an open ring on a newer one it has not installed, a small dot on the rest.
 * The mark is never the only signal; the installed and newer stops also say so
 * in words.
 */
export function ReleaseTimeline({ releases, installedVersion }: Props) {
  return (
    <View className="gg-card-flush px-4 pt-5">
      {releases.map((release, index) => (
        <ReleaseStop
          key={release.version}
          release={release}
          place={releasePlace(release.version, installedVersion)}
          last={index === releases.length - 1}
        />
      ))}
    </View>
  );
}

const RAIL = 20;

function ReleaseStop({
  release,
  place,
  last,
}: {
  release: ReleaseNotes;
  place: ReleasePlace | null;
  last: boolean;
}) {
  const colors = useThemeColors();
  const look = release.kind ? RELEASE_LABEL_LOOK[release.kind] : null;
  const where =
    place === "installed"
      ? WHATS_NEW_HISTORY_COPY.installed
      : place === "newer"
        ? WHATS_NEW_HISTORY_COPY.newer
        : null;

  return (
    <View
      accessible
      accessibilityLabel={releaseAccessibilityLabel(release, place)}
      testID={`release:${release.version}`}
      className="flex-row"
    >
      <View style={{ width: RAIL }} className="items-center">
        {/* Centred on the version line (h3 is 26 tall). */}
        <View style={{ height: 26 }} className="items-center justify-center">
          <StopMark place={place} />
        </View>
        {last ? null : (
          <View style={{ width: 1, flex: 1, backgroundColor: colors.textMuted, opacity: 0.45 }} />
        )}
      </View>

      <View className={`ml-3 flex-1 gap-2 ${last ? "pb-5" : "pb-7"}`}>
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text
            className="text-h3 text-text-primary"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {release.version}
          </Text>
          {look && release.kind ? (
            <StatusChip tone={look.tone} icon={look.icon} label={RELEASE_LABELS[release.kind]} />
          ) : null}
        </View>
        {where ? (
          <Text
            className={
              place === "installed"
                ? "-mt-1 text-caption font-medium text-text-primary"
                : "-mt-1 text-caption text-text-muted"
            }
          >
            {where}
          </Text>
        ) : null}
        <View className="gap-1.5">
          {release.notes.map((note, index) => (
            <View key={`${index}-${note}`} className="flex-row gap-2">
              <Text className="text-body text-text-muted">{"•"}</Text>
              <Text className="flex-1 text-body text-text-secondary">{note}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function StopMark({ place }: { place: ReleasePlace | null }) {
  const colors = useThemeColors();
  if (place === "installed") {
    return (
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          borderWidth: 1.5,
          borderColor: colors.accent,
          backgroundColor: colors.surface,
        }}
        className="items-center justify-center"
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
      </View>
    );
  }
  if (place === "newer") {
    return (
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: colors.textMuted,
          backgroundColor: colors.surface,
        }}
      />
    );
  }
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted }} />;
}
