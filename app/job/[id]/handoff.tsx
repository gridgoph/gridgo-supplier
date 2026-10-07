import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { Camera } from "lucide-react-native";
import { ProgressPhotoStrip } from "@/components/ProgressPhotoStrip";
import { UploadList } from "@/components/UploadList";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useThemeColors } from "@/hooks/useTheme";
import { attachPackingPhoto } from "@/lib/api";
import { needsPackingPhoto, packingPhotoViews } from "@/lib/packingPhoto";
import { CounterCheckPanel } from "@/components/CounterCheckPanel";
import { FlowScreen } from "@/components/FlowScreen";
import { PackageInvoiceNotice } from "@/components/PackageInvoiceNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { custodyForOrder, HANDOFF_SEQUENCE } from "@/lib/handoff";
import {
  humanizeApiError,
  isPackingPhotoRequired,
  isProductionPhotoRequired,
  offlineMessage,
} from "@/lib/apiErrors";
import { findAction } from "@/lib/jobState";
import {
  needsProductionPhoto,
  productionProgressOf,
  takesProductionPhoto,
} from "@/lib/productionPhoto";
import { counterCheck, countTargets } from "@/lib/pickupCheck";
import { useJob } from "@/hooks/useJob";
import { useJobAction } from "@/hooks/useJobAction";
import { useJobDrafts } from "@/store/jobDrafts";
import { askConfirm } from "@/store/sheets";

/**
 * The custody moment.
 *
 * This is where a physical job is actually lost, so the screen never leaves the
 * state ambiguous: it says who is holding the job right now, who moves next,
 * and what the rider will do. Marking the package ready is one signal, not a
 * checklist: it tells riders the job can be collected, and quality and count
 * are checked together with the rider at the counter. The rider's own
 * confirmation is what transfers custody.
 *
 * GRIDGO will not take that signal until one photo of the work is on the job.
 * A job without one reaches this screen from an old link or a stale card, or
 * is refused on the press; either way the screen turns into the way to the
 * photo rather than a button GRIDGO would only refuse again.
 */
