import type { ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** What this screen is for, in a verb. */
  title: string;
  /** One sentence of what taking this step means. */
  lede: string;
  /** The job's name, so the shop always knows what it is acting on. */
  subject?: string;
  children: ReactNode;
  /** The action zone. Exactly one primary control belongs here. */
  footer: ReactNode;
  /** Names what went wrong on the last attempt and how to fix it. */
  actionError?: string | null;
};

/**
 * Shared shell for a single-step flow screen.
 *
 * Every flow reads the same way: what you are about to do, the job it applies
 * to, the fields it needs, then one action with room around it. Keeping the
 * rhythm here is what stops four screens drifting into four layouts.
 */
export function FlowScreen({
  loading,
  error,
  onRetry,
  title,
  lede,
  subject,
  children,
  footer,
  actionError,
}: Props) {
  const colors = useThemeColors();

  if (loading) {
    return (
      <View className="gg-screen items-center justify-center">
        <ActivityIndicator color={colors.textMuted} />
        <Text className="mt-3 text-body text-text-muted">Loading job…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="Job unavailable"
          body={error}
          actionLabel="Try again"
          onAction={onRetry}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="gg-screen">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gg-page pb-16 pt-4"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-2">
            <Text className="text-h2 text-text-primary">{title}</Text>
            {subject ? (
              <Text className="text-body-lg font-medium text-text-primary">{subject}</Text>
            ) : null}
            <Text className="text-body text-text-secondary">{lede}</Text>
          </View>

          <View className="mt-8 gap-6">{children}</View>

          {actionError ? (
            <View className="mt-6 rounded-field border border-error bg-surface p-3">
              <Text className="text-body text-error">{actionError}</Text>
            </View>
          ) : null}

          <View className="mt-8 gap-3">{footer}</View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
