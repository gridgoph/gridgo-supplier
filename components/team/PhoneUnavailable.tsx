import { Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";

type Props = {
  /** Joining a team, or signing back in to a login made with a mobile. */
  moment: "join" | "sign_in";
  /** The way in that works today: an email login (or Google on Sign in). */
  onEmail: () => void;
};

/**
 * Mobile logins are not open on this GRIDGO yet (report F315793B).
 *
 * Says so plainly and names what does work, including what the owner has to
 * do: a team link or QR needs a login made with a mobile, so a new person
 * joins on an **email** invite instead, or works on the shop's own phone with
 * a PIN. Nothing here makes a second login for someone who already has one.
 */
export function PhoneUnavailable({ moment, onEmail }: Props) {
  return (
    <View className="gg-card gap-3" testID="phone-unavailable">
      <View className="flex-row">
        <StatusChip tone="info" icon="circle-help" label="Mobile login not open yet" />
      </View>
      <Text className="text-body-lg text-text-primary">
        {moment === "join"
          ? "GRIDGO cannot text codes yet, and a team link or QR needs a login made with a mobile."
          : "GRIDGO cannot text codes yet, so signing in with a mobile does not work today."}
      </Text>
      <View className="gap-2">
        <Text className="text-body text-text-secondary">
          {moment === "join"
            ? "Ask the owner to invite your email from Team. Then make your login with that email and the code we email you, or use Continue with Google on Sign in."
            : "If your login has an email, sign in with it, or use Continue with Google. If it has only a mobile, ask the owner to invite your email from Team."}
        </Text>
        <Text className="text-body text-text-secondary">
          Or ask the owner to add you with a PIN. You then work on the shop&apos;s phone, with no login of your own.
        </Text>
      </View>
      <SecondaryButton
        label={moment === "join" ? "Make my login with my email" : "Sign in with email"}
        onPress={onEmail}
      />
    </View>
  );
}
