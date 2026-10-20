import { useLocalSearchParams } from "expo-router";
import { Banknote, FileDown, Info } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import type { LegalVersion } from "@/lib/api";
import {
  changeNote,
  legalStatusLook,
  penaltyNote,
  PLACEHOLDER_NOTE,
  versionLine,
} from "@/lib/legal";
import { useLegalConsent } from "@/store/legalConsent";
import { useLegalLibrary } from "@/store/legalLibrary";

/**
 * One legal document, exactly the version that was linked.
 *
 * A version ID is a stable link: apply, the agreement screen and the library
 * all open the version they showed, so what is read is what is agreed to. It
 * paints at once from whatever list already holds it, then reads the version
 * itself. Text is plain text, set selectable so it can be quoted; a PDF, when
 * GRIDGO published one, opens in the browser from a short-lived link asked for
 * at the tap.
 */
export default function LegalDocumentScreen() {
  const colors = useThemeColors();
  const { versionId } = useLocalSearchParams<{ versionId: string }>();
  const held = useHeldVersion(versionId);
  const [doc, setDoc] = useState<LegalVersion | null>(null);
  const [failed, setFailed] = useState(false);
  const [pdfState, setPdfState] = useState<"idle" | "opening" | "failed">("idle");

  useEffect(() => {
    if (!versionId) return;
    let live = true;
    api
      .getLegalVersion(versionId)
      .then((read) => {
        if (live) {
          setDoc(read);
          setFailed(false);
        }
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [versionId]);

  const shown = doc ?? held;

  const openPdf = async () => {
    if (!shown) return;
    setPdfState("opening");
    try {
      const { url } = await api.getLegalVersionPdf(shown.id);
      await Linking.openURL(url);
      setPdfState("idle");
    } catch {
      setPdfState("failed");
    }
  };

  if (!shown) {
    return (
      <View className="gg-screen gg-page gap-4 pt-4">
        {failed ? (
          <ErrorNotice message="This document did not open. Check this phone's connection, then go back and open it again." />
        ) : (
          <View className="gap-3" accessibilityLabel="Loading the document">
            <SkeletonBlock className="h-8 w-3/4" />
            <SkeletonBlock className="h-4 w-1/2" />
            <SkeletonBlock className="h-64 w-full rounded-card" />
          </View>
        )}
      </View>
    );
  }

  const look = legalStatusLook(shown);
  const change = changeNote(shown);
  const money = penaltyNote(shown);

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page gap-5 pb-12 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-2">
          <Text className="text-h1 text-text-primary" accessibilityRole="header">
            {shown.title}
          </Text>
          <Text className="text-body text-text-muted">{versionLine(shown)}</Text>
          <View className="flex-row flex-wrap gap-2">
            <StatusChip tone={look.tone} label={look.label} icon={look.icon} />
            {shown.penalties ? (
              <StatusChip tone="info" label="Late deductions" icon="banknote" />
            ) : null}
          </View>
        </View>

        {shown.placeholder ? (
          <View className="gg-panel flex-row items-start gap-3" accessible>
            <Info size={18} color={colors.textSecondary} style={{ marginTop: 2 }} aria-hidden />
            <Text className="min-w-0 flex-1 text-body text-text-secondary">{PLACEHOLDER_NOTE}</Text>
          </View>
        ) : null}

        {money ? (
          <View className="gg-panel flex-row items-start gap-3" accessible>
            <Banknote size={18} color={colors.textPrimary} style={{ marginTop: 2 }} aria-hidden />
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-body font-medium text-text-primary">
                What this means for your pay
              </Text>
              <Text className="text-body text-text-primary">{money.promise}</Text>
              <Text className="text-body text-text-secondary">{money.clause}</Text>
            </View>
          </View>
        ) : null}

        {change ? (
          <View className="gap-1">
            <Text className="text-caption text-text-muted">What changed</Text>
            <Text className="text-body text-text-primary">{change}</Text>
          </View>
        ) : null}

        {shown.pdfUrl || shown.pdfFileId ? (
          <View className="gap-2">
            <Pressable
              onPress={() => void openPdf()}
              disabled={pdfState === "opening"}
              accessibilityRole="link"
              accessibilityLabel={`Open the ${shown.title} as a PDF`}
              className="gg-btn-secondary flex-row gap-2 self-start"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <FileDown size={18} color={colors.textPrimary} aria-hidden />
              <Text className="text-button text-text-primary">
                {pdfState === "opening" ? "Opening…" : "Open the PDF"}
              </Text>
            </Pressable>
            {pdfState === "failed" ? (
              <Text className="text-caption text-error" accessibilityRole="alert">
                The PDF did not open. Check this phone&apos;s connection and try again.
              </Text>
            ) : null}
          </View>
        ) : null}

        {shown.text.trim() ? (
          <View className="gg-card">
            <Text selectable className="text-body-lg text-text-primary">
              {shown.text}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** The version as a list on screen already has it, so the reader paints at once. */
function useHeldVersion(versionId: string | undefined): LegalVersion | null {
  const fromLibrary = useLegalLibrary(
    (state) => state.documents.find((doc) => doc.id === versionId) ?? null,
  );
  const fromGate = useLegalConsent(
    (state) =>
      state.pending.find((doc) => doc.id === versionId) ??
      state.notices.find((doc) => doc.id === versionId) ??
      null,
  );
  return fromLibrary ?? fromGate;
}
