import { useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ReportScreenshots } from "@/components/ReportScreenshots";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { FieldShell } from "@/components/controls/FieldShell";
import { NoteField } from "@/components/controls/NoteField";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { pickChatImages, takeChatPhoto, uploadChatImage } from "@/lib/chatImages";
import { chatThreadRoute } from "@/lib/chatThreads";
import { orderReference } from "@/lib/orderReference";
import {
  addProblemReportScreenshots,
  composeProblemReport,
  PROBLEM_REPORT_MAX,
  PROBLEM_REPORT_SCREENSHOTS_MAX,
  problemReportIssue,
  readProblemReportDevice,
  type ProblemReportScreenshot,
} from "@/lib/problemReport";

/**
 * Report a problem to Operations.
 *
 * Opened from Account for anything, and from a job for that job. What the shop
 * writes is posted as a new conversation in its Operations chat, headed
 * "Problem report" and carrying the job, the app build and the phone, and the
 * shop lands in that conversation — the answer arrives where the report went.
 * Up to three screenshots go with it, shown under the report's text.
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
  const [screenshots, setScreenshots] = useState<ProblemReportScreenshot[]>([]);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  // A retry after a failed send must not upload the same screenshot twice.
  const uploaded = useRef(new Map<string, string>());

  const issue = problemReportIssue(what);

  async function addScreenshots(pick: () => Promise<ProblemReportScreenshot[]>) {
    let picked: ProblemReportScreenshot[];
    try {
      picked = await pick();
    } catch (err) {
      setScreenshotError(err instanceof Error ? err.message : "That photo could not be added. Try again.");
      return;
    }
    if (!picked.length) return;
    const added = addProblemReportScreenshots(screenshots, picked);
    if (!added.ok) {
      setScreenshotError(added.error);
      return;
    }
    setScreenshotError(null);
    setScreenshots(added.screenshots);
  }

  function removeScreenshot(index: number) {
    setScreenshotError(null);
    setScreenshots((current) => current.filter((_, i) => i !== index));
  }

  async function send() {
    if (sending) return;
    if (issue) {
      setShowErrors(true);
      return;
    }
    setSending(true);
    setSendError(null);
    const fileIds: string[] = [];
    try {
      for (const shot of screenshots) {
        let fileId = uploaded.current.get(shot.uri);
        if (!fileId) {
          fileId = await uploadChatImage(shot);
          uploaded.current.set(shot.uri, fileId);
        }
        fileIds.push(fileId);
      }
    } catch {
      // Said as an upload, whatever the cause: a bare "cannot reach GRIDGO"
      // would not tell the shop the screenshots are what to drop if it persists.
      setSendError(
        "A screenshot did not upload, so nothing was sent. Check this phone's connection and send it again — what you wrote and your screenshots are still here. If it keeps failing, remove the screenshots and send without them.",
      );
      setSending(false);
      return;
    }
    try {
      const body = composeProblemReport({ what, job, context });
      const posted = await api.sendSupportChatMessage(
        body,
        undefined,
        fileIds.length ? { newThread: true, attachmentFileIds: fileIds } : { newThread: true },
      );
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

      <FieldShell
        label="Screenshots (optional)"
        hint={`Up to ${PROBLEM_REPORT_SCREENSHOTS_MAX}. Only GRIDGO Operations see them.`}
        error={screenshotError}
      >
        <ReportScreenshots
          screenshots={screenshots}
          max={PROBLEM_REPORT_SCREENSHOTS_MAX}
          disabled={sending}
          onAdd={() => void addScreenshots(pickChatImages)}
          onTakePhoto={() => void addScreenshots(takeChatPhoto)}
          onRemove={removeScreenshot}
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
