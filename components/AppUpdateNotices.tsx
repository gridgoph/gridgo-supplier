import { CircleAlert, CircleArrowDown, CircleCheck, X } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { WhatsNewList } from "@/components/WhatsNewList";
import { useThemeColors } from "@/hooks/useTheme";
import { useUpdateDownload } from "@/hooks/useUpdateDownload";
import type { LatestRelease } from "@/lib/appUpdate";
import { formatNotificationAt } from "@/lib/dates";
import { bundledNotesFor } from "@/lib/whatsNewHistory";
import {
  dismissUpdatedNotice,
  selectAvailableUpdate,
  selectUpdatedNotice,
  useAppUpdate,
} from "@/store/appUpdate";
import { bundledHistory } from "@/store/whatsNewHistory";

/** The download page, named when the phone cannot open the APK link itself. */
const OPEN_FAILED =
  "The download did not open. Go to gridgo.talasora.com/download in your browser to get it.";

/**
 * App updates in Alerts, above the job notices.
 *
 * Both live on the phone alone: the release comes from GitHub and the
 * "Updated to" card from this phone's own launch history, so nothing here is
 * sent to gridgo-api or counted in the bell's unread number, which belongs to
 * jobs.
 *
 * - **Update available** stays while the phone is behind, including after
 *   "Later" put the sheet away, with the release's What's new and the same
 *   download as the sheet.
 * - **Updated to version X** is written once, on the first launch of a new
 *   build, with the notes that build carries, so it reads offline. It stays
 *   until the shop dismisses it or the next build replaces it.
 *
 * Draws nothing when there is nothing to say, so the screen's own empty state
 * is untouched.
 */
export function AppUpdateNotices() {
  const available = useAppUpdate(selectAvailableUpdate);
  const installed = useAppUpdate((s) => s.installed);
  const updated = useAppUpdate(selectUpdatedNotice);

  if (!available && !updated) return null;

  return (
    <View className="mb-6 gap-3" testID="app-update-notices">
      {available && installed ? (
        <UpdateAvailableCard latest={available} installedName={installed.versionName} />
      ) : null}
      {updated ? <UpdatedCard versionName={updated.build.versionName} at={updated.at} /> : null}
    </View>
  );
}

function UpdateAvailableCard({
  latest,
  installedName,
}: {
  latest: LatestRelease;
  installedName: string;
}) {
  const colors = useThemeColors();
  const { update, openFailed } = useUpdateDownload();

  return (
    <View className="gg-panel-high gap-4" testID="update-available-card">
      <View className="flex-row items-start gap-3">
        <CircleArrowDown size={20} color={colors.info} strokeWidth={2} aria-hidden />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body-lg font-medium text-text-primary">
            Version {latest.versionName} is ready
          </Text>
          <Text className="text-body text-text-secondary">
            This phone has {installedName}. Android installs the new one over it; your jobs, board
            and sign-in stay as they are.
          </Text>
        </View>
      </View>
      <WhatsNewList versionName={latest.versionName} items={latest.whatsNew} />
      {openFailed ? (
        <View className="flex-row items-start gap-2" accessibilityLiveRegion="polite">
          <CircleAlert size={18} color={colors.error} strokeWidth={2} aria-hidden />
          <Text className="flex-1 text-body text-error">{OPEN_FAILED}</Text>
        </View>
      ) : null}
      {/*
        Charcoal, not yellow: the sheet already spends a yellow on the same
        verb, and on this screen the jobs are what a shop acts on.
      */}
      <SecondaryButton label="Update now" onPress={() => void update()} />
    </View>
  );
}

function UpdatedCard({ versionName, at }: { versionName: string; at: number }) {
  const colors = useThemeColors();
  const notes = useMemo(() => bundledNotesFor(bundledHistory(), versionName), [versionName]);

  return (
    <View className="gg-panel gap-4" testID="updated-card">
      <View className="flex-row items-start gap-3">
        <CircleCheck size={20} color={colors.success} strokeWidth={2} aria-hidden />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body-lg font-medium text-text-primary">
            Updated to version {versionName}
          </Text>
          <Text className="text-body text-text-secondary">
            GRIDGO finished updating on this phone.
          </Text>
          <Text className="text-caption text-text-muted">
            {formatNotificationAt(new Date(at).toISOString())}
          </Text>
        </View>
        <Pressable
          onPress={dismissUpdatedNotice}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss: Updated to version ${versionName}`}
          className="gg-touch -mr-2 -mt-2 items-center justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <X size={18} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
      </View>
      <WhatsNewList versionName={versionName} items={notes} />
    </View>
  );
}
