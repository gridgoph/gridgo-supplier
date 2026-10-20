import { router, type Href } from "expo-router";
import { Banknote, ChevronRight, LockKeyhole } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorNotice } from "@/components/ErrorNotice";
import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { CheckboxRow } from "@/components/controls/CheckboxRow";
import { LegalDocumentRow } from "@/components/legal/LegalDocumentRow";
import { useThemeColors } from "@/hooks/useTheme";
import { gateBody, gateHeading, joinTitles, libraryOrder, penaltyNote } from "@/lib/legal";
import { useLegalConsent } from "@/store/legalConsent";
import { useLegalNotices } from "@/store/legalNotices";
import { useSession } from "@/store/session";

const PRIVACY = "/privacy" as Href;

/**
 * Terms to agree to, before anything else in the app opens.
 *
 * Reached only through launch and the root stack's guards, which close every
 * ordinary screen while `GET /me/legal/pending` says `blocking` — an invited
 * shop's first sign-in, and every shop after a material change. What stays
 * open is what a shop needs in order to decide: each document, its privacy
 * requests, and the way out. Signing out is never behind the checkbox.
 *
 * The box and the action are pinned under the list, so a shop reading the
 * documents never has to hunt for where to agree. The box starts unticked and
 * is drawn again unticked whenever the versions on screen change, so a version
 * that took effect mid-read is never agreed to by a tick given to the one
 * before it.
 */
export default function LegalReviewScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const userId = useSession((state) => state.user?.id ?? null);
  const logout = useSession((state) => state.logout);
  const pending = useLegalConsent((state) => state.pending);
  const notices = useLegalConsent((state) => state.notices);
  const accepting = useLegalConsent((state) => state.accepting);
  const error = useLegalConsent((state) => state.error);

  // Agreed to in GRIDGO's order; read in the library's, Supplier Agreement first.
  const versionIds = pending.map((doc) => doc.id);
  const shown = libraryOrder(pending);
  const signature = versionIds.join("|");
  const [agreedTo, setAgreedTo] = useState<string | null>(null);
  const [nudged, setNudged] = useState(false);
  const agreed = agreedTo === signature && pending.length > 0;
  const money = pending.map(penaltyNote).find(Boolean) ?? null;

  const agree = async () => {
    // The action stays pressable, as every action in this app does; pressing
    // it early names the one thing missing instead of greying out the yellow.
    if (!agreed) {
      setNudged(true);
      return;
    }
    const done = await useLegalConsent.getState().accept(versionIds);
    // Editorial notices were on this screen too; they need no second showing.
    if (done && userId) {
      useLegalNotices.getState().markSeen(
        userId,
        useLegalConsent.getState().notices.map((doc) => doc.id),
      );
    }
  };

  return (
    <View className="gg-screen">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: insets.top + 16 }}>
        <View className="gg-page gap-7 pb-8">
          <View className="gap-4">
            <GridgoLogo size={36} role="supplier" />
            <View className="gap-2">
              <Text className="text-h1 text-text-primary" accessibilityRole="header">
                {gateHeading(pending)}
              </Text>
              <Text className="text-body-lg text-text-secondary">{gateBody(pending)}</Text>
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-overline text-text-muted">NEEDS YOUR AGREEMENT</Text>
            <View className="gg-card-flush">
              {shown.map((doc, index) => (
                <LegalDocumentRow key={doc.id} doc={doc} divided={index > 0} showChange />
              ))}
            </View>
          </View>

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

          {notices.length ? (
            <View className="gap-2">
              <Text className="text-overline text-text-muted">MORE TO READ, NOTHING TO AGREE TO</Text>
              <View className="gg-card-flush">
                {libraryOrder(notices).map((doc, index) => (
                  <LegalDocumentRow key={doc.id} doc={doc} divided={index > 0} />
                ))}
              </View>
            </View>
          ) : null}

          <View className="gap-3">
            <Pressable
              onPress={() => router.push(PRIVACY)}
              accessibilityRole="button"
              accessibilityLabel="Your data"
              accessibilityHint="See, correct or delete what GRIDGO holds, without agreeing first"
              className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
                <LockKeyhole size={20} color={colors.textPrimary} aria-hidden />
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-body font-medium text-text-primary">Your data</Text>
                <Text className="text-caption text-text-muted">
                  See, correct or delete what GRIDGO holds, without agreeing first
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textMuted} aria-hidden />
            </Pressable>
            <SecondaryButton
              label="Sign out"
              disabled={accepting}
              onPress={() => void logout()}
            />
          </View>
        </View>
      </ScrollView>

      {/*
        The decision, pinned: what ticking it says, then the one yellow action.
        A shop reading three documents should never have to scroll to find
        where to agree.
      */}
      <View
        className="gg-page gap-3 border-t border-outline bg-surface pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <CheckboxRow
          checked={agreed}
          onChange={(next) => {
            setAgreedTo(next ? signature : null);
            setNudged(false);
          }}
          disabled={accepting || pending.length === 0}
          label={`I have read and agree to the ${joinTitles(shown)}`}
          hint={
            nudged && !agreed ? (
              <Text className="text-caption text-error" accessibilityRole="alert">
                Tick the box first. It says you have read these and agree to them.
              </Text>
            ) : (
              "GRIDGO records which versions you agreed to, and when."
            )
          }
        />
        {error ? <ErrorNotice message={error} /> : null}
        <PrimaryButton
          label={accepting ? "Saving your agreement…" : "Agree and continue"}
          disabled={accepting || pending.length === 0}
          onPress={() => void agree()}
        />
      </View>
    </View>
  );
}
