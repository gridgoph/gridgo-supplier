import { Camera } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProgressPhotoStrip } from "@/components/ProgressPhotoStrip";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { UploadList } from "@/components/UploadList";
import { FieldShell } from "@/components/controls/FieldShell";
import * as api from "@/lib/api";
import { humanizeApiError, isProductionPhotoUploadNotAllowed, offlineMessage } from "@/lib/apiErrors";
import { probeStorage, type StorageAvailability } from "@/lib/files";
import { findAction } from "@/lib/jobState";
import { milestoneDefinition, nextShopProof } from "@/lib/milestones";
import {
  needsProductionPhoto,
  progressPhotoViews,
  takesProductionPhoto,
  uncountedPhotoProof,
} from "@/lib/productionPhoto";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useJob } from "@/hooks/useJob";
import { useThemeColors } from "@/hooks/useTheme";
import { askConfirm } from "@/store/sheets";

/** Stages whose proof, filed as a picture, also stands as the production photo. */
const PHOTO_PROOF_CODES = new Set(["production_started", "printing", "packaging_qc"]);

/**
 * A photo of the job on the floor, before it is packed.
 *
 * GRIDGO will not let a job be packaged until one photo of the work is on it,
 * and the client sees that photo on their order. One is enough: a start-of-
 * production proof filed as a picture already counts, and the strip at the top
 * says so under the photo it reused. A second, finished-work photo is welcome
 * and never required.
 *
 * Sending a photo moves no money and no state — it is progress the client can
 * see, and it cannot be taken back once it is on the job, which is why the send
 * is confirmed. Taking the photo is the yellow step until there is one to send;
 * then sending it is.
 */
