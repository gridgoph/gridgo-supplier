import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { SkeletonBlock } from "@/components/Skeleton";

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
 *
 * The action lives *inside* the scroll view rather than pinned under it, and
 * that is what makes the keyboard case simple: one surface moves, so the
 * focused field and the button it leads to are reachable by the same scroll.
 * A production update is this shell inside a form sheet — the scroll surface
 * measures against the window, so it is right there too.
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
  if (loading) {
    return (
      <View
        className="gg-screen gg-page pt-4"
        accessibilityRole="progressbar"
        accessibilityLabel="Loading this job"
      >
        <View className="gap-3">
          <SkeletonBlock className="h-7 w-2/3" />
          <SkeletonBlock className="h-5 w-1/2" />
          <SkeletonBlock className="h-4 w-full" />
        </View>
        <View className="mt-8 gap-4">
          <SkeletonBlock className="h-24 w-full rounded-card" />
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-12 w-full" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="This job is not reachable"
          body={error}
          actionLabel="Try again"
          onAction={onRetry}
        />
      </View>
    );
  }

  return (
    <View className="gg-screen">
      <FormScrollView contentClassName="gg-page pb-16 pt-4">
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">{title}</Text>
          {subject ? (
            <Text className="text-body-lg font-medium text-text-primary">{subject}</Text>
          ) : null}
          <Text className="text-body text-text-secondary">{lede}</Text>
        </View>

        <View className="mt-8 gap-6">{children}</View>

        {actionError ? (
          <View className="mt-6">
            <ErrorNotice message={actionError} />
          </View>
        ) : null}

        <View className="mt-8 gap-3">{footer}</View>
      </FormScrollView>
    </View>
  );
}
