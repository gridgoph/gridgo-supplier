import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useRef, useState } from "react";

import type { StoredFile } from "@/lib/api";
import {
  isUploadBusy,
  MAX_PROOF_BYTES,
  newUploadItem,
  tooLargeMessage,
  uploadFile,
  type UploadItem,
} from "@/lib/files";

/**
 * Picking a file and getting it stored.
 *
 * Nothing is marked done optimistically: an item moves from sending, to sent
 * but still being saved, to stored — and only the last of those carries a
 * `fileId` the rest of the app is allowed to use.
 */
export function useFileUpload(purpose: StoredFile["purpose"]) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const counter = useRef(0);

  const patch = useCallback((key: string, next: Partial<UploadItem>) => {
    setItems((current) => current.map((i) => (i.key === key ? { ...i, ...next } : i)));
  }, []);

  const send = useCallback(
    async (item: UploadItem) => {
      patch(item.key, { stage: "uploading", progress: 0, error: null });

      const result = await uploadFile(item, purpose, (fraction) => {
        // Once the last byte is away the API is still writing to storage; say
        // that rather than sitting at 100% pretending to be finished.
        patch(item.key, {
          progress: fraction,
          stage: fraction >= 1 ? "processing" : "uploading",
        });
      });

      if (result.ok) {
        patch(item.key, { stage: "stored", progress: 1, fileId: result.fileId, error: null });
      } else {
        patch(item.key, { stage: "failed", error: result.error });
      }
    },
    [patch, purpose],
  );

  const accept = useCallback(
    async (input: {
      uri: string;
      fileName: string;
      mimeType: string | null;
      sizeBytes: number | null;
    }) => {
      counter.current += 1;
      const item = newUploadItem({ key: `up_${counter.current}`, ...input });

      if (item.sizeBytes != null && item.sizeBytes > MAX_PROOF_BYTES) {
        setItems((current) => [
          ...current,
          { ...item, stage: "failed", error: tooLargeMessage(item.sizeBytes ?? 0) },
        ]);
        return;
      }

      setItems((current) => [...current, item]);
      await send(item);
    },
    [send],
  );

  const failWith = useCallback((fileName: string, error: string) => {
    counter.current += 1;
    setItems((current) => [
      ...current,
      {
        ...newUploadItem({
          key: `up_${counter.current}`,
          uri: "",
          fileName,
          mimeType: null,
          sizeBytes: null,
        }),
        stage: "failed",
        error,
      },
    ]);
  }, []);

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      failWith(
        "Camera",
        "GRIDGO needs camera access to photograph a proof. Turn it on for this app in your phone's settings.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    await accept({
      uri: asset.uri,
      fileName: asset.fileName || `proof-${counter.current + 1}.jpg`,
      mimeType: asset.mimeType ?? null,
      sizeBytes: asset.fileSize ?? null,
    });
  }, [accept, failWith]);

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    await accept({
      uri: asset.uri,
      fileName: asset.fileName || `proof-${counter.current + 1}.jpg`,
      mimeType: asset.mimeType ?? null,
      sizeBytes: asset.fileSize ?? null,
    });
  }, [accept]);

  const pickDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    await accept({
      uri: asset.uri,
      fileName: asset.name,
      mimeType: asset.mimeType ?? null,
      sizeBytes: asset.size ?? null,
    });
  }, [accept]);

  const retry = useCallback(
    async (key: string) => {
      const item = items.find((i) => i.key === key);
      if (!item?.uri) return;
      await send(item);
    },
    [items, send],
  );

  const remove = useCallback((key: string) => {
    setItems((current) => current.filter((i) => i.key !== key));
  }, []);

  const markAttached = useCallback(
    (key: string) => patch(key, { stage: "attached" }),
    [patch],
  );

  return {
    items,
    busy: isUploadBusy(items),
    takePhoto,
    pickImage,
    pickDocument,
    retry,
    remove,
    markAttached,
  };
}
