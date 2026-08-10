import type { ReactNode } from "react";
import { Text, View } from "react-native";

type Props = {
  /** Uppercase it in the copy, not with a transform. */
  title: string;
  /** How many things are under this heading. Omitted when a count says nothing. */
  count?: number;
  /** Reads as a warning when the count is the problem, not the inventory. */
  tone?: "muted" | "error";
  /** One line under the heading, where the group needs explaining. */
  hint?: string;
  right?: ReactNode;
};

/**
 * The label above a group of rows.
 *
 * A count belongs in the heading, not appended to the label with a separator —
 * so a shop can see how much is under each heading before reading any of it.
 */
export function SectionHeader({ title, count, tone = "muted", hint, right }: Props) {
  const label = tone === "error" ? "text-overline text-error" : "text-overline text-text-muted";

  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text className={label} numberOfLines={1}>
            {title}
          </Text>
          {count != null ? (
            <View
              className={
                tone === "error"
                  ? "min-w-5 items-center rounded-pill bg-error px-1.5"
                  : "min-w-5 items-center rounded-pill bg-surface-variant px-1.5"
              }
            >
              <Text
                className={
                  tone === "error"
                    ? "text-caption font-medium text-white"
                    : "text-caption font-medium text-text-secondary"
                }
              >
                {count}
              </Text>
            </View>
          ) : null}
        </View>
        {right}
      </View>
      {hint ? <Text className="text-caption text-text-muted">{hint}</Text> : null}
    </View>
  );
}
