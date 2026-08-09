import * as ImagePicker from "expo-image-picker";
import { useCallback, useRef, useState } from "react";

import {
  isEvidenceBusy,
  MAX_EVIDENCE_BYTES,
  newEvidenceItem,
  tooLargeMessage,
  uploadEvidence,
  type EvidenceItem,
} from "@/lib/evidence";
import { useJobDrafts } from "@/store/jobDrafts";

/**
 * Capturing self-QC evidence and getting it stored.
 *
 * Nothing is marked done optimistically: a photo moves from sending, to sent
 * but still being saved, to stored — and only the last of those records an
 * attachment id against the job.
 */
export function useEvidenceUploads(jobId: string | undefined) {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const counter = useRef(0);
  const addQcEvidence = useJobDrafts((s) => s.addQcEvidence);
  const removeQcEvidence = useJobDrafts((s) => s.removeQcEvidence);

  const patch = useCallback((key: string, next: Partial<EvidenceItem>) => {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...next } : item)),
    );
  }, []);

  const send = useCallback(
    async (item: EvidenceItem) => {
      if (!jobId) return;
      patch(item.key, { stage: "uploading", progress: 0, error: null });

      const result = await uploadEvidence(item, jobId, (fraction) => {
        // Once the last byte is away the server is still working; say that
        // rather than sitting at 100% pretending to be finished.
        patch(item.key, {
          progress: fraction,
          stage: fraction >= 1 ? "processing" : "uploading",
        });
      });

      if (result.ok) {
        patch(item.key, {
          stage: "stored",
          progress: 1,
          attachmentId: result.attachmentId,
          error: null,
        });
        addQcEvidence(jobId, result.attachmentId);
      } else {
        patch(item.key, { stage: "failed", error: result.error });
      }
    },
    [addQcEvidence, jobId, patch],
  );

  const accept = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      counter.current += 1;
      const key = `ev_${counter.current}`;
      const item = newEvidenceItem({
        key,
        uri: asset.uri,
        fileName: asset.fileName || `self-qc-${counter.current}.jpg`,
        // iOS reports this unreliably; pass on what there is and let the
        // server be the judge of what it will accept.
        mimeType: asset.mimeType ?? null,
        sizeBytes: asset.fileSize ?? null,
      });

      if (item.sizeBytes != null && item.sizeBytes > MAX_EVIDENCE_BYTES) {
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

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      counter.current += 1;
      setItems((current) => [
        ...current,
        {
          ...newEvidenceItem({
            key: `ev_${counter.current}`,
            uri: "",
            fileName: "Camera",
            mimeType: null,
            sizeBytes: null,
          }),
          stage: "failed",
          error:
            "GRIDGO needs camera access to take evidence photos. Turn it on for this app in your phone's settings.",
        },
      ]);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    await accept(result.assets[0]);
  }, [accept]);

  const pickPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    await accept(result.assets[0]);
  }, [accept]);

  const retry = useCallback(
    async (key: string) => {
      const item = items.find((i) => i.key === key);
      if (!item || !item.uri) return;
      await send(item);
    },
    [items, send],
  );

  const remove = useCallback(
    (key: string) => {
      const item = items.find((i) => i.key === key);
      if (item?.attachmentId && jobId) removeQcEvidence(jobId, item.attachmentId);
      setItems((current) => current.filter((i) => i.key !== key));
    },
    [items, jobId, removeQcEvidence],
  );

  return {
    items,
    busy: isEvidenceBusy(items),
    takePhoto,
    pickPhoto,
    retry,
    remove,
  };
}
