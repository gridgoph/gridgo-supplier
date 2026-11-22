import { useEffect, useRef, useState } from "react";
import { ArrowUpToLine, BadgeCheck, CalendarCheck, Infinity as NoLimit } from "lucide-react-native";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { PaperRow, type PaperRowState } from "@/components/verify/PaperRow";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useShopVerification } from "@/hooks/useShopVerification";
import { useThemeColors } from "@/hooks/useTheme";
import { choosePhoto, discardPickedCopy, takePhoto, type PickOutcome } from "@/lib/pickFile";
import {
  papersOnFile,
  VERIFICATION_PAPERS,
  verificationBenefits,
  type VerificationPaper,
} from "@/lib/shopVerification";
import { sendDocument } from "@/lib/verification";
import { afterNativePresentation, askPick } from "@/store/sheets";
import type { PickedDocument } from "@/store/signupDraft";

type Local =
  | { kind: "sending"; progress: number; picked: PickedDocument }
  | { kind: "failed"; message: string; picked: PickedDocument }
  | { kind: "sent"; at: string };

const BENEFIT_ICONS = [BadgeCheck, ArrowUpToLine, NoLimit, CalendarCheck] as const;

/**
 * Get verified (gridgo-api `docs/SUPPLIER_VERIFICATION_API.md`, report F318781A).
 *
 * The shop is already taking jobs; this screen is optional and says so. It
 * opens once after sign-up (`?first=1`, with Skip) and from To do, Money and
 * My shop afterwards. Each paper uploads the moment it is picked, with its own
 * progress and Try again, and once GRIDGO has it the row reads "Checking".
 * Nothing is kept on the phone: a picked photo's cached copy is deleted once
 * it is sent, or when the screen is left with it unsent (`discardPickedCopy`).
 */
