import { CloudOff } from "lucide-react-native";
import { useEffect, useMemo } from "react";
import Constants from "expo-constants";
import { ScrollView, Text, View } from "react-native";

import { ReleaseTimeline } from "@/components/ReleaseTimeline";
import { SkeletonList } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import { mergeHistory, WHATS_NEW_HISTORY_COPY } from "@/lib/whatsNewHistory";
import { useAppUpdate } from "@/store/appUpdate";
import { bundledHistory, useWhatsNewHistory } from "@/store/whatsNewHistory";

/**
 * Account > What's new: every release's notes, newest first, each labelled
 * New feature, Improvement or Fix.
 *
 * The history this build shipped with (`extra.whatsNewHistory`) draws at once
 * and offline. Releases made after it are read from GitHub when the page opens
 * and join the list; when that read fails, one calm line says the list stops
 * at this version. See `lib/whatsNewHistory.ts`.
 */
export default function WhatsNewScreen() {
  const colors = useThemeColors();
  const status = useWhatsNewHistory((s) => s.status);
  const online = useWhatsNewHistory((s) => s.online);
  const load = useWhatsNewHistory((s) => s.load);
  // Only a CI build has a version worth marking on the timeline.
  const installed = useAppUpdate((s) => s.installed);
  const installedVersion = installed?.versionName ?? null;
  const shownVersion = installedVersion ?? Constants.expoConfig?.version ?? null;

  const bundled = useMemo(() => bundledHistory(), []);
  const releases = mergeHistory(bundled, online);

  useEffect(() => {
    void load();
  }, [load]);

  const note =
    status === "offline"
      ? WHATS_NEW_HISTORY_COPY.offline
      : status === "unavailable"
        ? WHATS_NEW_HISTORY_COPY.unavailable
        : null;

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page gap-4 pb-12 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-body text-text-secondary">
          {WHATS_NEW_HISTORY_COPY.intro(shownVersion)}
        </Text>

        {note ? (
          <View accessible accessibilityRole="text" className="gg-panel flex-row items-start gap-3">
            <CloudOff size={18} color={colors.textSecondary} aria-hidden />
            <Text className="flex-1 text-body text-text-secondary">{note}</Text>
          </View>
        ) : null}

        {releases.length > 0 ? (
          <ReleaseTimeline releases={releases} installedVersion={installedVersion} />
        ) : status === "loading" || status === "idle" ? (
          <SkeletonList label="Loading release notes" count={3} />
        ) : (
          <View className="gg-card">
            <Text className="text-body text-text-secondary">{WHATS_NEW_HISTORY_COPY.empty}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