export default function ProgressPhotoScreen() {
  // `required` is a packing refusal the opener already has in hand, for a
  // GRIDGO too old to say whether a photo is on the job.
  const { id, required } = useLocalSearchParams<{ id: string; required?: string }>();
  const { job, loading, error, reload } = useJob(id);
  const upload = useFileUpload("production_photo");

  const [availability, setAvailability] = useState<StorageAvailability>("checking");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let active = true;
    void probeStorage().then((result) => {
      if (active) setAvailability(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const photos = job ? progressPhotoViews(job) : [];
  const waiting = job ? needsProductionPhoto(job, required === "1") : false;
  const open = job ? takesProductionPhoto(job) : false;
  const owedProof = job ? nextShopProof(job) : null;
  const proofCounts = owedProof && PHOTO_PROOF_CODES.has(owedProof.code) ? owedProof : null;
  const pdfProof = job && waiting ? uncountedPhotoProof(job) : null;
  const toSend = upload.items.filter((item) => item.stage === "stored" && item.fileId);
  const canPackage = job ? Boolean(findAction(job, "ready_for_pickup")) : false;

  async function send() {
    if (!job || !toSend.length) return;
    const count = toSend.length;
    const confirmed = await askConfirm({
      question: count === 1 ? `Send this photo to ${job.title}?` : `Send ${count} photos to ${job.title}?`,
      consequence:
        "The client sees it on their order straight away. A photo on the job stays there — it cannot be taken off again.",
      confirmLabel: count === 1 ? "Send photo" : "Send photos",
      cancelLabel: "Not yet",
    });
    if (!confirmed) return;

    setSending(true);
    setSendError(null);
    try {
      for (const item of toSend) {
        await api.attachProductionPhoto(item.fileId!, job.id);
        upload.markAttached(item.key);
      }
      await reload();
      setSent(true);
    } catch (e) {
      // The job left production while the photo was on its way: say so from
      // the job as it stands now, not from the screen that was opened.
      if (isProductionPhotoUploadNotAllowed(e)) await reload();
      setSendError(humanizeApiError(e, offlineMessage("send this photo")));
    } finally {
      setSending(false);
    }
  }

  if (job && sent) {
    return (
      <FlowScreen
        loading={false}
        error={null}
        onRetry={() => void reload()}
        title="Photo on the job"
        subject={job.title}
        lede={
          canPackage
            ? "The client can see it on their order, and this job can now be packaged for pickup."
            : "The client can see it on their order."
        }
        footer={
          canPackage ? (
            <>
              <PrimaryButton
                label="Package for pickup"
                onPress={() => router.replace({ pathname: "/job/[id]/handoff", params: { id: job.id } })}
              />
              <SecondaryButton label="Back to job" onPress={() => router.back()} />
            </>
          ) : (
            <SecondaryButton label="Back to job" onPress={() => router.back()} />
          )
        }
      >
        <View className="gg-card gap-3">
          <View className="flex-row">
            <StatusChip tone="success" label="Client can see it" icon="circle-check" />
          </View>
          <ProgressPhotoStrip photos={photos} />
        </View>
      </FlowScreen>
    );
  }

  const busy = sending || upload.busy;
  const ready = availability === "available" && open;

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title={waiting ? "Add a production photo" : "Production photos"}
      subject={job?.title}
      lede={
        !open
          ? "This job has moved past production, so it no longer takes progress photos."
          : waiting
            ? "GRIDGO needs one photo of this job on your floor before it can be packaged for pickup. The client sees it on their order."
            : "The client sees these on their order. A photo of the finished work before packing is welcome, but not needed."
      }
      // Once the job has moved on, the lede already says so.
      actionError={open ? sendError : null}
      footer={
        !ready ? (
          <SecondaryButton label="Back to job" onPress={() => router.back()} />
        ) : toSend.length ? (
          <>
            <PrimaryButton
              label={sending ? "Sending…" : toSend.length === 1 ? "Send to the job" : `Send ${toSend.length} photos to the job`}
              disabled={busy}
              onPress={() => void send()}
            />
            <SecondaryButton label="Take another photo" disabled={busy} onPress={() => void upload.takePhoto()} />
          </>
        ) : (
          <>
            <PrimaryButton
              label={upload.busy ? "Saving photo…" : waiting ? "Take a photo" : "Take another photo"}
              disabled={busy}
              onPress={() => void upload.takePhoto()}
            />
            <SecondaryButton label="Choose from gallery" disabled={busy} onPress={() => void upload.pickImage()} />
          </>
        )
      }
    >
      {photos.length ? (
        <View className="gg-card gap-3">
          <Text className="text-body font-medium text-text-primary">
            {photos.length === 1 ? "On the job" : `On the job · ${photos.length}`}
          </Text>
          <ProgressPhotoStrip photos={photos} />
          <Text className="text-caption text-text-muted">
            {photos.some((photo) => photo.proofOf)
              ? "A proof you filed as a photo counts here too, so it does not need taking again."
              : "The client sees these on their order."}
          </Text>
        </View>
      ) : null}

      {open && waiting && proofCounts ? (
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">
            One photo can do both
          </Text>
          <Text className="text-body text-text-secondary">
            Your {proofCounts.proofName} proof is still due. File a photo there and it
            also counts as this one, and GRIDGO releases {proofCounts.sharePercent}% of your earnings
            on it.
          </Text>
          <View className="pt-2">
            <SecondaryButton
              label={`File ${proofCounts.proofName} proof instead`}
              disabled={busy}
              onPress={() =>
                router.replace({
                  pathname: "/job/[id]/fulfilment",
                  params: { id: job!.id, milestone: proofCounts.code },
                })
              }
            />
          </View>
        </View>
      ) : null}

      {open && pdfProof ? (
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">
            Your {milestoneDefinition(pdfProof).proofName} proof is not a photo
          </Text>
          <Text className="text-body text-text-secondary">
            It still counts toward your payout. A PDF shows the client nothing of the work, though,
            so packing waits on a photo.
          </Text>
        </View>
      ) : null}

      {availability === "unavailable" && open ? (
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">
            GRIDGO cannot take photos right now
          </Text>
          <Text className="text-body text-text-secondary">
            Its file storage is not responding, so a photo would have nowhere to go. Nothing on this
            job has changed. Try again shortly, and tell Operations if it stays down.
          </Text>
        </View>
      ) : null}

      {availability === "checking" && open ? (
        <Text className="text-body text-text-muted">Checking GRIDGO file storage…</Text>
      ) : null}

      {ready ? (
        <FieldShell
          label={photos.length ? "Another photo" : "Photo of the work"}
          hint="The job on your floor — the press running, printed sheets, or the finished pieces before packing. JPEG, PNG or WebP."
        >
          {upload.items.length ? (
            <UploadList
              items={upload.items}
              onRetry={(key) => void upload.retry(key)}
              onRemove={upload.remove}
              wording="photo"
              emptyHint=""
            />
          ) : (
            <Viewfinder optional={photos.length > 0} />
          )}
        </FieldShell>
      ) : null}
    </FlowScreen>
  );
}

/**
 * The empty frame a photo will fill: a viewfinder, not a line of grey text,
 * so the shop sees the shape of what is missing before the button asks for it.
 */
function Viewfinder({ optional }: { optional: boolean }) {
  const colors = useThemeColors();
  return (
    <View className="h-40 items-center justify-center gap-2 rounded-card border border-dashed border-outline bg-surface px-6">
      <Camera size={28} color={colors.textMuted} strokeWidth={1.75} aria-hidden />
      <Text className="text-center text-body font-medium text-text-primary">
        {optional ? "Nothing new yet" : "No photo yet"}
      </Text>
      <Text className="text-center text-caption text-text-muted">
        {optional ? "A finished-work photo is optional." : "Take one of the job as it stands."}
      </Text>
    </View>
  );
}
