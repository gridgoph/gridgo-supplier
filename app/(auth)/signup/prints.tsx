import { router } from "expo-router";
import { ChevronDown, ChevronUp, Zap } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { BusyOverlay } from "@/components/BusyOverlay";
import { ChipMultiSelect } from "@/components/ChipMultiSelect";
import { ErrorNotice } from "@/components/ErrorNotice";
import { OnboardingStep } from "@/components/OnboardingStep";
import { PrimaryButton } from "@/components/PrimaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { MoneyField } from "@/components/controls/MoneyField";
import { SwitchRow } from "@/components/controls/SwitchRow";
import { useThemeColors } from "@/hooks/useTheme";
import {
  COLOURS,
  DEFAULT_PRINTS,
  FINISHING,
  groupLabel,
  hasPrintsProblems,
  homePrintsProblems,
  homePrintsValue,
  isHomeSignup,
  missionProgress,
  orderedGroups,
  pagePriceLine,
  PAPERS,
  printsDraftFrom,
  printsProblems,
  printsValue,
  type Colour,
  type Finishing,
  type Paper,
  type PrintsDraft,
} from "@/lib/guidedSignup";
import { returnToMissions, useGuidedStepDraft } from "@/hooks/useApplyEntry";
import { useGuidedSignup } from "@/store/guidedSignup";

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
}

/**
 * Mission 3: what the shop prints (gridgo-supplier#265).
 *
 * Ticks, not typing. Documents come first and are already ticked, because
 * that is the shop this sign-up is for; the other groups are interests that
 * can wait. The per-page price is GRIDGO's own schedule, shown and never
 * edited here; only A3 and the optional finishing carry the shop's own price.
 */
