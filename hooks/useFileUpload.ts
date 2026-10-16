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
import { canPickOnWeb, pickFileOnWeb, pickFilesOnWeb, type WebPickedAsset } from "@/lib/webFilePick";

/**
 * Picking a file and getting it stored.
 *
 * Nothing is marked done optimistically: an item moves from sending, to sent
 * but still being saved, to stored — and only the last of those carries a
 * `fileId` the rest of the app is allowed to use.
 */
type PickedFile = {
  uri: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  file?: File;
};

function fromWeb(picked: WebPickedAsset, fallbackName: string): PickedFile {
  return {
    uri: picked.uri,
    fileName: picked.name || fallbackName,
    mimeType: picked.mimeType,
    sizeBytes: picked.size,
    file: picked.file,
  };
}

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
      file?: File;
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

  /**
   * Several files at once. Every one goes on the list straight away so the
   * shop sees the whole batch, then they send one after another: a phone on
   * mobile data moves one photo faster than five at once, and one that fails
   * keeps its own reason and retry without touching the others.
   */
  const acceptMany = useCallback(
    async (inputs: PickedFile[]) => {
      const queued: UploadItem[] = [];
      const added = inputs.map((input) => {
        counter.current += 1;
        const item = newUploadItem({ key: `up_${counter.current}`, ...input });
        if (item.sizeBytes != null && item.sizeBytes > MAX_PROOF_BYTES) {
          return { ...item, stage: "failed" as const, error: tooLargeMessage(item.sizeBytes) };
        }
        queued.push(item);
        return item;
      });
      if (!added.length) return;
      setItems((current) => [...current, ...added]);
      for (const item of queued) await send(item);
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
    if (canPickOnWeb()) {
      const picked = await pickFileOnWeb("image/*");
      if (!picked) return;
      await accept({
        uri: picked.uri,
        fileName: picked.name || `evidence-${counter.current + 1}.jpg`,
        mimeType: picked.mimeType,
        sizeBytes: picked.size,
        file: picked.file,
      });
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      failWith(
        "Camera",
        "GRIDGO needs camera access to photograph your work. Turn it on for this app in your phone's settings.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    await accept({
      uri: asset.uri,
      fileName: asset.fileName || `evidence-${counter.current + 1}.jpg`,
      mimeType: asset.mimeType ?? null,
      sizeBytes: asset.fileSize ?? null,
    });
  }, [accept, failWith]);

  const pickImage = useCallback(async () => {
    if (canPickOnWeb()) {
      const picked = await pickFileOnWeb("image/*");
      if (!picked) return;
      await accept({
        uri: picked.uri,
        fileName: picked.name || `evidence-${counter.current + 1}.jpg`,
        mimeType: picked.mimeType,
        sizeBytes: picked.size,
        file: picked.file,
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    await accept({
      uri: asset.uri,
      fileName: asset.fileName || `evidence-${counter.current + 1}.jpg`,
      mimeType: asset.mimeType ?? null,
      sizeBytes: asset.fileSize ?? null,
    });
  }, [accept]);

  const pickDocument = useCallback(async () => {
    if (canPickOnWeb()) {
      const picked = await pickFileOnWeb("application/pdf,image/*");
      if (!picked) return;
      await accept({
        uri: picked.uri,
        fileName: picked.name,
        mimeType: picked.mimeType,
        sizeBytes: picked.size,
        file: picked.file,
      });
      return;
    }
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

  /** Several photos from the gallery in one go. `limit` caps the pick (0: no cap). */
  const pickImages = useCallback(
    async (limit = 0) => {
      if (canPickOnWeb()) {
        const picked = await pickFilesOnWeb("image/*");
        const capped = limit > 0 ? picked.slice(0, limit) : picked;
        await acceptMany(capped.map((p, i) => fromWeb(p, `evidence-${counter.current + i + 1}.jpg`)));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: limit,
        orderedSelection: true,
      });
      if (result.canceled) return;
      const assets = limit > 0 ? result.assets.slice(0, limit) : result.assets;
      await acceptMany(
        assets.map((asset, i) => ({
          uri: asset.uri,
          fileName: asset.fileName || `evidence-${counter.current + i + 1}.jpg`,
          mimeType: asset.mimeType ?? null,
          sizeBytes: asset.fileSize ?? null,
        })),
      );
    },
    [acceptMany],
  );

  /** Several PDFs or images from the phone's files in one go. */
  const pickDocuments = useCallback(
    async (limit = 0) => {
      if (canPickOnWeb()) {
        const picked = await pickFilesOnWeb("application/pdf,image/*");
        const capped = limit > 0 ? picked.slice(0, limit) : picked;
        await acceptMany(capped.map((p, i) => fromWeb(p, `evidence-${counter.current + i + 1}`)));
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      const assets = limit > 0 ? result.assets.slice(0, limit) : result.assets;
      await acceptMany(
        assets.map((asset) => ({
          uri: asset.uri,
          fileName: asset.name,
          mimeType: asset.mimeType ?? null,
          sizeBytes: asset.size ?? null,
        })),
      );
    },
    [acceptMany],
  );

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

  /**
   * Why GRIDGO would not attach a stored file, or null to clear it before
   * trying again. The file stays stored, so filing it again sends no bytes.
   */
  const noteAttachError = useCallback(
    (key: string, error: string | null) => patch(key, { error }),
    [patch],
  );

  return {
    items,
    busy: isUploadBusy(items),
    takePhoto,
    pickImage,
    pickDocument,
    pickImages,
    pickDocuments,
    retry,
    remove,
    markAttached,
    noteAttachError,
  };
}
