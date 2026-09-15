import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { UploadList } from "@/components/UploadList";
import { FieldShell } from "@/components/controls/FieldShell";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { probeStorage, storedUploads, type UploadItem, type StorageAvailability } from "@/lib/files";
import { findMilestoneView, milestoneDefinition, nextShopProof, type MilestoneView } from "@/lib/milestones";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useJob } from "@/hooks/useJob";
import { askConfirm } from "@/store/sheets";

/**
 * Filing a Proof of Fulfilment.
 *
 * This is how a shop gets paid. Each part of the payout waits on its own piece
 * of evidence, and GRIDGO cannot release a part it has nothing for — so the
 * screen says which part it is filing, what that part is worth, and stops
 * short of promising the money has moved. Operations reviews and releases.
 *
 * Uploading and filing stay two separate things: a file is stored when GRIDGO
 * says so, and it backs a milestone only when the shop deliberately files it.
 */
export default function FulfilmentProofScreen() {
  const { id, milestone: milestoneParam } = useLocalSearchParams<{
    id: string;
    milestone?: string;
  }>();
  const { job, loading, error, reload } = useJob(id);
  const upload = useFileUpload("fulfilment_proof");

  const [availability, setAvailability] = useState<StorageAvailability>("checking");
  const [filing, setFiling] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [filed, setFiled] = useState<{ target: MilestoneView; file: UploadItem; title: string } | null>(null);

  useEffect(() => {
    let active = true;
    void probeStorage().then((result) => {
      if (active) setAvailability(result);
    });
    return () => {
      active = false;
    };
  }, []);

  // The route may be opened without naming a part (from a card that only knows
  // the job), so fall back to the next one this shop owes.
  const target = job
    ? (findMilestoneView(job, milestoneParam) ?? nextShopProof(job))
    : null;
  const definition = target ? milestoneDefinition(target.code) : null;
  const ready = storedUploads(upload.items);
  const latest = ready[ready.length - 1] ?? null;

  async function fileProof() {
    if (!job || !target || !latest?.fileId) {
      setShowErrors(true);
      return;
    }
    const confirmed = await askConfirm({
      question: `File this as your ${target.label.toLowerCase()} evidence?`,
      consequence: `${latest.fileName} goes to GRIDGO as the evidence for ${api.formatPhp(target.amountMinor)} of your earnings on ${job.title}. Operations reviews it before that part is released.`,
      confirmLabel: "File this evidence",
      cancelLabel: "Not yet",
    });
    if (!confirmed) return;

    setFiling(true);
    setFileError(null);
    try {
      await api.attachFulfilmentProof(latest.fileId, job.id, target.code);
      upload.markAttached(latest.key);
      setFiled({ target, file: { ...latest }, title: job.title });
    } catch (e) {
      setFileError(humanizeApiError(e, offlineMessage("file this evidence")));
    } finally {
      setFiling(false);
    }
  }

  if (filed) {
    const { target, file: latest } = filed;
    return (
      <FlowScreen
        loading={false}
        error={null}
        onRetry={() => void reload()}
        title="Evidence filed"
        subject={filed.title}
        lede={`GRIDGO has your ${target.label.toLowerCase()} evidence. Operations reviews it and releases ${api.formatPhp(target.amountMinor)} to your shop.`}
        footer={<PrimaryButton label="Back to job" onPress={() => router.back()} />}
      >
        <View className="gg-panel gap-2">
          <View className="flex-row">
            <StatusChip tone="info" label="With GRIDGO" icon="clock" />
          </View>
          <UploadList
            items={[{ ...latest, stage: "attached" }]}
            onRetry={(key) => void upload.retry(key)}
            onRemove={upload.remove}
            emptyHint=""
          />
          <Text className="text-body text-text-secondary">
            Release is Operations&apos; step, not yours. You will see this part change to
            Released on the job and on your Earnings screen.
          </Text>
        </View>
      </FlowScreen>
    );
  }

  const unavailablePart = Boolean(job) && !target;

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title={target ? `${target.label} evidence` : "Proof of fulfilment"}
      subject={job?.title}
      lede={
        target
          ? `GRIDGO releases ${target.sharePercent}% of what you earn on this job — ${api.formatPhp(target.amountMinor)} — once it has your evidence for this part. A JPEG, PNG, WebP or PDF is fine.`
          : "Every part of this job's payout already has its evidence, or is waiting on the rider."
      }
      actionError={fileError}
      footer={
        target && availability === "available" ? (
          <>
            <PrimaryButton
              label={filing ? "Filing…" : "File this evidence"}
              disabled={filing || upload.busy}
              onPress={() => void fileProof()}
            />
            <SecondaryButton
              label="Not yet"
              disabled={filing}
              onPress={() => router.back()}
            />
          </>
        ) : (
          <SecondaryButton label="Back to job" onPress={() => router.back()} />
        )
      }
    >
      {unavailablePart ? (
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">
            Nothing to file here
          </Text>
          <Text className="text-body text-text-secondary">
            Open the job to see where each part of your earnings stands.
          </Text>
        </View>
      ) : null}

      {availability === "unavailable" ? (
        <View className="gg-panel gap-2">
          <Text className="text-body font-medium text-text-primary">
            GRIDGO cannot take files right now
          </Text>
          <Text className="text-body text-text-secondary">
            Its file storage is not responding, so your evidence would have nowhere to go.
            Nothing on this job has changed. Try again shortly, and tell Operations if it stays
            down.
          </Text>
        </View>
      ) : null}

      {availability === "checking" ? (
        <Text className="text-body text-text-muted">Checking GRIDGO file storage…</Text>
      ) : null}

      {target && definition && availability === "available" ? (
        <>
          <FieldShell
            label={definition.proofLabel}
            hint={definition.proofHint}
            error={
              showErrors && !latest
                ? "Add a photo and let it finish saving before you file it."
                : null
            }
          >
            <View className="gap-3">
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <SecondaryButton label="Take photo" onPress={() => void upload.takePhoto()} />
                </View>
                <View className="flex-1">
                  <SecondaryButton label="Choose file" onPress={() => void upload.pickDocument()} />
                </View>
              </View>
              <UploadList
                items={upload.items}
                onRetry={(key) => void upload.retry(key)}
                onRemove={upload.remove}
                emptyHint="No evidence yet. Photograph the work, then file it."
              />
            </View>
          </FieldShell>

          <View className="gg-panel gap-1">
            <Text className="text-body font-medium text-text-primary">
              Filing is a separate step
            </Text>
            <Text className="text-body text-text-secondary">
              A file is saved to GRIDGO as soon as it uploads, but it backs nothing until you
              file it against this part. If you add more than one, the last one you saved is the
              one that goes.
            </Text>
          </View>
        </>
      ) : null}
    </FlowScreen>
  );
}