export default function HandoffScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);
  const action = useJobAction();
  const colors = useThemeColors();
  const upload = useFileUpload("packing_photo");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const clearDraft = useJobDrafts((s) => s.clearDraft);

  const [confirming, setConfirming] = useState(false);
  const pending = useRef(false);
  const busy = confirming || action.busy || sending || upload.busy;

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const custody = job ? custodyForOrder(job) : null;
  // The package is still at the counter until the rider confirms pickup.
  const packing = custody
    ? custody.state !== "with_rider" && custody.state !== "delivered"
    : false;
  const step = job ? findAction(job, "ready_for_pickup") : null;
  // A refusal speaks for a GRIDGO too old to say whether a photo is on the job.
  const refused = isProductionPhotoRequired(action.failure);
  const photoGate = job ? needsProductionPhoto(job, refused) : false;
  const packingGate = job
    ? needsPackingPhoto(job, isPackingPhotoRequired(action.failure))
    : false;
  const canAddPacking =
    job &&
    !photoGate &&
    packingGate &&
    Boolean(findAction(job, "add_packing_photo") || step);
  const packingPhotos = job ? packingPhotoViews(job) : [];
  const toSend = upload.items.filter(
    (item) => item.stage === "stored" && item.fileId,
  );
  const progress =
    job && takesProductionPhoto(job) ? productionProgressOf(job) : null;
  // What the rider counts, per line, so the shop can count it first.
  const targets = job ? countTargets(job) : [];
  const check = job?.state === "rider_assigned" ? counterCheck(job) : null;
  const counterIssue = check && check.stage !== "passed" ? check : null;

  async function sendPacking() {
    if (!job || !canAddPacking || !toSend.length || pending.current) return;
    pending.current = true;
    setConfirming(true);
    try {
      const confirmed = await askConfirm({
        question: "Send this packing photo?",
        consequence:
          "The client and Operations can see it straight away. Once sent, it stays on the job. You will mark Ready for dispatch next.",
        confirmLabel: "Send packing photo",
        cancelLabel: "Not yet",
      });
      if (!confirmed) return;
      setSending(true);
      setSendError(null);
      for (const item of toSend) {
        await attachPackingPhoto(item.fileId!, job.id);
        upload.markAttached(item.key);
      }
      await reload();
    } catch (error) {
      setSendError(
        humanizeApiError(error, offlineMessage("send this packing photo")),
      );
      void reload();
    } finally {
      pending.current = false;
      setConfirming(false);
      setSending(false);
    }
  }

  async function markReady() {
    if (pending.current) return;
    if (!job || !step?.targetState || photoGate || packingGate) return;

    pending.current = true;
    setConfirming(true);
    let saved = false;
    try {
      const confirmed = await askConfirm({
        question: `Mark the package ready for ${job.title}?`,
        consequence:
          "Riders will be notified to accept this pickup. Keep the package at the counter and check it together when the rider arrives; all six checks must pass before transport.",
        confirmLabel: "Mark package ready",
        cancelLabel: "Not yet",
      });
      if (!confirmed) return;

      const updated = await action.run({
        jobId: job.id,
        targetState: step.targetState,
        note: "Packaging ready — packed and staged for the joint pickup checks with the rider",
      });
      if (!updated) {
        // Refused for want of a photo: read the job again so the screen
        // shows the photo step from GRIDGO's own record.
        void reload();
        return;
      }
      saved = true;
      clearDraft(job.id);
      router.replace({ pathname: "/job/[id]", params: { id: job.id } });
    } finally {
      // A successful dispatch stays locked until navigation unmounts this form.
      if (!saved) pending.current = false;
      setConfirming(false);
    }
  }

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title={packingGate && !photoGate ? "Packed" : "Package for pickup"}
      subject={job?.title}
      // A stopped pickup is explained once, in its own panel below.
      lede={
        photoGate
          ? "A production photo comes first. After packing, add a separate photo of the package."
          : canAddPacking
            ? "Show the finished prints packed and ready. The client and Operations will see this update."
            : counterIssue
              ? "The package stays at your counter until the rider checks it again."
              : (custody?.detail ??
                "Getting a job ready for the rider who collects it.")
      }
      // The photo panel below is the explanation; the refusal would say it twice.
      actionError={
        sendError ?? (photoGate || packingGate ? null : action.error)
      }
      footer={
        photoGate && job ? (
          <>
            <PrimaryButton
              label="Add a production photo"
              onPress={() =>
                router.push({
                  pathname: "/job/[id]/progress-photo",
                  params: { id: job.id, ...(refused ? { required: "1" } : {}) },
                })
              }
            />
            <SecondaryButton
              label="Back to job"
              onPress={() => router.back()}
            />
          </>
        ) : canAddPacking ? (
          toSend.length ? (
            <>
              <PrimaryButton
                label={
                  sending ? "Sending packing photo…" : "Send packing photo"
                }
                disabled={busy}
                onPress={() => void sendPacking()}
              />
              <SecondaryButton
                label="Back to job"
                disabled={busy}
                onPress={() => router.back()}
              />
            </>
          ) : (
            <>
              <PrimaryButton
                label={upload.busy ? "Saving photo…" : "Take a packing photo"}
                disabled={busy}
                onPress={() => void upload.takePhoto()}
              />
              <SecondaryButton
                label="Choose from gallery"
                disabled={busy}
                onPress={() => void upload.pickImage()}
              />
            </>
          )
        ) : step && !packingGate ? (
          <>
            <PrimaryButton
              label={action.busy ? "Notifying riders…" : "Ready for dispatch"}
              disabled={busy}
              onPress={() => void markReady()}
            />
            <SecondaryButton
              label="Back to job"
              disabled={busy}
              onPress={() => router.back()}
            />
          </>
        ) : (
          <SecondaryButton label="Back to job" onPress={() => router.back()} />
        )
      }
    >
      {photoGate ? (
        <View className="gg-card gap-2">
          <View className="flex-row">
            <StatusChip
              tone="warning"
              label="Production photo needed"
              icon="triangle-alert"
            />
          </View>
          <Text className="text-body text-text-secondary">
            One photo of this job on your floor, so the client can see it was
            made. If you filed your start-of-production proof as a photo, it
            already counts. A PDF does not.
          </Text>
        </View>
      ) : null}

      {!photoGate && (canAddPacking || packingPhotos.length > 0) ? (
        <View className="gg-card gap-3">
          <View className="flex-row">
            <StatusChip
              tone={packingPhotos.length ? "success" : "info"}
              label={
                packingPhotos.length
                  ? "Packing photo sent"
                  : "Packing photo needed"
              }
              icon={packingPhotos.length ? "circle-check" : "clock"}
            />
          </View>
          {packingPhotos.length ? (
            <>
              <ProgressPhotoStrip
                photos={packingPhotos}
                label="Packing photo"
              />
              <Text className="text-body text-text-secondary">
                The client and Operations can see your packed work.
              </Text>
            </>
          ) : (
            <Text className="text-body text-text-secondary">
              Photograph the finished prints in their packaging, ready to leave
              the shop. Your production photo is a separate update.
            </Text>
          )}
          {canAddPacking ? (
            upload.items.length ? (
              <UploadList
                items={upload.items}
                onRetry={(key) => void upload.retry(key)}
                onRemove={upload.remove}
                wording="photo"
                emptyHint=""
              />
            ) : (
              <View className="h-40 items-center justify-center gap-2 rounded-field border border-dashed border-outline bg-surface-variant px-6">
                <Camera size={28} color={colors.textMuted} aria-hidden />
                <Text className="text-body font-medium text-text-primary">
                  Packed and ready
                </Text>
                <Text className="text-center text-caption text-text-muted">
                  Keep the whole package in view. JPEG, PNG or WebP.
                </Text>
              </View>
            )
          ) : null}
        </View>
      ) : null}

      {job && custody && !canAddPacking ? (
        <View className="gg-card gap-3">
          <Text className="text-overline text-text-muted">CUSTODY</Text>
          <View className="flex-row">
            <StatusChip
              tone={custody.tone}
              label={custody.label}
              icon={custody.icon}
            />
          </View>
          {counterIssue ? null : (
            <Text className="text-body text-text-secondary">
              {custody.detail}
            </Text>
          )}
          <View>
            <SpecRow label="Next move by" value={custody.nextActor} />
            {progress ? (
              <SpecRow
                label="Production photo"
                value={
                  progress.photos.length
                    ? `${progress.photos.length} on the job`
                    : "None yet"
                }
              />
            ) : null}
            <SpecRow
              label="Collect from"
              value={job.pickup?.label || "Your shop address on file"}
            />
            {targets.length === 1 ? (
              <SpecRow
                label="Pieces the rider counts"
                value={targets[0].expected.toLocaleString("en-PH")}
              />
            ) : targets.length > 1 ? (
              targets.map((target) => (
                <SpecRow
                  key={target.key}
                  label={target.name}
                  value={`${target.expected.toLocaleString("en-PH")} pieces`}
                />
              ))
            ) : (
              <SpecRow label="Pieces" value={`${job.quantity}`} />
            )}
          </View>
        </View>
      ) : null}

      {counterIssue ? (
        <CounterCheckPanel
          check={counterIssue}
          onMessageOperations={() =>
            router.push({
              pathname: "/report",
              params: { orderId: job!.id, title: job!.title },
            })
          }
        />
      ) : null}

      {packing && !canAddPacking ? <PackageInvoiceNotice /> : null}

      {canAddPacking ? null : <HandoffSequence />}
    </FlowScreen>
  );
}

/**
 * What marking the package ready sets in motion, in the order it happens.
 * Numbered because it is a sequence, and monochrome because the one yellow on
 * this screen is the button that starts it.
 */
function HandoffSequence() {
  return (
    <View className="gg-panel gap-4" accessibilityRole="list">
      <Text className="text-overline text-text-muted">WHAT HAPPENS NEXT</Text>
      {HANDOFF_SEQUENCE.map((step, index) => {
        const last = index === HANDOFF_SEQUENCE.length - 1;
        return (
          <View key={step.id} className="flex-row gap-3">
            <View className="items-center">
              <View className="h-6 w-6 items-center justify-center rounded-pill bg-accent">
                <Text
                  maxFontSizeMultiplier={1.2}
                  className="text-caption font-medium text-accent-on"
                >
                  {index + 1}
                </Text>
              </View>
              {last ? null : <View className="mt-1 w-px flex-1 bg-outline" />}
            </View>
            <View className={last ? "flex-1 gap-1" : "flex-1 gap-1 pb-3"}>
              <Text className="text-body font-medium text-text-primary">
                {step.title}
              </Text>
              <Text className="text-body text-text-secondary">
                {step.detail}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
