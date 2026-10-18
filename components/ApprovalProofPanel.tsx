import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { useSignedLink } from "@/hooks/useSignedLink";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { approvalProofError } from "@/lib/apiErrors";
import {
  APPROVAL_PROOF_NOTE,
  UNRECORDED_NOTE,
  approvalDateLabel,
  filesLine,
  itemLine,
  methodLabel,
  phaseLabel,
  recordsNewestFirst,
  type ApprovalProofRecord,
} from "@/lib/approvalProof";

/**
 * The client's approval records for one job, read-only, newest first: what
 * was approved, when, and how — a drawn signature, one tap, or a signed
 * sample with the photo of the sample the client received.
 *
 * Read when the docket row opens, not with the job: the records carry a
 * snapshot of every line, and most visits to a job never open this row.
 */
export function ApprovalProofPanel({ orderId, reloadVersion = 0 }: { orderId: string; reloadVersion?: number }) {
  const [records, setRecords] = useState<ApprovalProofRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    api.getApprovalProof(orderId).then(
      (rows) => {
        if (!current) return;
        setRecords(recordsNewestFirst(rows));
        setError(null);
      },
      (err: unknown) => {
        if (current) setError(approvalProofError(err));
      },
    );
    return () => {
      current = false;
    };
  }, [orderId, reloadVersion, attempt]);

  if (error && !records) return <ErrorNotice message={error} onRetry={() => setAttempt((n) => n + 1)} />;
  if (!records) {
    return (
      <View className="gap-3" accessibilityRole="progressbar" accessibilityLabel="Loading the client's approval">
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-6 w-28 rounded-pill" />
        <SkeletonBlock className="h-24 w-full rounded-card" />
      </View>
    );
  }

  return (
    <View className="gap-4" testID="approval-proof">
      <Text className="text-body text-text-secondary">{APPROVAL_PROOF_NOTE}</Text>
      {records.length ? (
        records.map((record, index) => (
          <View key={record.id} className={index === 0 ? "gap-3" : "gap-3 border-t border-outline-subtle pt-4"}>
            <ApprovalRecord record={record} />
          </View>
        ))
      ) : (
        <Text className="text-body text-text-muted">The client has not approved this order yet.</Text>
      )}
    </View>
  );
}

function ApprovalRecord({ record }: { record: ApprovalProofRecord }) {
  if (record.status !== "approved") {
    return (
      <View className="gap-2">
        <View className="flex-row">
          <StatusChip tone="neutral" label="No approval collected" icon="circle-help" />
        </View>
        <Text className="text-body text-text-secondary">{UNRECORDED_NOTE}</Text>
        <Text className="text-caption text-text-muted">{approvalDateLabel(record.at)}</Text>
      </View>
    );
  }
  const files = filesLine(record);
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <StatusChip
          tone="success"
          label={record.method === "drawn" ? "Signed" : "Approved"}
          icon={record.method === "drawn" ? "square-pen" : "circle-check"}
        />
        <Text className="text-body font-medium text-text-primary">{phaseLabel(record.phase)}</Text>
      </View>
      <Text className="text-body text-text-secondary">
        {methodLabel(record.method)} · {approvalDateLabel(record.at)}
      </Text>
      {record.statement ? (
        <Text className="text-body text-text-primary">“{record.statement}”</Text>
      ) : null}

      {record.signatureFileId ? (
        <EvidencePicture fileId={record.signatureFileId} label="The client's signature" signature />
      ) : null}
      {record.samplePhotoFileId ? (
        <EvidencePicture fileId={record.samplePhotoFileId} label="The sample the client received" />
      ) : null}

      {record.items.length ? (
        <View className="gap-2">
          <Text className="text-overline text-text-muted">WHAT WAS APPROVED</Text>
          {record.items.map((item, index) => (
            <View key={`${item.name}-${index}`} className="gap-0.5">
              <Text className="text-body font-medium text-text-primary">{itemLine(item)}</Text>
              {item.options.length ? (
                <Text className="text-body text-text-secondary">{item.options.join(" · ")}</Text>
              ) : null}
              {item.instructions ? (
                <Text className="text-body text-text-secondary">Instructions: {item.instructions}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {files ? <Text className="text-body text-text-secondary">{files}</Text> : null}
      {record.reference ? (
        <Text className="text-caption text-text-muted" selectable>
          Record {record.reference}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A signature or a sample photo, through a link that is renewed rather than
 * left to expire. A signature is drawn on paper in both themes: dark ink on a
 * dark card would vanish.
 */
function EvidencePicture({ fileId, label, signature = false }: { fileId: string; label: string; signature?: boolean }) {
  const colors = useThemeColors();
  const picture = useSignedLink(fileId);
  return (
    <View className="gap-1">
      <Text className="text-caption text-text-muted">{label}</Text>
      <View
        className="overflow-hidden rounded-card border border-outline"
        style={{ backgroundColor: signature ? colors.paper : colors.surfaceVariant, height: signature ? 120 : 200 }}
      >
        {picture.uri && !picture.failed ? (
          <Image
            source={{ uri: picture.uri }}
            accessibilityLabel={label}
            onError={picture.onError}
            onLoad={picture.onLoad}
            resizeMode={signature ? "contain" : "cover"}
            style={{ width: "100%", height: "100%" }}
          />
        ) : picture.failed ? (
          <View className="flex-1 items-center justify-center px-4">
            <Text className="text-caption text-text-muted">This picture will not load. Pull to refresh to try again.</Text>
          </View>
        ) : (
          <SkeletonBlock className="h-full w-full" />
        )}
      </View>
    </View>
  );
}
