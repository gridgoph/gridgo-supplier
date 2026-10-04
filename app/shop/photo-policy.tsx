import { useEffect } from "react";
import { Platform } from "react-native";
import { router, useNavigation } from "expo-router";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SheetSurface } from "@/components/SheetSurface";
import { PhotoPolicyPanel } from "@/components/listing/PhotoPolicyPanel";
import {
  PHOTO_POLICY_BODY,
  PHOTO_POLICY_CONFIRM,
  PHOTO_POLICY_TITLE,
  photoPolicyDecline,
  type PhotoPolicyAnswer,
} from "@/lib/photoPolicy";
import { settlePhotoPolicy, useSheets } from "@/store/sheets";

/**
 * The photo policies checkpoint, as a sheet over the listing.
 *
 * One confirm for every photo on the listing. The second button is never a
 * dead end: at the photo step it leaves the shop on its photos, and before
 * Place on Board it opens them so a doubtful sample can be swapped.
 * Every other way out (drag, back, scrim) is "declined" and commits nothing.
 */
export default function PhotoPolicySheet() {
  const pending = useSheets((s) => s.photoPolicy);
  const navigation = useNavigation();

  // Same leave rule as app/confirm.tsx: web's Strict Mode remount is not a leave.
  useEffect(() => {
    if (Platform.OS === "web") {
      return navigation.addListener("beforeRemove", () => settlePhotoPolicy("declined"));
    }
    return () => settlePhotoPolicy("declined");
  }, [navigation]);

  if (!pending) return null;
  const { moment } = pending.request;

  function answer(value: PhotoPolicyAnswer) {
    settlePhotoPolicy(value);
    router.back();
  }

  return (
    <SheetSurface
      title={PHOTO_POLICY_TITLE}
      body={PHOTO_POLICY_BODY}
      footer={
        <>
          <PrimaryButton label={PHOTO_POLICY_CONFIRM} onPress={() => answer("confirmed")} />
          <SecondaryButton
            label={photoPolicyDecline(moment)}
            onPress={() => answer(moment === "submit" ? "check_photos" : "declined")}
          />
        </>
      }
    >
      <PhotoPolicyPanel />
    </SheetSurface>
  );
}
