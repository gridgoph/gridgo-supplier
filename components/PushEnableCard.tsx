import { Bell } from "lucide-react-native";
import { Linking, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { pushOffer, pushOfferCopy } from "@/lib/push";
import { usePush } from "@/store/push";
import { isSignedIn, useSession } from "@/store/session";

/**
 * The invitation to turn on phone alerts.
 *
 * This card is the *only* thing in the app that can raise the system
 * permission dialog. Android 13+ shows that dialog once and treats a refusal as
 * effectively permanent, so firing it cold on first launch — before a shop has
 * seen a single job — spends the one ask on a stranger. Instead the card is
 * drawn where the value is already obvious and states in one line what will
 * arrive; the dialog follows a deliberate tap and nothing else.
 *
 * Where it is drawn is this app's decision, and it is three places:
 *
 * - **The Alerts tab**, where a shop is already reading the things push would
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
 * the Alerts tab keeps every update: the card simply becomes a pointer to the
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
            void Linking.openSettings();
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
