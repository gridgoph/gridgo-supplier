import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";

import { Camera, ChevronDown, PackageOpen } from "lucide-react-native";
import { ProgressPhotoStrip } from "@/components/ProgressPhotoStrip";
import { UploadList } from "@/components/UploadList";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useThemeColors } from "@/hooks/useTheme";
import { attachPackingPhoto } from "@/lib/api";
import { needsPackingPhoto, packingPhotoViews } from "@/lib/packingPhoto";
import { CounterCheckPanel } from "@/components/CounterCheckPanel";
import { PackagingChecklist } from "@/components/PackagingChecklist";
import { packagingCheck, packagingHeld } from "@/lib/packagingReadiness";
import { FlowScreen } from "@/components/FlowScreen";
import { PackageInvoiceNotice } from "@/components/PackageInvoiceNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { custodyForOrder, HANDOFF_SEQUENCE, RIDER_PACKS_SEQUENCE } from "@/lib/handoff";
import { RiderPackingPanel } from "@/components/RiderPackingPanel";
import { ForcedStepNotice } from "@/components/ForcedStepNotice";
import {
  DO_NOT_PACK_YET,
  finishedStage,
  forcedSteps,
  isForcedByGridgo,
  riderPacking,
  ridersPack,
} from "@/lib/shopHandover";
import {
  humanizeApiError,
  isPackingPhotoRequired,
  isProductionPhotoRequired,
  offlineMessage,
} from "@/lib/apiErrors";
import { findAction, waitingOnJob } from "@/lib/jobState";
import { payoutPlanOf } from "@/lib/milestones";
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
import { WhyWeAsk } from "@/components/legal/WhyWeAsk";
import { WHY_WE_ASK } from "@/lib/legal";

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
 *
 * On the newer handover (`lib/shopHandover.ts`) nothing is packed here. The
 * step is "Ready for rider pickup", offered once GRIDGO has approved the
 * finished photos, and the shop prepares packing materials while the products
 * stay unpacked. With a rider at the counter, the screen follows the counter:
 * the rider checks, the shop packs in front of the rider, the shop signs.
 */
