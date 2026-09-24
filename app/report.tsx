import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { FieldShell } from "@/components/controls/FieldShell";
import { NoteField } from "@/components/controls/NoteField";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { chatThreadRoute } from "@/lib/chatThreads";
import { orderReference } from "@/lib/orderReference";
import {
  composeProblemReport,
  PROBLEM_REPORT_MAX,
  problemReportIssue,
  readProblemReportDevice,
} from "@/lib/problemReport";

/**
 * Report a problem to Operations.
 *
 * Opened from Account for anything, and from a job for that job. What the shop
 * writes is posted as a new conversation in its Operations chat, headed
 * "Problem report" and carrying the job, the app build and the phone, and the
 * shop lands in that conversation — the answer arrives where the report went.
 */
export default function ReportProblemScreen() {
  const params = useLocalSearchParams<{ orderId?: string; title?: string }>();
  const orderId = typeof params.orderId === "string" && params.orderId.trim() ? params.orderId.trim() : null;
  const jobTitle = typeof params.title === "string" && params.title.trim() ? params.title.trim() : null;
  const job = orderId ? { orderId, title: jobTitle } : null;

  const context = useMemo(() => readProblemReportDevice(), []);
  const [what, setWhat] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const issue = problemReportIssue(what);

  async function send() {
    if (sending) return;
    if (issue) {
      setShowErrors(true);
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const body = composeProblemReport({ what, job, context });
      const posted = await api.sendSupportChatMessage(body, undefined, { newThread: true });
      router.replace(chatThreadRoute(posted.thread.id));
    } catch (err) {
      setSendError(humanizeApiError(err, offlineMessage("send this report")));
      setSending(false);
    }
  }

  return (
    <FlowScreen
      loading={false}
      error={null}
      onRetry={() => {}}
      title="Report a problem"
      subject={jobTitle ?? undefined}
      lede={
        job
          ? "Tell Operations what went wrong with this job. It opens a new chat with them, and they reply there."
          : "Tell Operations what went wrong. It opens a new chat with them, and they reply there."
      }
      actionError={sendError}
      footer={
        <>
          <PrimaryButton
            label={sending ? "Sending…" : "Send to Operations"}
            disabled={sending}
            onPress={() => void send()}
          />
          <SecondaryButton label="Not now" disabled={sending} onPress={() => router.back()} />
        </>
      }
    >
      <FieldShell
        label="What went wrong"
        hint="Say what you were doing and what happened instead."
        error={showErrors ? issue : null}
      >
        <NoteField
          value={what}
          onChange={setWhat}
          placeholder="My printing photo would not upload when I tried to file it."
          accessibilityLabel="What went wrong"
          maxLength={PROBLEM_REPORT_MAX}
        />
      </FieldShell>

      {/*
        Everything the report carries that the shop did not type, shown before
        it goes: a shop should never learn from Operations what its phone sent.
      */}
      <View className="gap-1">
        <Text className="text-overline text-text-muted">SENT WITH YOUR REPORT</Text>
        <View>
          {job ? <SpecRow label="Order" value={orderReference(job.orderId) ?? job.orderId} /> : null}
          <SpecRow label="App" value={`GRIDGO Supplier ${context.appVersion}`} />
          <SpecRow label="Phone" value={context.device} />
        </View>
      </View>
    </FlowScreen>
  );
}
