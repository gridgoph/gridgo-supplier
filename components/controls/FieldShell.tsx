import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { WhyWeAsk } from "@/components/legal/WhyWeAsk";

type Props = {
  label: string;
  /** Explains the constraint before the shop hits it. Optional. */
  hint?: string;
  /** Names what is wrong and how to fix it. Replaces the hint when present. */
  error?: string | null;
  /**
   * Why GRIDGO asks for this at all, for personal data (`lib/legal.ts`
   * `WHY_WE_ASK`). Stays under the hint and the error: a mistyped number does
   * not change why the number is wanted.
   */
  why?: string;
  children: ReactNode;
};

/**
 * Label, control, and one line of help — in that order, every time.
 *
 * A label labels and helper text explains; neither does the other's job. Keeping
 * the arrangement here is what gives every form on the app the same rhythm.
 */
export function FieldShell({ label, hint, error, why, children }: Props) {
  return (
    <View className="gap-2">
      <Text className="text-caption text-text-muted">{label}</Text>
      {children}
      {error ? (
        <Text className="text-caption text-error">{error}</Text>
      ) : hint ? (
        <Text className="text-caption text-text-muted">{hint}</Text>
      ) : null}
      {why ? <WhyWeAsk>{why}</WhyWeAsk> : null}
    </View>
  );
}
