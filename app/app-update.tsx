import { useEffect, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { router, useNavigation } from "expo-router";

import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SheetSurface } from "@/components/SheetSurface";
import { SpecRow } from "@/components/SpecRow";
import { DOWNLOAD_URL, formatDownloadSize } from "@/lib/appUpdate";
import { formatDeadlineLabel } from "@/lib/dates";
import {
  closeUpdateSheet,
  dismissCompleted,
  snoozeOffer,
  takeOffer,
  useAppUpdate,
  type UpdateSheetSubject,
} from "@/store/appUpdate";

/**
 * A newer GRIDGO is out, or this launch is the first run of one.
 *
 * Presented by `hooks/useAppUpdateCheck` as the platform's own sheet, so it
 * never blocks the screen under it: drag it away and the shop is back where it
 * was. The offer names both versions and the download's size — a shop on
 * mobile data deserves to know it is about to pull a hundred megabytes — and
 * "Update now" only opens the APK link. Android's installer owns the rest,
 * which is why "Update completed" is said on the next launch rather than here.
 *
 * The completion note is shown first when both are waiting (a shop installed
 * an older APK than the newest); the offer follows once it is closed.
 */
export default function AppUpdateSheet() {
  const navigation = useNavigation();
  const completed = useAppUpdate((s) => s.completed);
  const offer = useAppUpdate((s) => s.offer);
  const [openFailed, setOpenFailed] = useState(false);

  // Fixed at open: what this sheet is about does not change under the shop's
  // thumb because a check answered while it was reading.
  const [subject] = useState<UpdateSheetSubject | null>(() => {
    const state = useAppUpdate.getState();
    if (state.completed) return { kind: "completed" };
    if (state.offer) return { kind: "offer", versionCode: state.offer.latest.versionCode };
    return null;
  });

  // Native: the sheet is gone when this screen unmounts (drag, back, scrim).
  // Web: that cleanup also runs on Strict Mode's remount — see `app/confirm`.
  useEffect(() => {
    if (Platform.OS === "web") {
      return navigation.addListener("beforeRemove", () => closeUpdateSheet(subject));
    }
    return () => closeUpdateSheet(subject);
  }, [navigation, subject]);

  useEffect(() => {
    if (!subject && router.canGoBack()) router.back();
  }, [subject]);

  if (subject?.kind === "completed" && completed) {
    return (
      <SheetSurface
        title="Update completed"
        body={`You're on ${completed.versionName}.`}
        footer={
          <SecondaryButton
            label="Done"
            onPress={() => {
              dismissCompleted();
              router.back();
            }}
          />
        }
      />
    );
  }

  if (subject?.kind !== "offer" || !offer) return null;
  const { installed, latest } = offer;
  const size = formatDownloadSize(latest.apkBytes);

  async function updateNow() {
    try {
      await Linking.openURL(DOWNLOAD_URL);
    } catch {
      setOpenFailed(true);
      return;
    }
    takeOffer();
    router.back();
  }

  return (
    <SheetSurface
      title="A new version of GRIDGO is ready"
      body="Download it and Android installs it over this one. Your jobs, board and sign-in stay as they are."
      footer={
        <>
          <PrimaryButton label="Update now" onPress={() => void updateNow()} />
          <SecondaryButton
            label="Later"
            onPress={() => {
              snoozeOffer();
              router.back();
            }}
          />
        </>
      }
    >
      <View>
        <SpecRow label="On this phone" value={installed.versionName} />
        <SpecRow label="New version" value={latest.versionName} />
        {latest.publishedAt ? (
          <SpecRow label="Released" value={formatDeadlineLabel(latest.publishedAt)} />
        ) : null}
        {size ? <SpecRow label="Download" value={size} /> : null}
      </View>
      {openFailed ? (
        <View className="mt-4">
          <ErrorNotice message="The download did not open. Go to gridgo.talasora.com/download in your browser to get it." />
        </View>
      ) : null}
    </SheetSurface>
  );
}
