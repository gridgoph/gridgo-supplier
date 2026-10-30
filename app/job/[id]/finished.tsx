import { Camera, Check, PackageOpen } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { UploadList } from "@/components/UploadList";
import { FieldShell } from "@/components/controls/FieldShell";
import { WhyWeAsk } from "@/components/legal/WhyWeAsk";
import * as api from "@/lib/api";
import { humanizeApiError, isFinishedPhotoNotAllowed, offlineMessage } from "@/lib/apiErrors";
import { formatTimelineAt } from "@/lib/dates";
import { probeStorage, type StorageAvailability } from "@/lib/files";
import { WHY_WE_ASK } from "@/lib/legal";
import { DO_NOT_PACK_YET, KEEP_UNPACKED, finishedStage } from "@/lib/shopHandover";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useJob } from "@/hooks/useJob";
import { useThemeColors } from "@/hooks/useTheme";
import { askConfirm } from "@/store/sheets";

/**
 * Photos of the finished, unpacked products, sent for GRIDGO's review — the
 * first step of the newer handover (gridgo-api `docs/SHOP_HANDOVER_API.md`).
 *
 * The products stay unpacked: the rider checks them at the counter before the
 * shop packs them in front of the rider. So the photos show the work itself,
 * and sending them is what stops the shop's production time while GRIDGO
 * reviews. If GRIDGO asks for a fix, its note is the first thing here, and the
 * photos it already saw cannot be sent again — new ones are needed.
 *
 * Sending attaches each photo to the job and then asks GRIDGO to review them.
 * A photo on the job stays there, so the send is confirmed. If the photos went
 * on but the review request did not, the next press only asks again.
 */