export default function HandoffScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);
  const navigation = useNavigation();
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
  // The newer handover has no photo gates here: its finished photos have their own screen.
  const newer = ridersPack(job);
  const finished = job ? finishedStage(job) : null;
  const sendFinished = job ? findAction(job, "send_finished_photos") : null;
  // A refusal speaks for a GRIDGO too old to say whether a photo is on the job.
  const refused = isProductionPhotoRequired(action.failure);
  const photoGate = job && !newer ? needsProductionPhoto(job, refused) : false;
  const packingGate = job && !newer
    ? needsPackingPhoto(job, isPackingPhotoRequired(action.failure))
    : false;
  const canAddPacking =
    job &&
    !photoGate &&
    packingGate &&
    Boolean(findAction(job, "add_packing_photo") || step);
  const packingPhotos = job ? packingPhotoViews(job) : [];
  // A claim or a stop only Operations can lift: nothing here would be taken.
  const packaging = job ? packagingCheck(job) : null;
  const held = packagingHeld(packaging);
  // A refusal the checklist already says, word for word, is not said twice.
  const refusalShown = Boolean(action.error && packaging?.missing.some((item) => item.message === action.error));
  const toSend = upload.items.filter(
    (item) => item.stage === "stored" && item.fileId,
  );
  const progress =
    job && !newer && takesProductionPhoto(job) ? productionProgressOf(job) : null;
  // What the rider counts, per line, so the shop can count it first.
  const targets = job ? countTargets(job) : [];
  const check = job?.state === "rider_assigned" ? counterCheck(job) : null;
  const counterIssue = check && check.stage !== "passed" ? check : null;
  const counter = job ? riderPacking(job) : null;
  const waiting = job ? waitingOnJob(job, payoutPlanOf(job)) : null;

  useEffect(() => {
    if (newer) navigation.setOptions({ title: "Rider pickup" });
  }, [newer, navigation]);

  function messageOperations() {
    if (!job) return;
    router.push({ pathname: "/report", params: { orderId: job.id, title: job.title } });
  }

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
    if (!job || !step?.targetState || photoGate || packingGate || held) return;

    pending.current = true;
    setConfirming(true);
    let saved = false;
    try {
      const confirmed = await askConfirm(
        newer
          ? {
              question: `Call a rider for ${job.title}?`,
              consequence: `Riders will be notified to accept this pickup. ${DO_NOT_PACK_YET}`,
              confirmLabel: "Ready for rider pickup",
              cancelLabel: "Not yet",
            }
          : {
              question: `Mark the package ready for ${job.title}?`,
              consequence:
                "Riders will be notified to accept this pickup. Keep the package at the counter and check it together when the rider arrives; all six checks must pass before transport.",
              confirmLabel: "Mark package ready",
              cancelLabel: "Not yet",
            },
      );
      if (!confirmed) return;

      const updated = await action.run({
        jobId: job.id,
        targetState: step.targetState,
        note: newer
          ? "Ready for rider pickup — packing materials prepared; the products stay unpacked for the rider's check"
          : "Packaging ready — packed and staged for the joint pickup checks with the rider",
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
      title={
        newer
          ? step
            ? "Ready for rider pickup"
            : "Rider pickup"
          : packingGate && !photoGate
            ? "Packed"
            : "Package for pickup"
      }
      subject={job?.title}
      // A stopped pickup is explained once, in its own panel below.
      lede={
        // The instruction about the products is said once, in the custody card.
        newer && !held && !counterIssue
          ? step
            ? "GRIDGO approved your finished products."
            : sendFinished
              ? "Before a rider is called, GRIDGO checks photos of the finished, unpacked products."
              : finished?.stage === "in_review" || finished?.stage === "with_gridgo"
                ? (waiting?.body ?? "")
                : (custody?.now?.situation ??
                  custody?.detail ??
                  "Getting a job ready for the rider who collects it.")
          : held
          ? "This job cannot be packaged yet. What is holding it, and who can clear it, is below."
          : photoGate
            ? "A production photo comes first. After packing, add a separate photo of the package."
            : canAddPacking
              ? "Show the finished prints packed and ready. The client and Operations will see this update."
              : counterIssue
                ? "The package stays at your counter until the rider checks it again."
                : (custody?.detail ??
                  "Getting a job ready for the rider who collects it.")
      }
      // GRIDGO's own sentence for a refused step, even where a panel below
      // explains the fix: the shop pressed something and is owed the answer.
      actionError={sendError ?? (refusalShown ? null : action.error)}
      footer={
        held && job ? (
          // The checklist row carries the way to Operations.
          <SecondaryButton label="Back to job" onPress={() => router.back()} />
        ) : newer && sendFinished && job ? (
          <>
            <PrimaryButton
              label={sendFinished.label}
              onPress={() => router.replace({ pathname: "/job/[id]/finished", params: { id: job.id } })}
            />
            <SecondaryButton label="Back to job" onPress={() => router.back()} />
          </>
        ) : photoGate && job ? (
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
              <WhyWeAsk>{WHY_WE_ASK.packedPhoto}</WhyWeAsk>
            </>
          )
        ) : step && !packingGate ? (
          <>
            <PrimaryButton
              label={action.busy ? "Notifying riders…" : newer ? "Ready for rider pickup" : "Ready for dispatch"}
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
      {(held || (newer && packaging && !packaging.allowed)) && packaging ? (
        <PackagingChecklist check={packaging} stage={finished} onMessageOperations={messageOperations} />
      ) : null}

      {counter && !counterIssue && waiting ? (
        <RiderPackingPanel counter={counter} title={waiting.title} body={waiting.body} targets={targets} />
      ) : null}

      {job && isForcedByGridgo(job) ? <ForcedStepNotice steps={forcedSteps(job)} /> : null}

      {photoGate && !held ? (
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

      {!photoGate && !held && (canAddPacking || packingPhotos.length > 0) ? (
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

      {/* At the counter on the newer handover, the counter panel above says custody step by step. */}
      {job && custody && !canAddPacking && !held && !counter ? (
        <View className="gg-card gap-3">
          <Text className="text-overline text-text-muted">CUSTODY</Text>
          <View className="flex-row">
            <StatusChip
              tone={custody.tone}
              label={custody.label}
              icon={custody.icon}
            />
          </View>
          {counterIssue ? null : custody.now ? (
            // The one thing to do with the products now, on its own line.
            <View
              className="flex-row items-start gap-3 rounded-field border border-warning bg-surface p-3"
              testID="handoff-instruction"
            >
              <View className="pt-0.5">
                <PackageOpen size={16} color={colors.warning} strokeWidth={2} aria-hidden />
              </View>
              <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">
                {custody.now.instruction}
              </Text>
            </View>
          ) : (
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
          onMessageOperations={messageOperations}
        />
      ) : null}

      {packing && !canAddPacking && !held ? <PackageInvoiceNotice /> : null}

      {/* While held, what happens after packing is not the next thing to read. */}
      {canAddPacking || held || counter ? null : <HandoffSequence newer={newer} />}
    </FlowScreen>
  );
}

/**
 * What marking the package ready sets in motion, in the order it happens.
 * Numbered because it is a sequence, and monochrome because the one yellow on
 * this screen is the button that starts it.
 *
 * Folded, like the job docket: at the counter the shop needs who moves next
 * and what to do now, which the custody card says. The steps after that are
 * one tap away rather than a recap standing between the shop and the action.
 */
function HandoffSequence({ newer }: { newer: boolean }) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const sequence = newer ? RIDER_PACKS_SEQUENCE : HANDOFF_SEQUENCE;
  return (
    <View className="gg-panel gap-4">
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`What happens next, ${sequence.length} steps`}
        accessibilityHint={open ? "Closes the steps" : "Opens the steps"}
        className="gg-touch flex-row items-center justify-between gap-3"
      >
        <Text className="text-overline text-text-muted">WHAT HAPPENS NEXT</Text>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <ChevronDown size={18} color={colors.textMuted} strokeWidth={2} />
        </View>
      </Pressable>
      {open ? <SequenceSteps sequence={sequence} /> : null}
    </View>
  );
}

function SequenceSteps({
  sequence,
}: {
  sequence: typeof RIDER_PACKS_SEQUENCE | typeof HANDOFF_SEQUENCE;
}) {
  return (
    <View className="gap-4" accessibilityRole="list">
      {sequence.map((step, index) => {
        const last = index === sequence.length - 1;
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
