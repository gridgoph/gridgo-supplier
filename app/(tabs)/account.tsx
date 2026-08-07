import { Pressable, Text, View } from "react-native";

import { getApiBase } from "@/lib/api";
import { useSession } from "@/store/session";

export default function AccountScreen() {
  const user = useSession().user;
  const logout = useSession().logout;

  return (
    <View className="flex-1 bg-canvas px-5 pt-14">
      <Text className="font-satoshi-bold text-2xl text-text-primary">Account</Text>
      <View className="mt-4 rounded-2xl border border-outline bg-surface p-4">
        <Text className="font-satoshi-medium text-text-primary">{user?.name}</Text>
        <Text className="mt-1 font-satoshi text-text-secondary">{user?.email}</Text>
        <Text className="mt-1 font-satoshi text-sm text-text-muted">Role: {user?.role}</Text>
        <Text className="mt-1 font-satoshi text-sm text-text-muted">API: {getApiBase()}</Text>
      </View>
      <Pressable className="mt-6 items-center rounded-xl border border-outline py-3" onPress={() => void logout()}>
        <Text className="font-satoshi-medium text-text-primary">Sign out</Text>
      </Pressable>
    </View>
  );
}
