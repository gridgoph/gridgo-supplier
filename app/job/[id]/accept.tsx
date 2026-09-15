import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { JobBrief } from "@/components/JobBrief";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import * as api from "@/lib/api";
import { blackoutOnDay, blackoutReasonLabel } from "@/lib/blackouts";
import { toDayKey } from "@/lib/day";
import { formatDeadlineFull } from "@/lib/dates";
import { findAction } from "@/lib/jobState";
import { useJob } from "@/hooks/useJob";
import { useJobAction } from "@/hooks/useJobAction";
import { useJobDraft, useJobDrafts } from "@/store/jobDrafts";
import { useShopPlan } from "@/store/shopPlan";

/**
 * Accepting is a commitment, so it is never a row tap — but there is nothing
 * left to quote.
 *
 * By the time a job reaches this screen the client has browsed this shop's
 * board, chosen one of its listings at the price the shop set, been given a
 * date, and paid. Asking the shop to name a price and a finish time was the
 * old flow, where Operations handed out work and shops bid for it. Under the
 * one that shipped, both figures already exist, and asking again invites a
 * shop to contradict what a client has already been charged.
 *
 * So this screen states them. What the shop earns and when it is due are read
 * out of the job, and the only decision left is whether the shop can run it.
 *
 * The price shown is the shop's own, never the client's total: GRIDGO's charge
 * and the delivery fee sit on top of it and are not this app's business. The
 * date is the shop's `readyBy`, not the padded one the client was promised —
 * that is withheld from this app on purpose, because a shop shown it works to
 * it and the allowance is spent before the job starts.
 */
export default function AcceptJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);
  const action = useJobAction();
  const draft = useJobDraft(id);
  const setAccept = useJobDrafts((s) => s.setAccept);
  const clearDraft = useJobDrafts((s) => s.clearDraft);
  const blackouts = useShopPlan((s) => s.blackouts);
  const [showErrors, setShowErrors] = useState(false);

  // The date the shop is held to, read from the job rather than chosen here.
  const readyAt = useMemo(() => {
    const value = job?.readyBy;
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [job?.readyBy]);

  // A closure on the day the job is due is still worth saying: the shop is
  // about to commit to a date it has marked itself shut for.
  const closure = readyAt ? blackoutOnDay(blackouts, toDayKey(readyAt)) : null;
  const priceMinor = job?.supplierPriceMinor ?? null;

  // The action stays pressable while the form is incomplete: a dead yellow
  // button teaches nothing, whereas pressing it names the field that is missing.
  async function submit() {
    if (!job) return;
    const commitment = findAction(job, "accept");

    // Nothing is sent but the decision. The price is the listing's and the
    // date is GRIDGO's; a shop that could post either from here could
    // contradict what the client has already been charged and told.
    const updated = await action.run({
      jobId: job.id,
      targetState: commitment?.targetState ?? "payment_authorized",
      note: `Accepted — ready by ${formatDeadlineFull(job.readyBy)}`,
    });
    if (!updated) return;
    clearDraft(job.id);
    router.back();
  }

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title="Accept this job"
      subject={job?.title}
      lede="The client chose this from your board, at your price, and has already paid. Accepting confirms your shop can run it by the date below."
      actionError={action.error}
      footer={
        <>
          <PrimaryButton
            label={action.busy ? "Accepting…" : "Accept job"}
            disabled={action.busy}
            onPress={() => void submit()}
          />
          <SecondaryButton
            label="Not now"
            disabled={action.busy}
            onPress={() => router.back()}
          />
        </>
      }
    >
      {job ? (
        <>
          {/*
            The same docket the workspace showed, folded: the shop has just read
            it, and this screen is for the commitment, not a second read. Every
            row still states its facts closed, so a last check of the file
            count or the date costs one glance and no scrolling. The shop's own
            finish date is the one in the delivery row — the client was given a
            later one; this app is not told it.
          */}
          <View className="gap-3">
            <Text className="text-overline text-text-muted">WHAT YOU ARE AGREEING TO</Text>
            <JobBrief
              order={job}
              sections={["make", "artwork", "mockup", "delivery"]}
              defaultOpen={null}
            />
          </View>

          {/*
            Stated, not asked for. The client already paid this, off this
            shop's own board, and a field here could only contradict it.
          */}
          <View className="gg-card gap-1">
            <Text className="text-overline text-text-muted">YOU ARE PAID</Text>
            <Text className="text-h1 text-text-primary">
              {priceMinor != null ? api.formatPhp(priceMinor) : "—"}
            </Text>
            <Text className="text-body text-text-secondary">
              Your price from your own board. GRIDGO&apos;s charge and the delivery fee sit on
              top of this to reach what the client paid — neither comes out of it.
            </Text>
          </View>

          <View className="gg-panel gap-2">
            <Text className="text-body font-medium text-text-primary">How it reaches you</Text>
            <Text className="text-body text-text-secondary">
              In four parts as the job moves — printing, packaging, delivery,
              and a retention part that lands once the client&apos;s window to report a problem
              closes. Each needs evidence before it is released, and you file the first two
              here. You will see what each is worth as soon as you accept.
            </Text>
          </View>

          {closure ? (
            <View className="rounded-field border border-warning bg-surface p-3">
              <Text className="text-body text-warning">
                Your shop is marked closed that day ({blackoutReasonLabel(closure.reason)}). Pick a
                day you are open, or remove that closure in Capacity & closures.
              </Text>
            </View>
          ) : null}

        </>
      ) : null}
    </FlowScreen>
  );
}
