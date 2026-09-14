import { useEffect, useState } from "react";
import { FileCheck } from "lucide-react-native";
import { Text, View } from "react-native";

import { SamplePhoto } from "@/components/SamplePhoto";
import { StatusChip } from "@/components/StatusChip";
import { formatPhp, getFile, type StoredFile } from "@/lib/api";
import { isProofImage, proofDocumentKind } from "@/lib/files";
import { useThemeColors } from "@/hooks/useTheme";
import { isShopProof, type MilestoneView } from "@/lib/milestones";

type Props = {
  milestones: MilestoneView[];
  /**
   * Whether each row explains whose move it is. The job workspace wants it —
   * the shop is deciding what to do next. A payout list of several jobs does
   * not: four sentences per row, repeated, is noise rather than guidance.
   */
  showDetail?: boolean;
};

/**
 * The four parts a job pays out in, and where each one has got to.
 *
 * These are genuinely sequential and each carries its share, so the shares are
 * shown — they are what the shop is owed, not decoration. The list stays
 * monochrome apart from the status chips: money the shop cannot act on must
 * never look like the screen's action.
 *
 * On the job, a shop-owned part that already has evidence also shows those
 * photographs. A payout list of several jobs does not — the picture belongs
 * next to the part it released.
 */
export function MilestoneList({ milestones, showDetail = false }: Props) {
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
              </View>
              <View className="items-end gap-1.5">
                <Text className="text-body-lg font-medium text-text-primary">
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
            {showDetail && isShopProof(milestone.code) && milestone.pofFileIds.length
              ? milestone.pofFileIds.map((fileId) => (
                  <FiledProof
                    key={fileId}
                    fileId={fileId}
                    altText={`${milestone.label} evidence`}
                  />
                ))
              : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function FiledProof({ fileId, altText }: { fileId: string; altText: string }) {
  const colors = useThemeColors();
  const [file, setFile] = useState<StoredFile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFile(null);
    setFailed(false);
    void getFile(fileId).then(
      (value) => { if (active) setFile(value); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [fileId]);

  if (!file) {
    return <Text className="text-caption text-text-muted">{failed ? "This evidence will not load" : "Loading evidence…"}</Text>;
  }
  const document = {
    fileName: file.originalFilename,
    mimeType: file.detectedContentType || file.declaredContentType,
  };
  if (isProofImage(document)) {
    return <SamplePhoto fileId={fileId} altText={altText} gutter="tight" />;
  }
  return (
    <View className="flex-row items-center gap-3 rounded-field border border-outline bg-surface p-3">
      <FileCheck size={20} color={colors.success} strokeWidth={2} />
      <View className="min-w-0 flex-1">
        <Text className="text-body text-text-primary">{file.originalFilename}</Text>
        <Text className="text-caption text-text-muted">{proofDocumentKind(document)}</Text>
      </View>
    </View>
  );
}
