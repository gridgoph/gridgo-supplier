import { useEffect, useMemo, useState } from "react";
import { Platform, View } from "react-native";
import { router, useNavigation } from "expo-router";

import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SheetSurface } from "@/components/SheetSurface";
import { SpecRow } from "@/components/SpecRow";
import { WhatsNewList } from "@/components/WhatsNewList";
import { useUpdateDownload } from "@/hooks/useUpdateDownload";
import { formatDownloadSize } from "@/lib/appUpdate";
import { bundledNotesFor } from "@/lib/whatsNewHistory";
import { formatDeadlineLabel } from "@/lib/dates";
import { rootStackKey } from "@/lib/launch";
import {
  closeUpdateSheet,
  dismissCompleted,
  snoozeOffer,
  useAppUpdate,
  type UpdateSheetSubject,
} from "@/store/appUpdate";
import { useSession } from "@/store/session";
import { bundledHistory } from "@/store/whatsNewHistory";

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
 * Both say what the version brings. The offer reads the release's own
 * "What's new" (`parseWhatsNew`); the completion note reads the notes this
 * build carries (`extra.whatsNewHistory`), so it has them with no network.
 *
 * The completion note is shown first when both are waiting (a shop installed
 * an older APK than the newest); the offer follows once it is closed.
 */
export default function AppUpdateSheet() {
  const navigation = useNavigation();
  const completed = useAppUpdate((s) => s.completed);
  const offer = useAppUpdate((s) => s.offer);
  const { update, openFailed } = useUpdateDownload();
  const installedNotes = useMemo(
    () => (completed ? bundledNotesFor(bundledHistory(), completed.versionName) : []),
    [completed],
  );

  // Fixed at open: what this sheet is about does not change under the shop's
  // thumb because a check answered while it was reading.
  const [subject] = useState<UpdateSheetSubject | null>(() => {
    const state = useAppUpdate.getState();
    if (state.completed) return { kind: "completed" };
    if (state.offer) return { kind: "offer", versionCode: state.offer.latest.versionCode };
    return null;
  });

  // The stack this sheet was pushed onto. A session arriving or leaving
  // re-keys the root stack and takes the sheet with it; that is not the shop
  // answering, so it must not be remembered as a "Later".
  const [stackKey] = useState(() => rootStackKey(useSession.getState().user));

  // Native: the sheet is gone when this screen unmounts (drag, back, scrim).
  // Web: that cleanup also runs on Strict Mode's remount — see `app/confirm`.
  useEffect(() => {
    if (Platform.OS === "web") {
      return navigation.addListener("beforeRemove", () => closeUpdateSheet(subject));
    }
    return () => {
      const byShop = rootStackKey(useSession.getState().user) === stackKey;
      closeUpdateSheet(subject, new Date(), byShop);
    };
  }, [navigation, subject, stackKey]);

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
      >
        {installedNotes.length > 0 ? (
          <WhatsNewList versionName={completed.versionName} items={installedNotes} />
        ) : null}
      </SheetSurface>
    );
  }

  if (subject?.kind !== "offer" || !offer) return null;
  const { installed, latest } = offer;
  const size = formatDownloadSize(latest.apkBytes);

  async function updateNow() {
    if (await update()) router.back();
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
      {latest.whatsNew.length > 0 ? (
        <View className="mt-5">
          <WhatsNewList versionName={latest.versionName} items={latest.whatsNew} />
        </View>
      ) : null}
      {openFailed ? (
        <View className="mt-4">
          <ErrorNotice message="The download did not open. Go to gridgo.talasora.com/download in your browser to get it." />
        </View>
      ) : null}
    </SheetSurface>
  );
}
