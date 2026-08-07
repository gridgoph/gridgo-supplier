import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import type { ColorToken } from "@/constants/theme";
import {
  setThemePreference,
  useThemeColors,
  useThemeName,
  useThemePreference,
  type ThemePreference,
} from "@/hooks/useTheme";

/**
 * Design system reference.
 *
 * Laid out as a press specification sheet — ruled sections, ink chips, a type
 * specimen — because that is the document GRIDGO's own trade works from.
 *
 * It is also a live check: every token, type step and class pattern renders
 * here, in both themes. Replace this route with the client home screen when
 * real screens land. This file is scaffolding, not product.
 */

type Ink = { token: ColorToken; swatch: string };

const SURFACE_INKS: Ink[] = [
  { token: "canvas", swatch: "bg-canvas" },
  { token: "surface", swatch: "bg-surface" },
  { token: "surfaceVariant", swatch: "bg-surface-variant" },
  { token: "surfaceHigh", swatch: "bg-surface-high" },
];

const TEXT_INKS: Ink[] = [
  { token: "textPrimary", swatch: "bg-text-primary" },
  { token: "textSecondary", swatch: "bg-text-secondary" },
  { token: "textMuted", swatch: "bg-text-muted" },
  { token: "outline", swatch: "bg-outline" },
  { token: "outlineSubtle", swatch: "bg-outline-subtle" },
  { token: "accent", swatch: "bg-accent" },
];

const SIGNAL_INKS: Ink[] = [
  { token: "success", swatch: "bg-success" },
  { token: "warning", swatch: "bg-warning" },
  { token: "error", swatch: "bg-error" },
  { token: "info", swatch: "bg-info" },
];

const ACTION_INKS: Ink[] = [
  { token: "actionYellow", swatch: "bg-action-yellow" },
  { token: "brand", swatch: "bg-brand" },
  { token: "brandLogo", swatch: "bg-brand-logo" },
];

const TYPE_SCALE: { name: string; className: string; spec: string }[] = [
  { name: "Display", className: "text-display", spec: "32 / 38 · Bold" },
  { name: "Heading 1", className: "text-h1", spec: "28 / 34 · Bold" },
  { name: "Heading 2", className: "text-h2", spec: "24 / 30 · Bold" },
  { name: "Heading 3", className: "text-h3", spec: "20 / 26 · Bold" },
  { name: "Body large", className: "text-body-lg", spec: "16 / 24 · Regular" },
  { name: "Body", className: "text-body", spec: "14 / 20 · Regular" },
  { name: "Caption", className: "text-caption", spec: "12 / 16 · Regular" },
  { name: "Button", className: "text-button", spec: "14 / 20 · Bold" },
];

const RADII: { label: string; use: string; className: string }[] = [
  { label: "8", use: "Chips", className: "rounded-sm" },
  { label: "12", use: "Fields", className: "rounded-field" },
  { label: "16", use: "Cards", className: "rounded-card" },
  { label: "24", use: "Sheets", className: "rounded-xl" },
];

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Ruled section head. The rule closes the heading the way a spec sheet does. */
function SectionHead({ title, rule }: { title: string; rule: string }) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <Text className="text-overline text-text-muted">{title}</Text>
        <View className="h-px flex-1 bg-outline" />
      </View>
      <Text className="text-caption text-text-muted">{rule}</Text>
    </View>
  );
}

/** An ink chip: the colour, then the name and value burned in underneath. */
function InkChip({ token, swatch }: Ink) {
  const colors = useThemeColors();

  return (
    <View className="w-[48%] overflow-hidden rounded-sm border border-outline">
      <View className={`h-14 w-full ${swatch}`} />
      <View className="border-t border-outline bg-surface px-3 py-2">
        <Text className="text-caption text-text-primary" numberOfLines={1}>
          {token}
        </Text>
        <Text className="text-caption text-text-muted">{colors[token]}</Text>
      </View>
    </View>
  );
}

function InkGroup({ title, inks }: { title: string; inks: Ink[] }) {
  return (
    <View className="gap-3">
      <Text className="text-caption text-text-secondary">{title}</Text>
      <View className="flex-row flex-wrap justify-between gap-3">
        {inks.map((ink) => (
          <InkChip key={ink.token} {...ink} />
        ))}
      </View>
    </View>
  );
}

