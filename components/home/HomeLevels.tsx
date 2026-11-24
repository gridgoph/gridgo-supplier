import { router, useFocusEffect, type Href } from "expo-router";
import { BadgeCheck, Check, House, Lock, MapPin } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { SwitchRow } from "@/components/controls/SwitchRow";
import { PaperRow, type PaperRowState } from "@/components/verify/PaperRow";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import {
  homePapersOnFile,
  levelLabel,
  nextPinChangeLine,
  STARTER_PAPERS,
  starterSteps,
  starterWaiting,
  stepsLeftLine,
  VERIFIED_PAPERS,
  verifiedMissing,
  verifyByLine,
  weeklyJobsLine,
  type HomePaper,
  type HomePrinterRead,
} from "@/lib/homePrinter";
import { choosePhoto, discardPickedCopy, takePhoto, type PickOutcome } from "@/lib/pickFile";
import { sendDocument } from "@/lib/verification";
import { useHomePrinter } from "@/store/homePrinter";
import { afterNativePresentation, askConfirm, askPick } from "@/store/sheets";
import type { PickedDocument } from "@/store/signupDraft";

type Local =
  | { kind: "sending"; progress: number; picked: PickedDocument }
  | { kind: "failed"; message: string; picked: PickedDocument }
  | { kind: "sent"; at: string };

/**
 * Get verified, for someone printing from home (gridgo-api#412).
 *
 * Two levels, one calm checklist each. Starter comes first and is what lets
 * the printer go online: a file-privacy promise, an ID showing 18 or older, a
 * selfie with it and a test print. Verified is next, with GRIDGO's own
 * deadline. Each paper uploads the moment it is picked, and GRIDGO — never
 * an upload — decides the level. The cap and the deadline are GRIDGO's.
 */