export default function SignupPrintsStep() {
  useGuidedStepDraft();
  const colors = useThemeColors();
  const signup = useGuidedSignup((s) => s.signup);
  const terms = useGuidedSignup((s) => s.terms);
  const save = useGuidedSignup((s) => s.save);
  const [draft, setDraft] = useState<PrintsDraft>(() => printsDraftFrom(signup?.steps.prints));
  const [showProblems, setShowProblems] = useState(false);
  const [finishingOpen, setFinishingOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resumed = useRef(Boolean(signup?.steps.prints));

  useEffect(() => {
    if (resumed.current || !signup?.steps.prints) return;
    resumed.current = true;
    setDraft(printsDraftFrom(signup.steps.prints));
  }, [signup]);

  // A home printer prints documents only, on Short, A4 and Long (gridgo-api#412).
  const home = isHomeSignup(signup);
  const problems = home ? homePrintsProblems(draft) : printsProblems(draft);
  const shown = showProblems ? problems : {};
  const documents = home || draft.groups.includes("documents");
  const papers = home ? PAPERS.filter((paper) => paper.value !== "a3") : PAPERS;
  const groups = orderedGroups(terms?.printGroups ?? DEFAULT_PRINTS.groups);
  const hasFinishing = FINISHING.some((item) => draft.finishing[item.value].trim());

  function edit(next: Partial<PrintsDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function next() {
    setError(null);
    if (hasPrintsProblems(problems)) {
      setShowProblems(true);
      if (problems.finishing) setFinishingOpen(true);
      return;
    }
    setBusy(true);
    const result = await save("prints", home ? homePrintsValue(draft) : printsValue(draft));
    setBusy(false);
    if (result.status === "ok") returnToMissions();
    else if (result.status === "enrolled") router.replace("/(auth)/signup/missions");
    else setError(result.status === "failed" ? result.message : "Try again in a moment.");
  }

  return (
    <OnboardingStep
      progress={missionProgress("prints", home)}
      title="What you print"
      lede={
        home
          ? "Documents on Short, A4 and Long. Tick what your printer does."
          : "Tick what you can do. No typing."
      }
      contentClassName="gap-8 pb-4 pt-4"
      overlay={<BusyOverlay visible={busy} label="Saving…" />}
      footer={
        <>
          {error ? <ErrorNotice message={error} /> : null}
          <PrimaryButton label="Save" hint="I-save" disabled={busy} onPress={() => void next()} />
        </>
      }
    >
      {home ? null : (
        <View className="gap-3">
          <FieldShell label="Your shop prints" error={shown.groups ?? null}>
            <ChipMultiSelect
              options={groups.map((code) => ({ value: code, label: groupLabel(code).label }))}
              selected={draft.groups}
              onToggle={(code) => edit({ groups: toggle(draft.groups, code) })}
              accessibilityLabel="Your shop prints"
            />
          </FieldShell>
          <Text className="text-caption text-text-muted">
            Documents start today. Other kinds can wait; add them later from Products.
          </Text>
        </View>
      )}

      {documents ? (
        <View className="gap-6">
          {home ? null : <Text className="text-h3 text-text-primary">Documents</Text>}

          <FieldShell label="Paper" error={shown.papers ?? null}>
            <ChipMultiSelect
              options={papers.map((paper) => ({ value: paper.value, label: paper.label }))}
              selected={draft.papers}
              onToggle={(paper) => edit({ papers: toggle(draft.papers, paper as Paper) })}
              accessibilityLabel="Paper"
            />
          </FieldShell>

          <FieldShell label="Colour" error={shown.colours ?? null}>
            <ChipMultiSelect
              options={COLOURS.map((colour) => ({ value: colour.value, label: colour.label }))}
              selected={draft.colours}
              onToggle={(colour) => edit({ colours: toggle(draft.colours, colour as Colour) })}
              accessibilityLabel="Colour"
            />
          </FieldShell>

          <SwitchRow
            value={draft.duplex}
            onChange={(duplex) => edit({ duplex })}
            label="Back-to-back"
            hint="Print on both sides of the page."
          />

          {terms && draft.colours.length ? (
            <View className="gg-panel gap-2" testID="gridgo-page-price">
              <Text className="text-body font-medium text-text-primary">GRIDGO&apos;s price</Text>
              {COLOURS.filter((colour) => draft.colours.includes(colour.value)).map((colour) => (
                <View key={colour.value} className="flex-row items-center justify-between gap-3">
                  <Text className="text-body text-text-secondary">{colour.label}</Text>
                  <Text className="text-body font-medium text-text-primary">
                    {pagePriceLine(terms, colour.value)}
                  </Text>
                </View>
              ))}
              <Text className="text-caption text-text-muted">
                Same for every shop, for Short, A4 and Long. Back-to-back counts each side once.
              </Text>
            </View>
          ) : null}

          {!home && draft.papers.includes("a3") ? (
            <View className="gap-4" testID="a3-prices">
              <View className="gap-1">
                <Text className="text-body font-medium text-text-primary">Your A3 price</Text>
                <Text className="text-caption text-text-muted">
                  You set A3. For an A3 Express job, the client pays after you accept.
                </Text>
              </View>
              {COLOURS.filter((colour) => draft.colours.includes(colour.value)).map((colour) => (
                <FieldShell
                  key={colour.value}
                  label={`A3 ${colour.label.toLowerCase()}, per side`}
                  error={shown.a3?.[colour.value] ?? null}
                >
                  <MoneyField
                    value={draft.a3Prices[colour.value]}
                    onChange={(value) => edit({ a3Prices: { ...draft.a3Prices, [colour.value]: value } })}
                    accessibilityLabel={`A3 ${colour.label} price per side`}
                  />
                </FieldShell>
              ))}
            </View>
          ) : null}

          <View className="flex-row items-start gap-3 rounded-card border border-outline bg-surface p-4">
            <Zap size={20} color={colors.textPrimary} aria-hidden />
            <View className="min-w-0 flex-1">
              <Text className="text-body font-medium text-text-primary">Express is on</Text>
              <Text className="text-caption text-text-muted">
                {home
                  ? "Rush document jobs reach you while you're online. You switch online on To do."
                  : "Rush document jobs reach you first. You can turn it off later."}
              </Text>
            </View>
          </View>

          {home ? null : (
            <View className="gap-4">
              <Pressable
                onPress={() => setFinishingOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityState={{ expanded: finishingOpen }}
                className="gg-touch flex-row items-center justify-between gap-3"
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-body font-medium text-text-primary">
                    Stapling, binding, photo paper
                  </Text>
                  <Text className="text-caption text-text-muted">
                    {hasFinishing ? "Your prices are set." : "Optional, at your own price."}
                  </Text>
                </View>
                {finishingOpen ? (
                  <ChevronUp size={20} color={colors.textMuted} aria-hidden />
                ) : (
                  <ChevronDown size={20} color={colors.textMuted} aria-hidden />
                )}
              </Pressable>
              {finishingOpen
                ? FINISHING.map((item) => (
                    <FieldShell
                      key={item.value}
                      label={`${item.label}, ${item.unit}`}
                      hint="Leave empty if you do not offer it."
                      error={shown.finishing?.[item.value] ?? null}
                    >
                      <MoneyField
                        value={draft.finishing[item.value]}
                        onChange={(value) =>
                          edit({ finishing: { ...draft.finishing, [item.value as Finishing]: value } })
                        }
                        accessibilityLabel={`${item.label} price`}
                      />
                    </FieldShell>
                  ))
                : null}
            </View>
          )}
        </View>
      ) : null}
    </OnboardingStep>
  );
}
