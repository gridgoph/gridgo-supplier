import { type ReactNode } from "react";
import { Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { accountHold } from "@/lib/accountHold";
import { useSession } from "@/store/session";

/**
 * The signed-in stack, including tabs and jobs, is `children`.
 * A suspended or removed `/auth/me` replaces that stack with the reason.
 */
export function SessionShell({ children }: { children: ReactNode }) {
  const user = useSession((state) => state.user);
  const logout = useSession((state) => state.logout);
  const hold = accountHold(user);
  if (!hold) return <>{children}</>;

  return (
    <View className="gg-screen flex-1 justify-center">
      <View className="gg-page gap-3 py-16">
        <Text className="text-h1 text-text-primary">{hold.title}</Text>
        {hold.reason ? (
          <Text className="text-body-lg text-text-secondary">{hold.reason}</Text>
        ) : null}
        <View className="mt-5">
          <PrimaryButton label="Sign out" onPress={() => void logout()} />
        </View>
      </View>
    </View>
  );
}
