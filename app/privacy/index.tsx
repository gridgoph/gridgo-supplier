import { router, useFocusEffect, type Href } from "expo-router";
import { ChevronRight, Eye, PencilLine, Trash2, type LucideIcon } from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import {
  DELETION_ROW,
  PRIVACY_KINDS,
  privacyKindTitle,
  privacyRequestLine,
  privacyStatusLook,
  RETENTION_NOTE,
} from "@/lib/legal";
import { usePrivacyRequests } from "@/store/privacyRequests";

const DELETE_ACCOUNT = "/delete-account" as Href;

function requestHref(kind: "access" | "correction"): Href {
  return { pathname: "/privacy/request", params: { kind } } as Href;
}

/**
 * Your data: the three things a shop can ask of GRIDGO about its personal
 * data, and what became of each request.
 *
 * Every action sends a request to Operations, who check it is the account
 * holder and answer by hand — nothing here exports, edits or deletes by
 * itself, and the screen says so rather than letting a tap look like it did.
 * The records GRIDGO must keep are said up front, beside the delete.
 *
 * Open while terms wait to be agreed: what a shop can ask about its own data
 * never waits behind a checkbox.
 */
export default function PrivacyScreen() {
  const requests = usePrivacyRequests((state) => state.requests);
  const status = usePrivacyRequests((state) => state.status);

  useFocusEffect(
    useCallback(() => {
      void usePrivacyRequests.getState().load();
    }, []),
  );

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page gap-6 pb-12 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-body text-text-secondary">
          Each of these sends a request to GRIDGO&apos;s Operations team. They check it is you, do
          it by hand, and tell you here when it is done.
        </Text>

        <View className="gg-card-flush">
          <ActionRow
            icon={Eye}
            title={PRIVACY_KINDS.access.title}
            detail={PRIVACY_KINDS.access.detail}
            onPress={() => router.push(requestHref("access"))}
          />
          <ActionRow
            icon={PencilLine}
            title={PRIVACY_KINDS.correction.title}
            detail={PRIVACY_KINDS.correction.detail}
            onPress={() => router.push(requestHref("correction"))}
            divided
          />
          <ActionRow
            icon={Trash2}
            title={DELETION_ROW.title}
            detail={DELETION_ROW.detail}
            onPress={() => router.push(DELETE_ACCOUNT)}
            divided
            destructive
          />
        </View>

        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">What GRIDGO keeps</Text>
          <Text className="text-body text-text-secondary">{RETENTION_NOTE}</Text>
        </View>

        <View className="gap-2">
          <Text className="text-overline text-text-muted" accessibilityRole="header">
            YOUR REQUESTS
          </Text>
          {requests.length ? (
            <View className="gg-card-flush">
              {requests.map((request, index) => {
                const look = privacyStatusLook(request.status);
                return (
                  <View
                    key={request.id}
                    accessible
                    accessibilityLabel={`${privacyKindTitle(request.kind)}. ${look.label}. ${privacyRequestLine(request)}`}
                    className={
                      index > 0
                        ? "gap-2 border-t border-outline-subtle px-4 py-3"
                        : "gap-2 px-4 py-3"
                    }
                  >
                    <View className="flex-row flex-wrap items-center justify-between gap-2">
                      <Text className="text-body font-medium text-text-primary">
                        {privacyKindTitle(request.kind)}
                      </Text>
                      <StatusChip tone={look.tone} label={look.label} icon={look.icon} />
                    </View>
                    <Text className="text-caption text-text-muted">
                      {privacyRequestLine(request)}
                    </Text>
                    {request.resolution?.trim() ? (
                      <Text className="text-body text-text-secondary">{request.resolution}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : status === "failed" ? (
            <ErrorNotice
              message="Your requests did not load. Check this phone's connection and try again."
              onRetry={() => void usePrivacyRequests.getState().load()}
            />
          ) : status === "ready" ? (
            <View className="gg-card">
              <Text className="text-body text-text-secondary">
                No requests yet. Anything you send shows here, with the date GRIDGO answers by.
              </Text>
            </View>
          ) : (
            <SkeletonBlock className="h-20 w-full rounded-card" />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function ActionRow({
  icon: Icon,
  title,
  detail,
  onPress,
  divided = false,
  destructive = false,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  onPress: () => void;
  divided?: boolean;
  destructive?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      className={
        divided
          ? "gg-touch flex-row items-center gap-3 border-t border-outline-subtle px-4 py-3"
          : "gg-touch flex-row items-center gap-3 px-4 py-3"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
        <Icon size={20} color={destructive ? colors.error : colors.textPrimary} aria-hidden />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className={
            destructive
              ? "text-body font-medium text-error"
              : "text-body font-medium text-text-primary"
          }
        >
          {title}
        </Text>
        <Text className="text-caption text-text-muted">{detail}</Text>
      </View>
      <ChevronRight size={20} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}
