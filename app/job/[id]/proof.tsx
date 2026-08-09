import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { UploadList } from "@/components/UploadList";
import { FieldShell } from "@/components/controls/FieldShell";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { probeStorage, storedUploads, type StorageAvailability } from "@/lib/files";
import { lastChangeRequest } from "@/lib/proof";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useJob } from "@/hooks/useJob";

/**
 * Sending a proof to the client.
 *
 * Uploading and sending are two separate things and the screen keeps them
 * separate: a file is stored when GRIDGO says so, and the job only reaches the
 * client when the shop deliberately sends it.
 */
export default function ProofScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);
  const upload = useFileUpload("proof");

  const [availability, setAvailability] = useState<StorageAvailability>("checking");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
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

  const ready = storedUploads(upload.items);
  const latest = ready[ready.length - 1] ?? null;
  const changeRequest = job ? lastChangeRequest(job) : null;
  const correcting = job?.state === "supplier_proof_changes_requested";

  function requestConfirm() {
    if (!latest) {
      setShowErrors(true);
      return;
    }
    setConfirming(true);
  }

  async function sendProof() {
    if (!job || !latest?.fileId) return;
    setSending(true);
    setSendError(null);
    try {
      await api.attachFileToOrder(latest.fileId, job.id);
      upload.markAttached(latest.key);
      setConfirming(false);
      setSent(true);
    } catch (e) {
      setConfirming(false);
      setSendError(humanizeApiError(e, offlineMessage("send this proof")));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <FlowScreen
        loading={false}
        error={null}
        onRetry={() => void reload()}
        title="Proof sent"
        subject={job?.title}
        lede="The client can see it now. They will either approve it or tell you what to change, and this job will show which."
        footer={<PrimaryButton label="Back to job" onPress={() => router.back()} />}
      >
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">
            Nothing to print yet
          </Text>
          <Text className="text-body text-text-secondary">
            Wait for the client to decide before you start production. You will see it on the job
            timeline.
          </Text>
        </View>
      </FlowScreen>
    );
  }

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title={correcting ? "Send a corrected proof" : "Send a proof to the client"}
      subject={job?.title}
      lede="The client approves what you are about to print before anything goes on the press. A JPEG, PNG, WebP or PDF is fine."
      actionError={sendError}
      footer={
        availability === "available" ? (
          <>
            <PrimaryButton
              label={sending ? "Sending…" : "Send proof to client"}
              disabled={sending || upload.busy}
              onPress={requestConfirm}
            />
            <SecondaryButton
              label="Not yet"
              disabled={sending}
              onPress={() => router.back()}
            />
          </>
        ) : (
          <SecondaryButton label="Back to job" onPress={() => router.back()} />
        )
      }
    >
      {changeRequest ? (
        <View className="rounded-field border border-warning bg-surface p-3">
          <Text className="text-caption text-text-muted">THE CLIENT ASKED FOR</Text>
          <Text className="mt-1 text-body text-text-primary">{changeRequest}</Text>
        </View>
      ) : null}

      {availability === "unavailable" ? (
        <View className="gg-panel gap-2">
          <Text className="text-body font-medium text-text-primary">
            GRIDGO cannot take files right now
          </Text>
          <Text className="text-body text-text-secondary">
            Its file storage is not responding, so a proof would have nowhere to go. Nothing on this
            job has changed. Try again shortly, and tell Operations if it stays down.
          </Text>
        </View>
      ) : null}

      {availability === "checking" ? (
        <Text className="text-body text-text-muted">Checking GRIDGO file storage…</Text>
      ) : null}

      {availability === "available" ? (
        <>
          <FieldShell
            label="Proof file"
            hint="Up to 200 MB. iPhone HEIC photos are not accepted — set the camera to Most Compatible or export as JPEG."
            error={
              showErrors && !latest
                ? "Add a proof file and let it finish saving before you send it."
                : null
            }
          >
            <View className="gap-3">
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <SecondaryButton label="Choose file" onPress={() => void upload.pickDocument()} />
                </View>
                <View className="flex-1">
                  <SecondaryButton label="Take photo" onPress={() => void upload.takePhoto()} />
                </View>
              </View>
              <UploadList
                items={upload.items}
                onRetry={(key) => void upload.retry(key)}
                onRemove={upload.remove}
                emptyHint="No proof yet. Export the artwork as you will print it, then choose the file."
              />
            </View>
          </FieldShell>

          <View className="gg-panel gap-1">
            <Text className="text-body font-medium text-text-primary">
              Sending is a separate step
            </Text>
            <Text className="text-body text-text-secondary">
              A file is saved to GRIDGO as soon as it uploads, but the client sees nothing until you
              press send. If you add more than one file, the last one you saved is the one that goes.
            </Text>
          </View>
        </>
      ) : null}

      {job && latest ? (
        <ConfirmDialog
          visible={confirming}
          question={`Send this proof for ${job.title}?`}
          consequence={`${latest.fileName} goes to the client for approval. You cannot pull it back — a change means uploading a new proof.`}
          confirmLabel="Send proof to client"
          cancelLabel="Not yet"
          busy={sending}
          onConfirm={() => void sendProof()}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </FlowScreen>
  );
}
