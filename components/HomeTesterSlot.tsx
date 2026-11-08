import { useEffect, type ReactNode } from "react";
import { View } from "react-native";

import { TesterCheckInCard } from "@/components/TesterCheckInCard";
import { TesterFeedbackCard } from "@/components/TesterFeedbackCard";
import { feedbackToShow, testerCardView } from "@/lib/testerProgram";
import { useSession } from "@/store/session";
import { useTesterProgram } from "@/store/testerProgram";

/**
 * The Google Play tester's one line on Home: the check-in card, or — once
 * today is in and GRIDGO has a feedback ask due — the feedback card in its
 * place, so Home never grows by two cards. Nothing for anyone not enrolled.
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

  const view = testerCardView(program);
  const enrolled = program?.enrolled ? program : null;
  const feedback =
    enrolled && (enrolled.checkedInToday || enrolled.stopped)
      ? feedbackToShow(enrolled.nudge, held, userId, readAt)
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
  }
  if (!card) return null;
  return className ? <View className={className}>{card}</View> : card;
}