export function HomeLevels({ home, firstRun = false }: { home: HomePrinterRead; firstRun?: boolean }) {
  const colors = useThemeColors();
  const update = useHomePrinter((s) => s.update);
  const [documents, setDocuments] = useState<unknown[] | null>(null);
  const [local, setLocal] = useState<Partial<Record<HomePaper, Local>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [agreedNow, setAgreedNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const held = useRef(new Map<HomePaper, PickedDocument>());
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    const [read] = await Promise.all([
      api.getSupplierVerification().catch(() => null),
      useHomePrinter.getState().load(),
    ]);
    if (mounted.current && read) setDocuments(read.files);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const picks = held.current;
    return () => {
      mounted.current = false;
      for (const picked of picks.values()) void discardPickedCopy(picked);
      picks.clear();
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  useLiveRefresh(["approvals", "identity", "catalog"], reload);
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  const status = home.status;
  const onFile = homePapersOnFile(documents ?? []);
  for (const [paper, mine] of Object.entries(local)) if (mine?.kind === "sent") onFile.add(paper as HomePaper);
  const steps = starterSteps(status, onFile, agreedNow);
  const waiting = starterWaiting(status, steps);
  const needsPin = status.reason === "home_pin_consent_required";
  const verifiedLeft = verifiedMissing(onFile);
  const weekly = weeklyJobsLine(status);
  const verifyBy = verifyByLine(status);

  async function send(paper: HomePaper, picked: PickedDocument) {
    const previous = held.current.get(paper);
    if (previous && previous !== picked) void discardPickedCopy(previous);
    held.current.set(paper, picked);
    setLocal((s) => ({ ...s, [paper]: { kind: "sending", progress: 0, picked } }));
    const outcome = await sendDocument(paper, picked, (progress) => {
      if (mounted.current) setLocal((s) => ({ ...s, [paper]: { kind: "sending", progress, picked } }));
    });
    if (outcome.status === "saved" || !mounted.current) {
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
        message: outcome.status === "failed" ? outcome.message : "GRIDGO is not taking papers in the app yet. Try again later.",
      },
    }));
  }

  async function add(paper: HomePaper, title: string) {
    const how = await askPick({
      title,
      options: [
        { value: "camera", label: "Take a photo" },
        { value: "gallery", label: "Choose from gallery" },
      ],
      selected: null,
    });
    if (!how) return;
    await afterNativePresentation();
    setProblem(null);
    const outcome: PickOutcome = how === "camera" ? await takePhoto() : await choosePhoto();
    if (outcome.ok) {
      void send(paper, outcome.document);
      return;
    }
    if (!outcome.cancelled) setProblem(outcome.message);
  }

  function stateOf(paper: HomePaper, done: boolean): PaperRowState {
    const mine = local[paper];
    if (mine?.kind === "sending") return { kind: "sending", progress: mine.progress };
    if (mine?.kind === "failed") return { kind: "failed", message: mine.message };
    if (done || onFile.has(paper)) return { kind: "checking", sentAt: mine?.kind === "sent" ? mine.at : null };
    return { kind: "missing" };
  }

  async function agree() {
    const ok = await askConfirm({
      question: "Keep client files private?",
      consequence: status.filePrivacyWording,
      confirmLabel: "I agree",
      cancelLabel: "Not now",
    });
    if (!ok) return;
    setSaving(true);
    setProblem(null);
    const result = await update(
      { filePrivacyAgreement: { accepted: true, wording: status.filePrivacyWording } },
      "save your agreement",
    );
    setSaving(false);
    if (result.status === "ok") setAgreedNow(true);
    else setProblem(result.message);
  }

  async function pickup(value: boolean) {
    setSaving(true);
    setProblem(null);
    const result = await update({ allowHomePickup: value }, "change pickup at home");
    setSaving(false);
    if (result.status === "failed") setProblem(result.message);
  }

  const title =
    status.level === "verified"
      ? "You're Verified"
      : status.level === "starter"
        ? "You're a Starter"
        : waiting
          ? "GRIDGO is checking"
          : "Get to Starter";
  const lede =
    status.level === "verified"
      ? "No weekly limit. Clients see the green Verified check."
      : status.level === "starter"
        ? weekly
          ? `You can go online on To do. ${weekly}.`
          : "You can go online on To do."
        : waiting
          ? "We'll tell you when you're a Starter, usually within a working day. Then you can go online."
          : "A few quick steps. GRIDGO checks them, then you can go online and take jobs.";

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
      >
        <View className="gap-3 pt-2">
          <View className="flex-row items-center gap-2" testID="home-level">
            <View className="flex-row items-center gap-1.5 rounded-pill border border-outline bg-surface px-3 py-1">
              {status.level === "verified" ? (
                <BadgeCheck size={14} color={colors.success} strokeWidth={2.25} aria-hidden />
              ) : (
                <House size={14} color={colors.textPrimary} strokeWidth={2.25} aria-hidden />
              )}
              <Text
                className={
                  status.level === "verified"
                    ? "text-caption font-medium text-success"
                    : "text-caption font-medium text-text-primary"
                }
              >
                {levelLabel(status.level)}
              </Text>
            </View>
            {status.level === "pending" && !waiting ? (
              <Text className="text-caption text-text-muted">{stepsLeftLine(steps)}</Text>
            ) : null}
          </View>
          <Text className="text-h1 text-text-primary">{title}</Text>
          <Text className="text-body text-text-secondary">{lede}</Text>
        </View>

        {needsPin ? (
          <View className="gg-card mt-6 gap-3" testID="home-needs-pin">
            <Text className="text-body font-medium text-text-primary">Set your home pin first</Text>
            <Text className="text-body text-text-secondary">
              GRIDGO needs your pin and your OK on how it is shared.
            </Text>
            <PrimaryButton label="Set your home pin" onPress={() => router.push("/home-pin")} />
          </View>
        ) : null}

        {status.level === "pending" ? (
          <View className="mt-6 gap-2">
            <Text className="text-body font-medium text-text-primary">Starter</Text>
            <View className="gg-card py-1" testID="starter-steps">
              <AgreementRow done={steps[0].done} busy={saving} onAgree={() => void agree()} />
              {STARTER_PAPERS.map((definition) => (
                <View key={definition.paper} className="border-t border-outline-subtle">
                  <PaperRow
                    definition={definition}
                    state={stateOf(definition.paper, steps.find((step) => step.id === definition.paper)?.done ?? false)}
                    onAdd={() => void add(definition.paper, definition.title)}
                    onRetry={() => {
                      const mine = local[definition.paper];
                      if (mine?.kind === "failed") void send(definition.paper, mine.picked);
                    }}
                  />
                </View>
              ))}
            </View>
            <Text className="text-caption text-text-muted">
              Your ID and selfie are only for GRIDGO. Clients never see them.
            </Text>
          </View>
        ) : null}

        {problem ? <ErrorNotice message={problem} /> : null}

        {status.level !== "verified" ? (
          <View className="mt-8 gap-2" testID="verified-steps">
            <Text className="text-body font-medium text-text-primary">
              {status.level === "starter" ? "Next: Verified" : "After Starter: Verified"}
            </Text>
            <Text className="text-body text-text-secondary">
              {verifyBy ?? "Verified printers have no weekly limit and show a green check."}
            </Text>
            <View className="gg-card py-1">
              {VERIFIED_PAPERS.filter((definition) =>
                definition.paper === "tin"
                  ? true
                  : verifiedLeft.permit || onFile.has(definition.paper) || local[definition.paper] != null,
              ).map((definition, index) => (
                <View key={definition.paper} className={index ? "border-t border-outline-subtle" : undefined}>
                  <PaperRow
                    definition={definition}
                    state={stateOf(definition.paper, false)}
                    onAdd={() => void add(definition.paper, definition.title)}
                    onRetry={() => {
                      const mine = local[definition.paper];
                      if (mine?.kind === "failed") void send(definition.paper, mine.picked);
                    }}
                  />
                </View>
              ))}
            </View>
            {verifiedLeft.permit ? (
              <Text className="text-caption text-text-muted">One of the first two is enough.</Text>
            ) : null}
          </View>
        ) : (
          <View className="mt-6">
            <SwitchRow
              value={status.allowHomePickup}
              onChange={(value) => void pickup(value)}
              disabled={saving}
              label="Allow pickup at my home"
              hint="Paid clients then see your street. Never your pin."
            />
          </View>
        )}

        <HomePinRow home={home} />

        {documents == null ? (
          <View className="mt-4 gap-2" accessibilityRole="progressbar" accessibilityLabel="Loading your papers">
            <SkeletonBlock className="h-4 w-1/2" />
          </View>
        ) : null}

        {firstRun ? (
          <View className="mt-8 gap-3">
            <SecondaryButton label={waiting ? "Go to To do" : "Skip for now"} onPress={leave} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function AgreementRow({ done, busy, onAgree }: { done: boolean; busy: boolean; onAgree: () => void }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-3 py-3" testID="paper-privacy">
      <View className="h-11 w-11 items-center justify-center rounded-field bg-surface-variant">
        {done ? (
          <Check size={20} color={colors.success} strokeWidth={2} aria-hidden />
        ) : (
          <Lock size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
        )}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">Keep client files private</Text>
        <Text className="text-caption text-text-muted" numberOfLines={2}>
          {done ? "You agreed" : "Use files only to print, then delete them"}
        </Text>
      </View>
      {done ? (
        <Text className="text-caption font-medium text-success">Done</Text>
      ) : (
        <Pressable
          onPress={onAgree}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Agree to keep client files private"
          className="gg-touch flex-row items-center rounded-pill bg-accent px-4"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          testID="privacy-agree"
        >
          <Text className="text-button text-accent-on">{busy ? "Saving…" : "Agree"}</Text>
        </Pressable>
      )}
    </View>
  );
}

function HomePinRow({ home }: { home: HomePrinterRead }) {
  const colors = useThemeColors();
  const later = nextPinChangeLine(home.pin);
  if (!home.pin.barangay) return null;
  return (
    <View className="gg-card mt-8 gap-3" testID="home-pin-row">
      <View className="flex-row items-start gap-3">
        <MapPin size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body font-medium text-text-primary">Your home pin</Text>
          <Text className="text-body text-text-secondary">
            {[home.pin.street, home.pin.barangay].filter(Boolean).join(", ")}
          </Text>
          <Text className="text-caption text-text-muted">Clients see only {home.pin.barangay}.</Text>
        </View>
      </View>
      {later ? (
        <Text className="text-caption text-text-muted">{later}</Text>
      ) : (
        <SecondaryButton label="Move my pin" onPress={() => router.push("/home-pin")} />
      )}
    </View>
  );
}
