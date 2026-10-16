import { router, useFocusEffect, type Href } from "expo-router";
import { ChevronRight, LockKeyhole } from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { LegalDocumentRow } from "@/components/legal/LegalDocumentRow";
import { SkeletonBlock } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import { libraryOrder } from "@/lib/legal";
import { useLegalLibrary } from "@/store/legalLibrary";

const PRIVACY = "/privacy" as Href;

/**
 * Account > Legal & Privacy: every document GRIDGO has in effect for shops,
 * read from the API so a newly published version is here without an update.
 *
 * The Supplier Agreement leads, because it is the one that governs a shop's
 * jobs and pay. Each row says its version, whether it is still placeholder
 * text, and whether it allows late-production deductions. Below the documents
 * is the way to the shop's own data — the half of privacy that is something
 * it can do rather than something it can read.
 */
export default function LegalLibraryScreen() {
  const colors = useThemeColors();
  const documents = useLegalLibrary((state) => state.documents);
  const status = useLegalLibrary((state) => state.status);

  useFocusEffect(
    useCallback(() => {
      void useLegalLibrary.getState().load({ force: true });
    }, []),
  );

  const ordered = libraryOrder(documents);

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page gap-6 pb-12 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-body text-text-secondary">
          The agreements your shop works under and the policies GRIDGO works by. When one changes
          in a way that matters, GRIDGO asks you to agree again before your next job.
        </Text>

        <View className="gap-2">
          <Text className="text-overline text-text-muted" accessibilityRole="header">
            DOCUMENTS
          </Text>
          {ordered.length ? (
            <View className="gg-card-flush">
              {ordered.map((doc, index) => (
                <LegalDocumentRow key={doc.id} doc={doc} divided={index > 0} />
              ))}
            </View>
          ) : status === "failed" ? (
            <ErrorNotice
              message="GRIDGO's documents did not load. Check this phone's connection and try again."
              onRetry={() => void useLegalLibrary.getState().load({ force: true })}
            />
          ) : status === "unsupported" ? (
            <View className="gg-card">
              <Text className="text-body text-text-secondary">
                GRIDGO has not published its documents in the app yet.
              </Text>
            </View>
          ) : (
            <View accessibilityLabel="Loading the documents" className="gap-2">
              <SkeletonBlock className="h-24 w-full rounded-card" />
              <SkeletonBlock className="h-24 w-full rounded-card" />
              <SkeletonBlock className="h-24 w-full rounded-card" />
            </View>
          )}
        </View>

        <View className="gap-2">
          <Text className="text-overline text-text-muted" accessibilityRole="header">
            YOUR PRIVACY
          </Text>
          <Pressable
            onPress={() => router.push(PRIVACY)}
            accessibilityRole="button"
            accessibilityLabel="Your data"
            accessibilityHint="See, correct or delete the personal data GRIDGO holds about you"
            className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
              <LockKeyhole size={20} color={colors.textPrimary} aria-hidden />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-body font-medium text-text-primary">Your data</Text>
              <Text className="text-caption text-text-muted">
                See, correct or delete the personal data GRIDGO holds about you
              </Text>
            </View>
            <ChevronRight size={20} color={colors.textMuted} aria-hidden />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
