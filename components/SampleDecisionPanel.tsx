import { Text, View } from "react-native";

import { EvidencePicture } from "@/components/ApprovalProofPanel";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import type { Order } from "@/lib/api";
import { approvalDateLabel } from "@/lib/approvalProof";
import {
  linkedSampleJob,
  rejectionNextLine,
  sampleDecisionOf,
  sampleTagOf,
  showsSampleDecision,
} from "@/lib/sampleFirst";

type Props = {
  job: Pick<Order, "orderTags" | "sampleDecision" | "sampleOrderId" | "batchOrderId">;
  onOpenJob: (orderId: string) => void;
};

/**
 * The client's decision on a sample (`lib/sampleFirst.ts`).
 *
 * On a batch it is the standard the work is held to — the approved sample's
 * photo and the client's note, with the way back to the sample job. On the
 * sample itself it says what the client decided, the reason when they turned
 * it down. Nothing is drawn on a job that is neither, or before a decision on
 * a sample that has no batch yet.
 */
export function SampleDecisionPanel({ job, onOpenJob }: Props) {
  const tag = sampleTagOf(job);
  if (!tag || !showsSampleDecision(job)) return null;
  const decision = sampleDecisionOf(job);
  const link = linkedSampleJob(job);

  const title = tag === "batch_from_sample" ? "THE STANDARD TO MATCH" : "THE CLIENT'S DECISION";
  return (
    <View className="gap-3" testID="sample-decision">
      <Text className="text-overline text-text-muted">{title}</Text>
      <View className="gg-card gap-3">
        {decision?.decision === "approved" ? (
          <>
            <View className="flex-row flex-wrap items-center gap-2">
              <StatusChip tone="success" label="Sample approved" icon="circle-check" />
              {decision.at ? (
                <Text className="text-caption text-text-muted">{approvalDateLabel(decision.at)}</Text>
              ) : null}
            </View>
            {tag === "batch_from_sample" ? (
              <Text className="text-body text-text-secondary">
                Make the batch to match the sample the client approved.
              </Text>
            ) : null}
            {decision.note ? <Text className="text-body text-text-primary">“{decision.note}”</Text> : null}
            {decision.samplePhotoFileId ? (
              <EvidencePicture fileId={decision.samplePhotoFileId} label="The client's photo of the sample" />
            ) : null}
          </>
        ) : decision?.decision === "rejected" ? (
          <>
            <View className="flex-row flex-wrap items-center gap-2">
              <StatusChip tone="warning" label="Sample not approved" icon="circle-x" />
              {decision.at ? (
                <Text className="text-caption text-text-muted">{approvalDateLabel(decision.at)}</Text>
              ) : null}
            </View>
            <Text className="text-body text-text-primary">
              {decision.reason ? `Reason: “${decision.reason}”` : "The client gave no reason."}
            </Text>
            {rejectionNextLine(decision.next) ? (
              <Text className="text-body text-text-secondary">{rejectionNextLine(decision.next)}</Text>
            ) : null}
          </>
        ) : (
          <Text className="text-body text-text-secondary">The client has not decided on the sample yet.</Text>
        )}
        {link ? <SecondaryButton label={link.label} onPress={() => onOpenJob(link.id)} /> : null}
      </View>
    </View>
  );
}
