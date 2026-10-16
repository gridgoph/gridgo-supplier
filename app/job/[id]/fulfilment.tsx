import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { PackageInvoiceNotice } from "@/components/PackageInvoiceNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProofPhotoGrid, ProofQueue, proofCountLabel } from "@/components/ProofPhotos";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { FieldShell } from "@/components/controls/FieldShell";
import * as api from "@/lib/api";
import { apiErrorCode, humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { probeStorage, storedUploads, type StorageAvailability } from "@/lib/files";
import { MAX_PROOFS_PER_STAGE, milestoneDefinition, proofTarget } from "@/lib/milestones";
import { needsProductionPhoto } from "@/lib/productionPhoto";
import { useFileUpload } from "@/hooks/useFileUpload";
import { WHY_WE_ASK } from "@/lib/legal";
import { useJob } from "@/hooks/useJob";
import { askConfirm } from "@/store/sheets";

/** What the last filing did, said once above the grid. */
type FiledNote = { filed: number; repeats: number; released: boolean };

/**
 * Filing Proof of Fulfilment.
 *
 * This is how a shop gets paid. Each part of the payout waits on its own
 * evidence, and GRIDGO cannot release a part it has nothing for — so the
 * screen says which part it is filing, what that part is worth, and stops
 * short of promising the money has moved. The GRIDGO Team reviews and releases.
 *
 * A part takes as many pictures as the shop wants to show, before or after it
 * is released, up to {@link MAX_PROOFS_PER_STAGE}
 * (gridgo-api `docs/OPERATIONAL_MODEL_V2_API.md#payout-proofs`). The grid at
 * the top is GRIDGO's list, each picture once; the queue under it is this
 * phone's, and a photo leaves the queue in the same moment it joins the grid,
 * so nothing is ever drawn twice.
 *
 * Uploading and filing stay two separate things: a file is stored when GRIDGO
 * says so, and it backs a part only when the shop deliberately files it. Each
 * file is attached on its own, so one refusal leaves the others filed.
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
  const [filedNote, setFiledNote] = useState<FiledNote | null>(null);
  // The order GRIDGO answered the last attach with, until the next read of
  // this job replaces it: the grid shows a filed photo the moment the queue
  // lets go of it.
  const [answered, setAnswered] = useState<{ base: api.Order; order: api.Order } | null>(null);
  // The part is fixed for the visit once chosen, so filing its first photo
  // does not hop the screen on to the next part owed.
  const [targetCode, setTargetCode] = useState<string | undefined>(milestoneParam);

  useEffect(() => {
    let active = true;
    void probeStorage().then((result) => {
      if (active) setAvailability(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const order = answered && answered.base === job ? answered.order : job;
  const target = order ? proofTarget(order, targetCode) : null;
  if (target && target.code !== targetCode) setTargetCode(target.code);

  const milestone = target ? order?.payoutMilestones?.find((m) => m.code === target.code) : undefined;
  const definition = target ? milestoneDefinition(target.code, milestone) : null;
  // A picture filed here also opens packing; a PDF earns the share but not that.
  const photoCounts =
    Boolean(order && target && needsProductionPhoto(order)) &&
    ["production_started", "printing", "packaging_qc"].includes(target?.code ?? "");

  const ready = storedUploads(upload.items).filter((item) => item.stage === "stored");
  const queued = upload.items;
  const onFile = target?.proofCount ?? 0;
  const room = Math.max(0, MAX_PROOFS_PER_STAGE - onFile - queued.filter((i) => i.stage !== "failed").length);
  const released = target?.stage === "released";
  const count = (n: number) => `${n} ${n === 1 ? "photo" : "photos"}`;

  async function fileProofs() {
    if (!order || !target || !ready.length) return;
    const confirmed = await askConfirm({
      question: `File ${count(ready.length)} as your ${target.label.toLowerCase()} evidence?`,
      consequence: released
        ? `They are added to the evidence for this part of ${order.title}. GRIDGO has already released it, so what you are paid does not change. Filed evidence stays on the job.`
        : `They go to GRIDGO as the evidence for ${api.formatPhp(target.amountMinor)} of your earnings on ${order.title}. The GRIDGO Team reviews them before that part is released. Filed evidence stays on the job.`,
      confirmLabel: `File ${count(ready.length)}`,
      cancelLabel: "Not yet",
    });
    if (!confirmed) return;

    setFiling(true);
    setFileError(null);
    setFiledNote(null);
    const base = job;
    let latest: api.Order | null = null;
    let filed = 0;
    let repeats = 0;
    let full = false;
    for (const item of ready) {
      if (!item.fileId) continue;
      upload.noteAttachError(item.key, null);
      try {
        const result = await api.attachFulfilmentProof(item.fileId, order.id, target.code);
        latest = result.order;
        const stage = result.order.payoutMilestones?.find((m) => m.code === target.code);
        // GRIDGO attaches a picture the part already lists but does not list it
        // again; the grid already shows it, so the queue simply lets it go.
        if (stage && !(stage.pofFileIds ?? []).includes(item.fileId)) repeats += 1;
        else filed += 1;
        // Leaving the queue and joining the grid land in the same render.
        upload.remove(item.key);
        if (base) setAnswered({ base, order: result.order });
      } catch (e) {
        const message = humanizeApiError(e, offlineMessage("file this photo"));
        upload.noteAttachError(item.key, message);
        // Past the limit every other photo would be refused the same way, and
        // the grid is behind GRIDGO's count (another phone filed too), so read
        // it again. The photo's own row says why; the screen says the part is full.
        if (apiErrorCode(e) === "proof_limit_reached") {
          full = true;
          void reload();
          break;
        }
      }
    }
    setFiling(false);
    if (filed || repeats) {
      const stageNow = latest?.payoutMilestones?.find((m) => m.code === target.code);
      setFiledNote({ filed, repeats, released: stageNow ? stageNow.status === "released" : released });
    }
    if (!full && filed + repeats < ready.length) {
      setFileError((current) => current ?? "Some photos were not filed. Each one says why; file them again when you are ready.");
    }
  }

  const unavailablePart = Boolean(order) && !target;

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title={target ? `${target.label} evidence` : "Proof of fulfilment"}
      subject={order?.title}
      lede={
        target
          ? (released
              ? `GRIDGO has released this part — ${api.formatPhp(target.amountMinor)}. You can still add photos to its evidence.`
              : `GRIDGO releases ${target.sharePercent}% of what you earn on this job — ${api.formatPhp(target.amountMinor)} — once it has your evidence for this part. Add as many photos as show the work.`) +
            (photoCounts
              ? " A photo also counts as the production photo you need before packing; a PDF is accepted, but does not."
              : "")
          : "No part of this job takes your evidence right now. The rider files the delivery."
      }
      actionError={fileError}
      footer={
        // A full part would refuse the filing, so there is nothing to press.
        target?.canFileMore && availability === "available" && ready.length ? (
          <>
            <PrimaryButton
              label={filing ? "Filing…" : `File ${count(ready.length)}`}
              disabled={filing || upload.busy}
              onPress={() => void fileProofs()}
            />
            <SecondaryButton label="Not yet" disabled={filing} onPress={() => router.back()} />
          </>
        ) : (
          <SecondaryButton label="Back to job" onPress={() => router.back()} />
        )
      }
    >
      {unavailablePart ? (
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">Nothing to file here</Text>
          <Text className="text-body text-text-secondary">
            Open the job to see where each part of your earnings stands.
          </Text>
        </View>
      ) : null}

      {filedNote ? (
        <View className="gg-panel gap-2" testID="proof-filed-note">
          <View className="flex-row">
            <StatusChip tone="success" label={filedNote.filed ? "Filed" : "Already on file"} icon="circle-check" />
          </View>
          <Text className="text-body text-text-primary">
            {filedNote.filed
              ? filedNote.released
                ? `${count(filedNote.filed)} added to this part's evidence.`
                : `${count(filedNote.filed)} filed. The GRIDGO Team reviews the evidence and releases this part — you will see it change to Released.`
              : "GRIDGO already had these photos for this part."}
          </Text>
          {filedNote.filed && filedNote.repeats ? (
            <Text className="text-body text-text-secondary">
              {filedNote.repeats === 1
                ? "1 photo was already on file, so it is listed once."
                : `${filedNote.repeats} photos were already on file, so each is listed once.`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {availability === "unavailable" ? (
        <View className="gg-panel gap-2">
          <Text className="text-body font-medium text-text-primary">GRIDGO cannot take files right now</Text>
          <Text className="text-body text-text-secondary">
            Its file storage is not responding, so your evidence would have nowhere to go. Nothing on
            this job has changed. Try again shortly, and message the GRIDGO Team if it stays down.
          </Text>
        </View>
      ) : null}

      {availability === "checking" ? (
        <Text className="text-body text-text-muted">Checking GRIDGO file storage…</Text>
      ) : null}

      {target?.code === "packaging_qc" ? <PackageInvoiceNotice /> : null}

      {target && onFile ? (
        <View className="gap-2" testID="proof-on-file">
          <View className="flex-row items-baseline justify-between gap-3">
            <Text className="text-body font-medium text-text-primary">{proofCountLabel(onFile)}</Text>
            <Text className="text-caption text-text-muted">Up to {MAX_PROOFS_PER_STAGE}</Text>
          </View>
          <ProofPhotoGrid fileIds={target.pofFileIds} label={`${target.label} evidence`} />
        </View>
      ) : null}

      {target && definition && availability === "available" ? (
        <FieldShell
          label={onFile ? "Add more" : definition.proofLabel}
          hint={definition.proofHint}
          why={WHY_WE_ASK.proofPhoto}
        >
          <View className="gap-3">
            {room > 0 ? (
              <>
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <SecondaryButton label="Take photo" onPress={() => void upload.takePhoto()} />
                  </View>
                  <View className="flex-1">
                    <SecondaryButton label="Choose photos" onPress={() => void upload.pickImages(room)} />
                  </View>
                </View>
                <Pressable
                  onPress={() => void upload.pickDocuments(room)}
                  accessibilityRole="button"
                  className="gg-touch justify-center self-start"
                >
                  <Text className="text-body font-medium text-text-secondary underline">Add a PDF instead</Text>
                </Pressable>
              </>
            ) : (
              <Text className="text-body text-text-secondary">
                This part has room for {MAX_PROOFS_PER_STAGE} photos and they are all taken. Message
                the GRIDGO Team if they need more.
              </Text>
            )}
            {queued.length ? (
              <ProofQueue
                items={queued}
                onRetry={(key) => void upload.retry(key)}
                onRemove={upload.remove}
              />
            ) : onFile ? null : (
              <Text className="text-caption text-text-muted">
                No evidence yet. Photograph the work, then file it. You can pick several at once.
              </Text>
            )}
          </View>
        </FieldShell>
      ) : null}
    </FlowScreen>
  );
}
