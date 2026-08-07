import { Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";

type Props = {
  title: string;
  body: string;
  /** Primary invitation to act — omit when there is no next step. */
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

/**
 * An empty or failed screen is an invitation to act, never a shrug.
 */
export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: Props) {
  return (
    <View className="gg-card gap-3">
      <Text className="text-h3 text-text-primary">{title}</Text>
      <Text className="text-body text-text-secondary">{body}</Text>
      {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} /> : null}
      {secondaryLabel && onSecondary ? (
        <SecondaryButton label={secondaryLabel} onPress={onSecondary} />
      ) : null}
    </View>
  );
}
