import { Text, View } from "react-native";

import { whatsNewTitle } from "@/lib/appUpdate";

type Props = {
  versionName: string;
  /** Already plain and capped (`parseWhatsNew`, or the bundled history). */
  items: string[];
};

/**
 * "What's new in 1.0.x", as the release wrote it. Shared by the update sheet
 * and the Alerts cards so every surface says the same thing. Draws nothing for
 * a release with no notes, which leaves either surface as it was before notes
 * existed.
 */
export function WhatsNewList({ versionName, items }: Props) {
  if (items.length === 0) return null;
  const title = whatsNewTitle(versionName);

  return (
    <View
      accessible
      accessibilityLabel={`${title}: ${items.join(". ")}`}
      testID="whats-new-list"
      className="gap-2"
    >
      <Text className="text-body font-medium text-text-primary">{title}</Text>
      {items.map((item, index) => (
        <View key={`${index}-${item}`} className="flex-row gap-2">
          <Text className="text-body text-text-muted">{"•"}</Text>
          <Text className="flex-1 text-body text-text-secondary">{item}</Text>
        </View>
      ))}
    </View>
  );
}
