import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react-native";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { DocumentSlot } from "@/components/DocumentSlot";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PushEnableCard } from "@/components/PushEnableCard";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";
import { PUBLISHED_CATALOG } from "@/data/serviceCatalog";
import type { VerificationStatus } from "@/lib/api";
import { chooseFile, takePhoto, type PickOutcome } from "@/lib/pickFile";
import { VERIFICATION_DOCUMENTS } from "@/lib/verification";
import { describeDocumentQueue, useAccreditationDocs } from "@/store/accreditationDocs";
import type { DocumentKind } from "@/store/signupDraft";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import { useSession } from "@/store/session";

/**
 * Where a shop waits.
 *
 * Papers and the wait. A shop opens this from Home or Settings while
 * Operations reviews the account — it is not the post-auth trap. Home already
 * said the floor is empty; this screen is the work that can still move the
 * decision: the papers, and the pin.
 */
export default function AccreditationScreen() {
  const user = useSession((s) => s.user);
  const refresh = useSession((s) => s.refresh);
  const logout = useSession((s) => s.logout);
  const colors = useThemeColors();
  const [checking, setChecking] = useState(false);

  const entries = useAccreditationDocs((s) => s.entries);
  const hydrated = useAccreditationDocs((s) => s.hydrated);
  const addDocument = useAccreditationDocs((s) => s.add);
  const removeDocument = useAccreditationDocs((s) => s.remove);
  const sendDocuments = useAccreditationDocs((s) => s.send);
  const [pickProblems, setPickProblems] = useState<Partial<Record<DocumentKind, string>>>({});

  const reload = useCallback(async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  }, [refresh]);

  // An approval that lands while the shop has the app open should be picked up
  // without a sign-out, so returning to this screen re-reads the account.
  useLiveRefresh(["identity", "approvals"], reload);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  // A queue left half-sent by a dead phone or a dropped connection picks itself
  // back up once the store has rehydrated. `send` is a no-op when nothing is
  // outstanding, and it refuses to run twice at once.
  useEffect(() => {
    if (hydrated) void sendDocuments();
  }, [hydrated, sendDocuments]);

  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const status = presentVerification(user?.verificationStatus);
  const ranked = user?.categoryRanks ?? [];
  const queue = describeDocumentQueue(entries);
  const outstanding = VERIFICATION_DOCUMENTS.filter(
    (definition) => entries[definition.kind]?.stage !== "sent",
  );
  const canSend = outstanding.some((definition) => {
    const stage = entries[definition.kind]?.stage;
    return stage === "queued" || stage === "failed";
  });

  function apply(kind: DocumentKind, outcome: PickOutcome) {
    if (outcome.ok) {
      addDocument(kind, outcome.document);
      setPickProblems((current) => ({ ...current, [kind]: undefined }));
      void sendDocuments();
      return;
    }
    if (outcome.cancelled) return;
    setPickProblems((current) => ({ ...current, [kind]: outcome.message }));
  }

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        <View className="gg-card gap-4">
          <View className="flex-row">
            <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
          </View>
          <Text className="text-h3 text-text-primary">{status.headline}</Text>
          <Text className="text-body text-text-secondary">{status.body}</Text>
          {user?.verificationNote ? (
            <View className="gg-panel gap-1">
              <Text className="text-caption text-text-muted">From Operations</Text>
              <Text className="text-body text-text-primary">{user.verificationNote}</Text>
            </View>
          ) : null}
        </View>

        {/* The one thing a waiting shop can still act on. */}
        <View className="mt-6 gap-2">
          <Text className="text-overline text-text-muted">YOUR PAPERS</Text>
          {queue ? (
            <View className="gg-panel gap-1">
              <Text className="text-body font-medium text-text-primary">{queue.title}</Text>
              <Text className="text-body text-text-secondary">{queue.body}</Text>
            </View>
          ) : null}
          {outstanding.map((definition) => {
            const entry = entries[definition.kind];
            return (
              <DocumentSlot
                key={definition.kind}
                definition={definition}
                picked={entry?.picked}
                problem={pickProblems[definition.kind] ?? entry?.error}
                onTakePhoto={() => void takePhoto().then((o) => apply(definition.kind, o))}
                onChooseFile={() => void chooseFile().then((o) => apply(definition.kind, o))}
                onRemove={() => removeDocument(definition.kind)}
              />
            );
          })}
        </View>

        <View className="mt-6 gap-2">
          <Text className="text-overline text-text-muted">WHAT GRIDGO HAS</Text>
          <View className="gg-card">
            <SpecRow label="Shop" value={user?.supplierName || "—"} />
            <SpecRow label="Contact" value={user?.name || "—"} />
            <SpecRow label="Email" value={user?.email || "—"} />
          </View>
          <Pressable
            onPress={() => router.push("/shop-location")}
            accessibilityRole="button"
            accessibilityLabel="Change where your shop is"
            className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-caption text-text-muted">Where you print</Text>
              <Text className="text-body text-text-primary" numberOfLines={2}>
                {user?.shop?.label || "No pin yet"}
              </Text>
            </View>
            <ChevronRight size={20} color={colors.textMuted} aria-hidden />
          </Pressable>
        </View>

        {ranked.length ? (
          <View className="mt-6 gap-2">
            <Text className="text-overline text-text-muted">WHAT YOU SAID YOU PRINT</Text>
            <View className="gg-card gap-3">
              {[...ranked]
                .sort((a, b) => a.rank - b.rank)
                .map((entry) => (
                  <View key={entry.categoryCode} className="flex-row items-start gap-3">
                    <Text className="text-body font-bold text-text-primary">{entry.rank}</Text>
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="text-body text-text-secondary">
                        {categoryName(entry.categoryCode)}
                      </Text>
                      {entry.rank === 1 ? (
                        <Text className="text-caption text-text-muted">What you do best</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
            </View>
            <Text className="text-caption text-text-muted">
              Ask Operations if this order needs to change.
            </Text>
          </View>
        ) : null}

        {/*
          This whole screen is a shop waiting to hear from Operations, with
          nothing else it can do — so "we will tell your phone" is the answer to
          the question the screen exists to raise, rather than an interruption.
        */}
        <PushEnableCard spacing="above" />

        <View className="mt-8 gap-3">
          {/* One yellow: whichever of the two actually moves things along. */}
          {canSend ? (
            <PrimaryButton label="Send my papers" onPress={() => void sendDocuments()} />
          ) : (
            <PrimaryButton
              label={checking ? "Checking…" : "Check again"}
              disabled={checking}
              onPress={() => void reload()}
            />
          )}
          {canSend ? (
            <SecondaryButton
              label={checking ? "Checking…" : "Check again"}
              disabled={checking}
              onPress={() => void reload()}
            />
          ) : null}
          <SecondaryButton label="Settings" onPress={() => router.push("/settings")} />
          <SecondaryButton label="Sign out" onPress={() => void logout()} />
        </View>
      </ScrollView>
    </View>
  );
}

function categoryName(code: string): string {
  return PUBLISHED_CATALOG.find((category) => category.code === code)?.name ?? code;
}

type VerificationPresentation = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  headline: string;
  body: string;
};

/**
 * Each accreditation state in the shop's own words. None of them names the
 * platform's own status string, and none of them implies the shop is live.
 */
function presentVerification(
  status: VerificationStatus | undefined,
): VerificationPresentation {
  switch (status) {
    case "rejected":
      return {
        label: "Not accredited",
        tone: "error",
        icon: "circle-x",
        headline: "GRIDGO cannot accredit this shop yet",
        body: "Operations has decided against accrediting this account. Their reason is below if they left one — talk to them about what would need to change.",
      };
    case "suspended":
      return {
        label: "Suspended",
        tone: "error",
        icon: "triangle-alert",
        headline: "Your shop is paused",
        body: "GRIDGO has stopped sending you new work. Jobs already on your floor are not affected. Operations can tell you what it takes to start again.",
      };
    default:
      return {
        label: "With Operations",
        tone: "warning",
        icon: "clock",
        headline: "Operations is checking your shop",
        body: "Your account exists and everything you sent is with GRIDGO. No job will be matched to you until they approve it, so there is nothing on your floor yet. They usually come back within a working day, and this screen updates when it clears.",
      };
  }
}