export default function VerifyScreen() {
  const colors = useThemeColors();
  const { first } = useLocalSearchParams<{ first?: string }>();
  const firstRun = first === "1";
  const { read, reload } = useShopVerification();
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const [local, setLocal] = useState<Partial<Record<VerificationPaper, Local>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  // Picks still held for a retry. Leaving the screen abandons them, and their
  // cached copies go with it: an ID must not outlive its upload on the phone.
  const held = useRef(new Map<VerificationPaper, PickedDocument>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const picks = held.current;
    return () => {
      mounted.current = false;
      for (const picked of picks.values()) void discardPickedCopy(picked);
      picks.clear();
    };
  }, []);

  const onFile = read ? papersOnFile(read.files) : {};
  const v = read?.verification ?? null;

  async function send(paper: VerificationPaper, picked: PickedDocument) {
    // A new pick for the same paper replaces, and forgets, the one before.
    const previous = held.current.get(paper);
    if (previous && previous !== picked) void discardPickedCopy(previous);
    held.current.set(paper, picked);
    setLocal((s) => ({ ...s, [paper]: { kind: "sending", progress: 0, picked } }));
    const outcome = await sendDocument(paper, picked, (progress) => {
      if (mounted.current) setLocal((s) => ({ ...s, [paper]: { kind: "sending", progress, picked } }));
    });
    if (outcome.status === "saved" || !mounted.current) {
      // GRIDGO has it (or the screen is gone): the phone's copy goes now.
      if (held.current.get(paper) === picked) held.current.delete(paper);
      void discardPickedCopy(picked);
    }
    if (!mounted.current) return;
    if (outcome.status === "saved") {
      setLocal((s) => ({ ...s, [paper]: { kind: "sent", at: new Date().toISOString() } }));
      void reload();
      return;
    }
    setLocal((s) => ({
      ...s,
      [paper]: {
        kind: "failed",
        picked,
        message:
          outcome.status === "failed"
            ? outcome.message
            : "GRIDGO is not taking papers in the app yet. Try again later.",
      },
    }));
  }

  async function add(paper: VerificationPaper) {
    const how = await askPick({
      title: VERIFICATION_PAPERS.find((d) => d.paper === paper)?.title ?? "Add a photo",
      options: [
        { value: "camera", label: "Take a photo" },
        { value: "gallery", label: "Choose from gallery" },
      ],
      selected: null,
    });
    if (!how) return;
    // Let the sheet finish closing before the camera or gallery opens over it.
    await afterNativePresentation();
    setProblem(null);
    const outcome: PickOutcome = how === "camera" ? await takePhoto() : await choosePhoto();
    if (outcome.ok) {
      void send(paper, outcome.document);
      return;
    }
    // A refused camera is not a failed upload: nothing was picked to retry.
    if (!outcome.cancelled) setProblem(outcome.message);
  }

  function stateOf(paper: VerificationPaper): PaperRowState {
    const mine = local[paper];
    if (mine?.kind === "sending") return { kind: "sending", progress: mine.progress };
    if (mine?.kind === "failed") return { kind: "failed", message: mine.message };
    const filed = onFile[paper];
    if (filed) return { kind: "checking", sentAt: filed.sentAt };
    if (mine?.kind === "sent") return { kind: "checking", sentAt: mine.at };
    return { kind: "missing" };
  }

  const states = VERIFICATION_PAPERS.map((d) => stateOf(d.paper));
  const allSent = states.every((s) => s.kind === "checking");
  const anySent = states.some((s) => s.kind === "checking");
  const busy = states.some((s) => s.kind === "sending");

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home" as Href);
  }

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />
        }
      >
        <View className="gap-2 pt-2">
          <Text className="text-caption font-medium text-text-muted">Optional, about a minute</Text>
          <Text className="text-h1 text-text-primary">
            {allSent ? "We're checking your papers" : "Verified shops get more jobs"}
          </Text>
          <Text className="text-body text-text-secondary">
            {allSent
              ? "Keep taking jobs while we check. We'll tell you when you're verified."
              : "You can take jobs today. Send your ID and business permit when you're ready."}
          </Text>
        </View>

        {v ? (
          <View className="mt-6 flex-row flex-wrap gap-2" testID="verify-benefits">
            {verificationBenefits(v).map((benefit, index) => {
              const Icon = BENEFIT_ICONS[index] ?? BadgeCheck;
              return (
                <View
                  key={benefit.title}
                  className="min-w-0 grow basis-[46%] gap-1.5 rounded-card border border-outline bg-surface p-3"
                >
                  <Icon size={20} color={colors.success} strokeWidth={2} aria-hidden />
                  <Text className="text-body font-bold text-text-primary">{benefit.title}</Text>
                  <Text className="text-caption text-text-secondary">{benefit.detail}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        <View className="gg-card mt-6 py-1">
          {VERIFICATION_PAPERS.map((definition, index) => {
            const mine = local[definition.paper];
            return (
              <View
                key={definition.paper}
                className={index ? "border-t border-outline-subtle" : undefined}
              >
                <PaperRow
                  definition={definition}
                  state={states[index]}
                  onAdd={() => void add(definition.paper)}
                  onRetry={() => {
                    if (mine?.kind === "failed") void send(definition.paper, mine.picked);
                  }}
                />
              </View>
            );
          })}
        </View>

        {problem ? <Text className="mt-3 text-caption text-error">{problem}</Text> : null}

        <View className="gg-panel mt-4 gap-1">
          <Text className="text-body text-text-secondary">
            {anySent
              ? "GRIDGO usually checks within a working day. Your jobs carry on meanwhile."
              : v && !v.newOrdersPaused && v.daysLeft > 0
                ? `No time now? Skip it. You have ${v.daysLeft === 1 ? "1 day" : `${v.daysLeft} days`} before new orders pause.`
                : "No time now? Skip it. Your open jobs still finish."}
          </Text>
        </View>

        {firstRun ? (
          <View className="mt-8 gap-3">
            {allSent ? (
              <PrimaryButton label="Go to To do" onPress={leave} />
            ) : (
              <SecondaryButton label="Skip for now" onPress={leave} disabled={busy} />
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
