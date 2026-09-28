import { useState } from "react";
import { Linking } from "react-native";

import { DOWNLOAD_URL } from "@/lib/appUpdate";
import { takeOffer } from "@/store/appUpdate";

/**
 * "Update now", wherever it is drawn: hands the landing site's APK to Android
 * and puts the offer away. The update sheet and the Alerts card share it so
 * both take the one download path.
 */
export function useUpdateDownload(): { update: () => Promise<boolean>; openFailed: boolean } {
  const [openFailed, setOpenFailed] = useState(false);

  const update = async () => {
    try {
      await Linking.openURL(DOWNLOAD_URL);
    } catch {
      setOpenFailed(true);
      return false;
    }
    setOpenFailed(false);
    takeOffer();
    return true;
  };

  return { update, openFailed };
}