export default function FinishedProductsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);
  const upload = useFileUpload("finished_product_photo");

  const [availability, setAvailability] = useState<StorageAvailability>("checking");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Photos already on the job whose review request has not gone through yet.
  const [onJob, setOnJob] = useState(0);
  const pending = useRef(false);

  useEffect(() => {
    let active = true;
    void probeStorage().then((result) => {
      if (active) setAvailability(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const stage = job ? finishedStage(job) : null;
  const open = stage?.stage === "not_sent";
  const correction = stage?.stage === "not_sent" ? stage.correction : null;
  const toAttach = upload.items.filter((item) => item.stage === "stored" && item.fileId);
  const count = toAttach.length + onJob;

  async function send() {
    if (!job || !count || pending.current) return;
    pending.current = true;
    try {
      const confirmed = await askConfirm({
        question: count === 1 ? "Send this photo for GRIDGO's review?" : `Send ${count} photos for GRIDGO's review?`,
        consequence:
          "GRIDGO checks the finished, unpacked products before a rider is called, and your production time pauses until it answers. Photos stay on the job once sent.",
        confirmLabel: "Send for review",
        cancelLabel: "Not yet",
      });
      if (!confirmed) return;

      setSending(true);
      setSendError(null);
      for (const item of toAttach) {
        await api.attachFinishedProductPhoto(item.fileId!, job.id);
        upload.markAttached(item.key);
        setOnJob((n) => n + 1);
      }
      await api.submitFinishedProducts(job.id);
      setOnJob(0);
      await reload();
      setSent(true);
    } catch (e) {
      // The job moved on while the photos were on their way: say so from the job as it stands.
      if (isFinishedPhotoNotAllowed(e)) await reload();
      setSendError(humanizeApiError(e, offlineMessage("send these photos")));
    } finally {
      pending.current = false;
      setSending(false);
    }
  }

  if (job && (sent || stage?.stage === "in_review")) {
    const sentAt = stage?.stage === "in_review" ? stage.sentAt : null;
    return (
      <FlowScreen
        loading={false}
        error={null}
        onRetry={() => void reload()}
        title="Sent for review"
        subject={job.title}
        lede="GRIDGO is checking your photos of the finished, unpacked products. Your production time is paused until it answers."
        footer={<SecondaryButton label="Back to job" onPress={() => router.back()} />}
      >
        <View className="gg-card gap-3">
          <View className="flex-row">
            <StatusChip tone="info" label="With GRIDGO" icon="clock" />
          </View>
          {sentAt ? <Text className="text-caption text-text-muted">Sent {formatTimelineAt(sentAt)}</Text> : null}
          <Text className="text-body text-text-secondary">
            Once GRIDGO approves, you mark the job ready for rider pickup. {DO_NOT_PACK_YET}
          </Text>
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
      title={correction ? "Send new finished photos" : "Finished products"}
      subject={job?.title}
      lede={
        !open
          ? "This job has moved past this step. Its latest step is on the job."
          : "Send GRIDGO photos of the finished products."
      }
      actionError={open ? sendError : null}
      footer={
        !ready ? (
          <SecondaryButton label="Back to job" onPress={() => router.back()} />
        ) : count ? (
          <>
            <PrimaryButton
              label={sending ? "Sending…" : count === 1 ? "Send for review" : `Send ${count} photos for review`}
              disabled={busy}
              onPress={() => void send()}
            />
            <SecondaryButton label="Take another photo" disabled={busy} onPress={() => void upload.takePhoto()} />
          </>
        ) : (
          <>
            <PrimaryButton
              label={upload.busy ? "Saving photo…" : "Take a photo"}
              disabled={busy}
              onPress={() => void upload.takePhoto()}
            />
            <SecondaryButton label="Choose from gallery" disabled={busy} onPress={() => void upload.pickImage()} />
            <WhyWeAsk>{WHY_WE_ASK.finishedPhoto}</WhyWeAsk>
          </>
        )
      }
    >
      {correction ? (
        <View className="gg-card gap-2 border-warning" testID="finished-correction">
          <View className="flex-row">
            <StatusChip tone="warning" label="GRIDGO asked for a fix" icon="triangle-alert" />
          </View>
          {correction.note ? (
            <Text className="text-body-lg text-text-primary">“{correction.note}”</Text>
          ) : null}
          <Text className="text-body text-text-secondary">
            Fix it, then photograph the products again. The photos GRIDGO already saw cannot be sent a second time.
          </Text>
          {correction.at ? (
            <Text className="text-caption text-text-muted">Reviewed {formatTimelineAt(correction.at)}</Text>
          ) : null}
        </View>
      ) : null}

      {open ? <PhotoChecklist /> : null}

      {availability === "unavailable" && open ? (
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">GRIDGO cannot take photos right now</Text>
          <Text className="text-body text-text-secondary">
            Its file storage is not responding, so a photo would have nowhere to go. Nothing on this job has changed.
            Try again shortly, and tell Operations if it stays down.
          </Text>
        </View>
      ) : null}

      {availability === "checking" && open ? (
        <Text className="text-body text-text-muted">Checking GRIDGO file storage…</Text>
      ) : null}

      {ready ? (
        <FieldShell label="Photos of the finished products" hint="JPEG, PNG or WebP.">
          {upload.items.length ? (
            <UploadList
              items={upload.items}
              onRetry={(key) => void upload.retry(key)}
              onRemove={upload.remove}
              wording="photo"
              emptyHint=""
            />
          ) : (
            <Viewfinder />
          )}
        </FieldShell>
      ) : null}
    </FlowScreen>
  );
}

/**
 * What a photo has to show, as things the shop can see through the camera
 * rather than a paragraph to remember, and the one thing not to do yet, said
 * once and on its own line.
 */
const PHOTO_CHECKLIST = [
  "Products out of their packing",
  "Printed side showing",
  "Enough of every stack to see the quantity and finish",
  "Good light",
] as const;

function PhotoChecklist() {
  const colors = useThemeColors();
  return (
    <View className="gap-3" testID="finished-checklist">
      <View className="gg-panel gap-2">
        <Text className="text-body font-medium text-text-primary">Each photo shows</Text>
        <View className="gap-2" accessibilityRole="list">
          {PHOTO_CHECKLIST.map((item) => (
            <View key={item} className="flex-row items-start gap-2">
              <View className="pt-0.5">
                <Check size={16} color={colors.textSecondary} strokeWidth={2} aria-hidden />
              </View>
              <Text className="min-w-0 flex-1 text-body text-text-secondary">{item}</Text>
            </View>
          ))}
        </View>
      </View>
      <View className="flex-row items-start gap-3 rounded-field border border-warning bg-surface p-3">
        <View className="pt-0.5">
          <PackageOpen size={16} color={colors.warning} strokeWidth={2} aria-hidden />
        </View>
        <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">{KEEP_UNPACKED}</Text>
      </View>
    </View>
  );
}

/** The empty frame a photo will fill, so the shop sees the shape of what is missing. */
function Viewfinder() {
  const colors = useThemeColors();
  return (
    <View className="h-40 items-center justify-center gap-2 rounded-card border border-dashed border-outline bg-surface px-6">
      <Camera size={28} color={colors.textMuted} strokeWidth={1.75} aria-hidden />
      <Text className="text-center text-body font-medium text-text-primary">No photo yet</Text>
      <Text className="text-center text-caption text-text-muted">Take a photo, or choose one from your gallery.</Text>
    </View>
  );
}