function ThemeSwitch() {
  const preference = useThemePreference();

  return (
    <View className="flex-row gap-2 pt-4">
      {THEME_OPTIONS.map((option) => {
        const selected = option.value === preference;
        return (
          <Pressable
            key={option.value}
            onPress={() => setThemePreference(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            // Selected uses the monochrome accent. A theme switch is a routine
            // control, so it never spends the screen's yellow.
            className={
              selected
                ? "gg-chip gg-touch border-accent bg-accent px-4"
                : "gg-chip gg-touch bg-surface px-4"
            }
            style={({ pressed }) => (pressed ? { opacity: 0.9 } : undefined)}
          >
            <Text
              className={
                selected ? "text-button text-accent-on" : "text-button text-text-secondary"
              }
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function DesignSystemScreen() {
  const scheme = useThemeName();
  const colors = useThemeColors();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top"]}>
      <ScrollView className="gg-screen" showsVerticalScrollIndicator={false}>
        <View className="gg-page gap-10 pb-16 pt-6">
          {/* Masthead — the job ticket for the system itself. */}
          <View>
            <View className="pb-1">
              <GridgoLogo size={32} />
            </View>
            <Text className="pb-5 text-body text-text-secondary">
              Design system · Davao City pilot
            </Text>

            <View className="border-t border-outline">
              <SpecRow label="Typeface" value="Satoshi" />
              <SpecRow label="Base grid" value="4 px" />
              <SpecRow label="Page padding" value="16 px" />
              <SpecRow label="Touch target" value="44 × 44 px" />
              <SpecRow label="Theme" value={scheme === "dark" ? "Dark" : "Light"} />
            </View>

            <ThemeSwitch />
          </View>

          {/* Ink */}
          <View className="gap-5">
            <SectionHead title="INK" rule="Every colour is a token. Screens never carry a hex." />
            <InkGroup title="Surface" inks={SURFACE_INKS} />
            <InkGroup title="Text and line" inks={TEXT_INKS} />
            <InkGroup title="Signal" inks={SIGNAL_INKS} />
            <InkGroup title="Action" inks={ACTION_INKS} />
          </View>

          {/* Type */}
          <View className="gap-4">
            <SectionHead
              title="TYPE"
              rule="Satoshi in four cuts. Each step ships with the cut it is set in."
            />
            <View className="border-t border-outline">
              {TYPE_SCALE.map((step) => (
                <View key={step.name} className="gap-1 border-b border-outline-subtle py-3">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="text-caption text-text-secondary">{step.name}</Text>
                    <Text className="text-caption text-text-muted">{step.spec}</Text>
                  </View>
                  <Text className={`${step.className} text-text-primary`}>Tarpaulin 3×2</Text>
                </View>
              ))}
              <View className="gap-1 border-b border-outline-subtle py-3">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-caption text-text-secondary">Overline</Text>
                  <Text className="text-caption text-text-muted">12 / 16 · Medium · 1.5</Text>
                </View>
                <Text className="text-overline text-text-muted">DELIVERY DETAILS</Text>
              </View>
            </View>
          </View>

          {/* Status */}
          <View className="gap-4">
            <SectionHead
              title="STATUS"
              rule="Icon, label and colour together. The screen still reads in grayscale."
            />
            <View className="flex-row flex-wrap gap-2">
              <StatusChip tone="success" label="Approved" icon="circle-check" />
              <StatusChip tone="warning" label="Needs correction" icon="triangle-alert" />
              <StatusChip tone="error" label="Blocked" icon="circle-x" />
              <StatusChip tone="info" label="Updated 3 min ago" icon="clock" />
              <StatusChip tone="neutral" label="Draft" icon="square-pen" />
            </View>
          </View>

          {/* Action */}
          <View className="gap-4">
            <SectionHead
              title="ACTION"
              rule="One yellow button per screen. This page spends it here."
            />
            <View className="gg-card gap-3">
              <Text className="text-body text-text-secondary">
                Artwork passed preflight. Approve it to send the job to production.
              </Text>
              <PrimaryButton label="Approve & Continue" />
              <SecondaryButton label="Request changes" />
              <SecondaryButton label="Approve & Continue" disabled />
              <Text className="text-caption text-text-muted">
                Disabled controls stay at 38% and keep their label. The disabled example is
                a secondary button, because a second yellow would break the rule above.
              </Text>
            </View>
          </View>

          {/* Structure */}
          <View className="gap-4">
            <SectionHead
              title="STRUCTURE"
              rule="Border first. A shadow only where a border cannot carry the separation."
            />

            <View className="gap-3">
              <View className="gg-card gap-1">
                <Text className="text-h3 text-text-primary">Card</Text>
                <Text className="text-body text-text-secondary">
                  Surface, hairline border, 16 radius. The default container.
                </Text>
              </View>
              <View className="gg-panel gap-1">
                <Text className="text-h3 text-text-primary">Panel</Text>
                <Text className="text-body text-text-secondary">
                  Grouping and inactive states.
                </Text>
              </View>
              <View className="gg-panel-high gap-1">
                <Text className="text-h3 text-text-primary">Panel, elevated</Text>
                <Text className="text-body text-text-secondary">
                  Selected state. Stays lifted off the canvas in Dark.
                </Text>
              </View>
            </View>

            <View className="flex-row justify-between gap-3 pt-1">
              {RADII.map((item) => (
                <View key={item.label} className="flex-1 items-center gap-2">
                  <View
                    className={`h-14 w-full border border-outline bg-surface-variant ${item.className}`}
                  />
                  <Text className="text-caption text-text-primary">{item.label}</Text>
                  <Text className="text-caption text-text-muted">{item.use}</Text>
                </View>
              ))}
            </View>

            <View className="flex-row items-center gap-3 pt-1">
              <View className="h-11 w-11 rounded-sm border border-dashed border-outline" />
              <Text className="shrink text-caption text-text-muted">
                44 × 44 minimum. Every tappable control clears this box, whatever its
                visible size.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
