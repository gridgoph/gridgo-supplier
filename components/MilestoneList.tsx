import { Pressable, Text, View } from "react-native";

import { PayoutReceipt } from "@/components/PayoutReceipt";
import { ProofPhotoStrip, proofCountLabel } from "@/components/ProofPhotos";
import { StatusChip } from "@/components/StatusChip";
import { formatPhp } from "@/lib/api";
import type { MilestoneView } from "@/lib/milestones";

type Props = {
  milestones: MilestoneView[];
  proofReloadVersion?: number;
  /**
   * Whether each row explains whose move it is. The job workspace wants it —
   * the shop is deciding what to do next. A payout list of several jobs does
   * not: a sentence per part, repeated, is noise rather than guidance.
   */
  showDetail?: boolean;
  /** Opens the proof screen for one part. Offered only where the shop can add evidence. */
  onAddProof?: (code: MilestoneView["code"]) => void;
};

/**
 * The parts a job pays out in, in GRIDGO's order, and where each one has got to.
 *
 * These are genuinely sequential and each carries its share, so the shares are
 * shown — they are what the shop is owed, not decoration. The list stays
 * monochrome apart from the status chips: money the shop cannot act on must
 * never look like the screen's action.
 *
 * Evidence belongs beside its shop-owned milestone in the workspace, where
 * the shop can distinguish evidence filed from money released. Earnings lists
 * omit previews; file classification is shared with UploadList via lib/files.
 */
export function MilestoneList({ milestones, showDetail = false, proofReloadVersion = 0, onAddProof }: Props) {
  if (!milestones.length) return null;

  return (
    <View className="gap-3">
      {milestones.map((milestone, index) => (
        <View key={milestone.code}>
          {index > 0 ? <View className="gg-divider mb-3" /> : null}
          <View className="gap-1.5">
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-body font-medium text-text-primary">
                  {milestone.label}
                </Text>
                <Text className="text-caption text-text-muted">
                  {milestone.sharePercent}% of this job
                </Text>
                {/*
                  The amount beside it is already net. Saying what came off,
                  here on the part it came off, is what lets a shop see why
                  this part is smaller than its share.
                */}
                {milestone.lateDeductionMinor > 0 ? (
                  <Text className="text-caption text-text-secondary">
                    {formatPhp(milestone.lateDeductionMinor)} off for late production
                  </Text>
                ) : null}
              </View>
              <View className="items-end gap-1.5">
                {/*
                  A replaced part keeps its amount, struck through: the shop can
                  still see what it was, and nobody reads it as money that came.
                */}
                <Text
                  className={
                    milestone.stage === "superseded"
                      ? "text-body-lg font-medium text-text-muted line-through"
                      : "text-body-lg font-medium text-text-primary"
                  }
                >
                  {formatPhp(milestone.amountMinor)}
                </Text>
                <StatusChip
                  tone={milestone.tone}
                  label={milestone.statusLabel}
                  icon={milestone.icon}
                />
              </View>
            </View>
            {showDetail ? (
              <Text className="text-caption text-text-secondary">{milestone.detail}</Text>
            ) : null}
            {showDetail ? (
              <StageProofs
                milestone={milestone}
                reloadVersion={proofReloadVersion}
                onAddProof={onAddProof}
              />
            ) : null}
            {/*
              What GRIDGO sent, once this part is released: the wallet's own
              confirmation and its reference, so a shop matching its GCash
              history against this job never has to ask Operations for it.
            */}
            {showDetail && milestone.stage === "released" && milestone.receiptFileId ? (
              <PayoutReceipt
                fileId={milestone.receiptFileId}
                reference={milestone.reference}
                label={milestone.label}
              />
            ) : showDetail && milestone.stage === "released" && milestone.reference ? (
              <Text className="text-caption text-text-muted">
                Reference {milestone.reference}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * The evidence on file for one part, as a strip that scrolls however many
 * there are. The shop's own parts offer more while GRIDGO takes them; the
 * rider's delivery evidence is the rider's, so it is shown and nothing more.
 * Legacy retention rides on that same delivery evidence and is not drawn again.
 */
function StageProofs({
  milestone,
  reloadVersion,
  onAddProof,
}: {
  milestone: MilestoneView;
  reloadVersion: number;
  onAddProof?: Props["onAddProof"];
}) {
  const shop = milestone.proofOwner === "shop";
  if (!shop && milestone.proofOwner !== "rider") return null;
  const count = milestone.pofFileIds.length;
  const canAdd = shop && milestone.canFileMore && count > 0 && Boolean(onAddProof);
  if (!count) return null;
  return (
    <View className="gap-2 pt-1" testID={`stage-proofs-${milestone.code}`}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-caption text-text-muted">
          {shop ? proofCountLabel(count) : `${count === 1 ? "1 photo" : `${count} photos`} from the rider`}
        </Text>
        {canAdd ? (
          <Pressable
            onPress={() => onAddProof?.(milestone.code)}
            accessibilityRole="button"
            accessibilityLabel={`Add photos to the ${milestone.label.toLowerCase()} evidence`}
            className="gg-touch justify-center"
          >
            <Text className="text-body font-medium text-text-primary underline">Add photos</Text>
          </Pressable>
        ) : null}
      </View>
      <ProofPhotoStrip
        fileIds={milestone.pofFileIds}
        label={shop ? `${milestone.label} evidence` : "Delivery evidence"}
        reloadVersion={reloadVersion}
      />
    </View>
  );
}
