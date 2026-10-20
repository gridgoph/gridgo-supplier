import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { JobBrief } from "@/components/JobBrief";
import { LATE_PRODUCTION_HREF } from "@/components/LatenessPanel";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SchedulingNotice } from "@/components/SchedulingNotice";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecialInstructionsPanel } from "@/components/SpecialInstructionsPanel";
import { CheckboxRow } from "@/components/controls/CheckboxRow";
import * as api from "@/lib/api";
import { acceptWindow, acceptWindowLine, acceptWindowTickMs } from "@/lib/acceptWindow";
import { formatDeadlineFull } from "@/lib/dates";
import { findAction } from "@/lib/jobState";
import { payoutPlanCopy } from "@/lib/milestones";
import { NO_MONEY_TAKEN, performanceHref } from "@/lib/performance";
import { isTightBeforeAccepting } from "@/lib/scheduling";
import { closureOnDay, manilaClock } from "@/lib/shopHours";
import { canRequestChange, hasSpecialInstructions, itemInstructions } from "@/lib/orderChanges";
import { NO_SUBCONTRACTING_ACCEPT_LINE } from "@/lib/supplierTerms";
import { useJob } from "@/hooks/useJob";
import { useJobAction } from "@/hooks/useJobAction";
import { useNow } from "@/hooks/useNow";
import { useJobDraft, useJobDrafts } from "@/store/jobDrafts";
import { useShopHours } from "@/store/shopHours";

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
  const shopHours = useShopHours((s) => s.hours);
  const loadShopHours = useShopHours((s) => s.load);
  const [showErrors, setShowErrors] = useState(false);
  // Always starts unticked: a box ticked for the shop records nothing it did.
  const [instructionsRead, setInstructionsRead] = useState(false);
  // The hour to answer, said once more where the shop commits.
  const now = useNow(job ? acceptWindowTickMs(acceptWindow(job)) : null);
  const answerLine = job ? acceptWindowLine(acceptWindow(job, now), now) : null;

  // The date the shop is held to, read from the job rather than chosen here.
  const readyAt = useMemo(() => {
    const value = job?.readyBy;
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [job?.readyBy]);

  // A closure on the day the job is due is still worth saying: the shop is
  // about to commit to a date it has marked itself shut for.
  useEffect(() => {
    void loadShopHours();
  }, [loadShopHours]);
  const closure = readyAt && shopHours ? closureOnDay(shopHours.closures, manilaClock(readyAt).dayKey) : null;
  const priceMinor = job?.supplierPriceMinor ?? null;
  // GRIDGO refuses the acceptance until the shop ticks that it read the client's notes.
  const notes = job ? itemInstructions(job) : [];
  const needsTick = job ? hasSpecialInstructions(job) : false;

  // The action stays pressable while the form is incomplete: a dead yellow
  // button teaches nothing, whereas pressing it names the field that is missing.
  async function submit() {
    if (!job) return;
    if (needsTick && !instructionsRead) {
      setShowErrors(true);
      return;
    }
    const commitment = findAction(job, "accept");

    // Nothing is sent but the decision. The price is the listing's and the
    // date is GRIDGO's; a shop that could post either from here could
    // contradict what the client has already been charged and told.
    const updated = await action.run({
      jobId: job.id,
      targetState: commitment?.targetState ?? "payment_authorized",
      note: `Accepted — ready by ${formatDeadlineFull(job.readyBy)}`,
      // The tick is recorded with the time, against the notes as they stand.
      extra: needsTick ? { specialInstructionsRead: true } : undefined,
    });
    // A refusal may mean the notes changed under the shop; show the job as it is now.
    if (!updated) {
      void reload();
      return;
    }
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
          {answerLine ? (
            <Text className="text-body font-medium text-warning" testID="accept-window-line">
              {answerLine}
            </Text>
          ) : null}
          {/*
            A Tight date is said before the shop commits, with the way out
            beside it: during the pilot a reasoned decline costs nothing.
          */}
          <SchedulingNotice order={job} />
          {isTightBeforeAccepting(job) ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/job/[id]/decline",
                  params: { id: job.id, reason: "deadline_unachievable" },
                })
              }
              accessibilityRole="link"
              className="gg-touch justify-center self-start"
            >
              <Text className="text-button text-brand">Too tight? Decline with a reason</Text>
            </Pressable>
          ) : null}
          {/*
            The client's own words come before the docket and the money: they
            are the part of the job nobody picked from a list, and the tick
            under them is what GRIDGO records as read.
          */}
          {needsTick ? (
            <View className="gap-2">
              <SpecialInstructionsPanel notes={notes} readAt={null} offer={false} />
              <CheckboxRow
                checked={instructionsRead}
                onChange={(next) => {
                  setInstructionsRead(next);
                  action.clearError();
                }}
                label="I've read the special instructions"
                hint="GRIDGO records when you ticked it. Your shop makes the job with them."
              />
              {showErrors && !instructionsRead ? (
                <Text className="text-body text-error" accessibilityRole="alert">
                  Tick that you read the special instructions to accept.
                </Text>
              ) : null}
              <View className="gap-1">
                {canRequestChange(job) ? (
                  <Pressable
                    onPress={() => router.push({ pathname: "/job/[id]/change", params: { id: job.id } })}
                    accessibilityRole="link"
                    className="gg-touch justify-center self-start"
                  >
                    <Text className="text-button text-brand">They cost more? Request a change</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/job/[id]/decline",
                      params: { id: job.id, reason: "special_instructions" },
                    })
                  }
                  accessibilityRole="link"
                  className="gg-touch justify-center self-start"
                >
                  <Text className="text-button text-brand">Not possible? Decline this job</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
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
            <Text className="text-body text-text-secondary">{NO_SUBCONTRACTING_ACCEPT_LINE}</Text>
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
              {payoutPlanCopy(job).howItReachesYou} You will see what each is worth as soon as you
              accept.
            </Text>
          </View>

          {/*
            The one sentence a shop should hear before it commits, one tap from
            the whole policy rather than the whole policy here. GRIDGO assesses
            no new late deduction during the pilot (gridgo-api
            `docs/SUPPLIER_PERFORMANCE_API.md`), so every offer hears the
            Performance page's promise. A Tight job's link opens that page.
          */}
          <View className="gap-1">
            <Text className="text-body text-text-secondary">{NO_MONEY_TAKEN}</Text>
            <Pressable
              onPress={() =>
                router.push(isTightBeforeAccepting(job) ? performanceHref() : LATE_PRODUCTION_HREF)
              }
              accessibilityRole="link"
              className="gg-touch justify-center self-start"
            >
              <Text className="text-button text-brand">How late production is handled</Text>
            </Pressable>
          </View>

          {closure ? (
            <View className="rounded-field border border-warning bg-surface p-3">
              <Text className="text-body text-warning">
                That day is one of your closure dates. Make sure you can still finish on time, or
                change your closure dates in Shop hours.
              </Text>
            </View>
          ) : null}

        </>
      ) : null}
    </FlowScreen>
  );
}
