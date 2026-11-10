import { useEffect, type ReactNode } from "react";
import { View } from "react-native";

import { router } from "expo-router";

import { PlayOptInCard } from "@/components/PlayOptInCard";
import { TesterCheckInCard } from "@/components/TesterCheckInCard";
import { TesterFeedbackCard } from "@/components/TesterFeedbackCard";
import { optInCardVisible, PLAY_OPTIN_ROUTE } from "@/lib/playOptIn";
import { feedbackAllowed, feedbackToShow, testerCardView } from "@/lib/testerProgram";
import { playOptInInstall, usePlayOptIn } from "@/store/playOptIn";
import { useSession } from "@/store/session";
import { useTesterProgram } from "@/store/testerProgram";

/**
 * The Google Play tester's one line on Home: the check-in card, or — once
 * today is in and GRIDGO has a feedback ask due — the feedback card in its
 * place, so Home never grows by two cards. For a shop not yet a tester, the
 * same line asks it to become one on Play, when GRIDGO says to ask
 * (`lib/playOptIn.ts`). Nothing for anyone else.
 *
 * `className` spaces the line from its neighbours. It sits on a wrapper that
 * exists only when a card is drawn, so a shop that is not a tester gets no
 * empty gap on its floor.
 */
export function HomeTesterSlot({ className }: { className?: string }) {
  const userId = useSession((s) => s.user?.id ?? null);
  const owner = useTesterProgram((s) => s.owner);
  const program = useTesterProgram((s) => (owner === userId ? s.program : null));
  const held = useTesterProgram((s) => s.held);
  const busy = useTesterProgram((s) => s.checkingIn);
  const failed = useTesterProgram((s) => s.checkInFailed);
  const readAt = useTesterProgram((s) => s.readAt);
  const optInOwner = usePlayOptIn((s) => s.owner);
  const optIn = usePlayOptIn((s) => (optInOwner === userId ? s.state : null));
  const optInClosed = usePlayOptIn((s) => s.closed);

  const view = testerCardView(program);
  const feedback =
    program?.enrolled && feedbackAllowed(program)
      ? feedbackToShow(program.nudge, held, userId, readAt)
      : null;
  const freshTrigger = feedback?.fresh ? feedback.trigger : null;

  // A card GRIDGO offered is "shown" the moment it is drawn, and held from then on.
  useEffect(() => {
    if (freshTrigger) useTesterProgram.getState().feedbackShown(freshTrigger);
  }, [freshTrigger]);

  let card: ReactNode = null;
  if (feedback) {
    card = (
      <TesterFeedbackCard
        onOpen={() => void useTesterProgram.getState().feedbackTapped()}
        onDismiss={() => useTesterProgram.getState().feedbackDismissed()}
      />
    );
  } else if (view) {
    card = (
      <TesterCheckInCard
        view={view}
        busy={busy}
        failed={failed}
        onCheckIn={() => void useTesterProgram.getState().checkIn()}
      />
    );
  } else if (!optInClosed && optInCardVisible(optIn, playOptInInstall())) {
    card = (
      <PlayOptInCard
        onShown={() => usePlayOptIn.getState().shown()}
        onOpen={() => router.push(`${PLAY_OPTIN_ROUTE}?from=card`)}
        onDismiss={() => usePlayOptIn.getState().dismiss()}
      />
    );
  }
  if (!card) return null;
  return className ? <View className={className}>{card}</View> : card;
}
