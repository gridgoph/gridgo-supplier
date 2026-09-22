import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import type { PickedDocument } from "@/store/signupDraft";
import { canPickOnWeb, pickFileOnWeb, type WebPickedAsset } from "@/lib/webFilePick";

/**
 * Choosing a file without sending it anywhere.
 *
 * `hooks/useFileUpload` picks and uploads in one move, which is right when the
 * shop is signed in and the bytes have somewhere to go. Onboarding is the case
 * where they do not: a shop photographs its permit before the account exists,
 * so the pick and the upload are separated and the URI waits in the draft.
 */

export type PickOutcome =
  | { ok: true; document: PickedDocument }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

const CANCELLED: PickOutcome = { ok: false, cancelled: true };

function fromWeb(picked: WebPickedAsset): PickedDocument {
  return {
    uri: picked.uri,
    fileName: picked.name,
    mimeType: picked.mimeType,
    sizeBytes: picked.size,
    file: picked.file,
  };
}

export async function takePhoto(): Promise<PickOutcome> {
  if (canPickOnWeb()) {
    const picked = await pickFileOnWeb("image/*");
    if (!picked) return CANCELLED;
    return { ok: true, document: fromWeb(picked) };
  }
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return {
      ok: false,
      cancelled: false,
      message:
        "GRIDGO needs camera access to photograph your papers. Turn it on for this app in your phone's settings, or choose a file instead.",
    };
  }
  const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return CANCELLED;
  return {
    ok: true,
    document: {
      uri: asset.uri,
      fileName: asset.fileName || "photo.jpg",
      mimeType: asset.mimeType ?? null,
      sizeBytes: asset.fileSize ?? null,
    },
  };
}

export async function chooseFile(): Promise<PickOutcome> {
  if (canPickOnWeb()) {
    const picked = await pickFileOnWeb("application/pdf,image/*");
    if (!picked) return CANCELLED;
    return { ok: true, document: fromWeb(picked) };
  }
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/*"],
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return CANCELLED;
  return {
    ok: true,
    document: {
      uri: asset.uri,
      fileName: asset.name,
      mimeType: asset.mimeType ?? null,
      sizeBytes: asset.size ?? null,
    },
  };
}

/** "2.4 MB", or nothing when the picker did not report a size. */
export function fileSizeText(sizeBytes: number | null): string {
  if (sizeBytes == null || sizeBytes <= 0) return "";
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
