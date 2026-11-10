import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { formatTimelineAt } from "@/lib/dates";
import type { OrderActionRow } from "@/lib/shopTeam";

/** Rows before "Show all": a shift's worth, short enough to scan. */
export const ORDER_ACTIONS_PREVIEW = 6;

/**
 * Who did what on a job, newest first: every action GRIDGO recorded — a chat
 * message or a photo as well as a step — with the person and the time.
 */
export function OrderActionList({ rows }: { rows: OrderActionRow[] }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, ORDER_ACTIONS_PREVIEW);

  return (
    <View className="gap-1">
      <Text className="text-body font-medium text-text-primary" accessibilityRole="header">
        Who did what
      </Text>
      {shown.map((row, index) => (
        <View
          key={row.id}
          className={index < shown.length - 1 ? "gap-0.5 border-b border-outline-subtle py-2" : "gap-0.5 py-2"}
        >
          <Text className="text-body text-text-secondary">
            {row.who ? (
              <>
                <Text className="font-medium text-text-primary">{row.who}</Text>
                {` ${lowerFirst(row.what)}`}
              </>
            ) : (
              row.what
            )}
          </Text>
          <Text className="text-caption text-text-muted">{formatTimelineAt(row.at)}</Text>
        </View>
      ))}
      {rows.length > ORDER_ACTIONS_PREVIEW ? (
        <Pressable
          onPress={() => setAll((value) => !value)}
          accessibilityRole="button"
          className="gg-touch justify-center self-start"
        >
          <Text className="text-button text-brand">{all ? "Show fewer" : `Show all ${rows.length}`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function lowerFirst(text: string): string {
  return text ? text[0].toLowerCase() + text.slice(1) : text;
}
