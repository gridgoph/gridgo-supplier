import { Text, View } from "react-native";

type Props = {
  /** The screen's name, as it reads in the tab bar. */
  name: string;
};

/**
 * Scaffolding.
 *
 * Marks a route that exists in navigation but has no screen behind it yet, so
 * the shell can be walked end to end before the screens land. Each of these is
 * replaced wholesale by its real screen — this component goes away with the
 * last one.
 */
export function ScreenPlaceholder({ name }: Props) {
  return (
    <View className="gg-screen items-center justify-center">
      <Text className="text-h2 text-text-primary">{name}</Text>
    </View>
  );
}
