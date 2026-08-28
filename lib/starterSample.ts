import { Image, type ImageSourcePropType } from "react-native";
import { cacheDirectory, downloadAsync } from "expo-file-system/legacy";

import { starterImage } from "@/constants/images";
import { newUploadItem, uploadFile } from "@/lib/files";
import { attachPhoto, type BoardOutcome } from "@/lib/listingsApi";

/**
 * Put GRIDGO's example print sample on a listing that started from a starter.
 *
 * SAMPLE PHOTOS is a store of uploaded files, not the picker's bundled art.
 * After the listing exists, this uploads that example as the first sample so
 * the shop sees the same picture they chose, not an empty frame.
 *
 * A listing that started blank must not call this. A starter this app has no
 * photo for is a successful no-op — the listing still opened.
 */
export async function seedStarterSample(
  starterId: string,
  itemId: string,
): Promise<BoardOutcome<null>> {
  const source = starterImage(starterId);
  if (!source) return { status: "ok", value: null };

  let uri: string;
  try {
    uri = await localFileForStarter(starterId, source);
  } catch {
    return {
      status: "failed",
      message:
        "GRIDGO could not copy the starter sample onto this listing. Add a sample photo from your camera roll.",
    };
  }

  const uploaded = await uploadFile(
    newUploadItem({
      key: `starter-${starterId}`,
      uri,
      fileName: `${starterId}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: null,
    }),
    "catalog_item_photo",
    () => {},
  );
  if (!uploaded.ok) return { status: "failed", message: uploaded.error };

  return attachPhoto(uploaded.fileId, itemId, 0);
}

/** A device file GRIDGO's uploader can stream. Packager URLs are copied first. */
async function localFileForStarter(
  starterId: string,
  source: ImageSourcePropType,
): Promise<string> {
  const resolved = Image.resolveAssetSource(source);
  if (!resolved?.uri) {
    throw new Error("unreadable starter sample");
  }
  if (resolved.uri.startsWith("file:")) return resolved.uri;
  if (!cacheDirectory) {
    throw new Error("no cache directory");
  }
  const dest = `${cacheDirectory}gridgo-starter-${starterId}.jpg`;
  const downloaded = await downloadAsync(resolved.uri, dest);
  if (!downloaded?.uri) {
    throw new Error("starter sample download failed");
  }
  return downloaded.uri;
}
