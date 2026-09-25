import { Bell } from "lucide-react-native";
import { Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { pushOffer, pushOfferCopy } from "@/lib/push";
import { openNotificationSettings, usePush } from "@/store/push";
import { isSignedIn, useSession } from "@/store/session";

/**
 * The invitation to turn on phone alerts.
 *
 * This card and the explainer sheet (`app/push-prompt.tsx`) are the only
 * things in the app that can raise the system permission dialog. Android 13+
 * shows that dialog once or twice and then treats a refusal as permanent, so it
 * is never fired cold: the card states in one line what will arrive, and the
 * dialog follows a deliberate tap and nothing else.
 *
 * Where it is drawn is this app's decision, and it is four places:
 *
 * - **Home**, the screen every signed-in launch lands on. The explainer opens
 *   there at most once a week; this card is what stays between those, so a
 *   shop that said "Not now" always has the way back in front of it.
 * - **The alerts list**, where a shop is already reading the things push would
 *   deliver.
 * - **A job waiting on somebody else** — a shop that has just accepted an offer
 *   or filed its evidence is standing at a counter with nothing to do until a
 *   client pays or a rider arrives, which is the moment "we will tell you" is
 *   worth something rather than an interruption.
 * - **The accreditation screen**, where the whole screen is a shop waiting to
 *   hear from Operations and there is nothing else it can do.
 *
 * Not on sign-in. A shop at the door has not asked a question alerts would
 * answer, and the permission dialog would spend the one ask on a stranger.
 *
 * Refusal is a first-class outcome. Nothing is blocked, no screen changes, and
 * the alerts list keeps every update: the card simply becomes a pointer to the
 * phone's own settings, which is the only place a blocked permission can be
 * taken back.
 *
 * A `SecondaryButton`, never the yellow one: the primary action on any screen
 * this appears on belongs to the job, not to a notification setting.
 */
type Props = {
  /**
   * Which side carries the gap to the rest of the screen.
   *
   * The card owns its own margin rather than sitting in a wrapper, because it
   * draws nothing most of the time — a wrapper would leave 24px of empty page
   * on every phone that has already granted permission, which is all of them
   * after the first tap. Neither screen it appears on is a gap container.
   */
  spacing?: "above" | "below";
};

export function PushEnableCard({ spacing }: Props) {
  const colors = useThemeColors();
  const supported = usePush((s) => s.supported);
  const permission = usePush((s) => s.permission);
  const busy = usePush((s) => s.busy);
  const error = usePush((s) => s.error);
  const enable = usePush((s) => s.enable);
  const registerIfGranted = usePush((s) => s.registerIfGranted);
  const signedIn = isSignedIn(useSession((s) => s.user));

  const offer = pushOffer({ supported, signedIn, permission, failed: Boolean(error) });
  if (offer === "hidden") return null;

  const copy = pushOfferCopy(offer, signedIn);

  return (
    <View
      className={
        spacing === "above"
          ? "gg-panel mt-6 gap-3"
          : spacing === "below"
            ? "gg-panel mb-6 gap-3"
            : "gg-panel gap-3"
      }
    >
      <View className="flex-row items-center gap-2">
        <Bell size={18} color={colors.textSecondary} />
        <Text className="text-body-lg font-medium text-text-primary">{copy.title}</Text>
      </View>
      <Text className="text-body text-text-secondary">{copy.body}</Text>
      <SecondaryButton
        label={busy ? "Asking…" : copy.action}
        disabled={busy}
        onPress={() => {
          if (offer === "settings") {
            // Only the OS can undo a blocked permission, so this is an honest
            // handover rather than a dialog the app cannot actually raise.
            // Coming back re-reads it and registers (`usePushNotifications`).
            void openNotificationSettings();
            return;
          }
          // Permission is already granted in the retry case, so asking again
          // would raise nothing; what failed was the registration.
          if (offer === "retry") {
            void registerIfGranted();
            return;
          }
          void enable();
        }}
      />
    </View>
  );
}
