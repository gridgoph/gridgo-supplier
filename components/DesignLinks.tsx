import * as Clipboard from "expo-clipboard";
import { Box, Check, Copy, ExternalLink, HardDrive, Link2, Palette, Send, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { linkDisplay, linkLabel, type DesignLink, type LinkProvider } from "@/lib/designLink";

/*
  Lucide carries no brand marks, and a borrowed logo would be the one piece of
  somebody else's colour on the screen. Each host gets its own glyph instead,
  always beside the name — the icon helps a shop find the row, the words say
  what it is.
*/
const PROVIDER_ICONS: Record<LinkProvider, LucideIcon> = {
  canva: Palette,
  google_drive: HardDrive,
  dropbox: Box,
  we_transfer: Send,
  other: Link2,
};

type Props = {
  links: DesignLink[];
  /** Name the line each link belongs to, for a job of several items. */
  showItem?: boolean;
};

/** The client's design links, one row each: tap to open, copy beside it. */
export function DesignLinks({ links, showItem = false }: Props) {
  if (!links.length) return null;
  return (
    <View className="gg-card-flush" testID="design-links">
      {links.map((link, index) => (
        <DesignLinkRow key={link.url} link={link} showItem={showItem} first={index === 0} />
      ))}
    </View>
  );
}

function DesignLinkRow({ link, showItem, first }: { link: DesignLink; showItem: boolean; first: boolean }) {
  const colors = useThemeColors();
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const label = linkLabel(link);
  const address = linkDisplay(link.url);
  const Icon = PROVIDER_ICONS[link.provider];

  useEffect(() => () => {
    if (reset.current) clearTimeout(reset.current);
  }, []);

  async function open() {
    setProblem(null);
    try {
      await Linking.openURL(link.url);
    } catch {
      setProblem("This phone could not open the link. Copy it and paste it into your browser.");
    }
  }

  async function copy() {
    setProblem(null);
    try {
      await Clipboard.setStringAsync(link.url);
      setCopied(true);
      if (reset.current) clearTimeout(reset.current);
      reset.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setProblem("The link could not be copied. Open it instead.");
    }
  }

  return (
    <View className={first ? "px-3 py-2" : "border-t border-outline-subtle px-3 py-2"}>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => void open()}
          accessibilityRole="link"
          accessibilityLabel={`${label}${showItem && link.itemName ? ` for ${link.itemName}` : ""}: ${address}`}
          accessibilityHint="Opens the design in your browser"
          className="gg-touch min-w-0 flex-1 flex-row items-center gap-3 rounded-field py-1"
        >
          {({ pressed }) => (
            <>
              <View className="h-10 w-10 items-center justify-center rounded-field bg-surface-variant">
                <Icon size={20} color={colors.textPrimary} strokeWidth={2} />
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                {showItem && link.itemName ? (
                  <Text className="text-caption text-text-muted" numberOfLines={1}>{link.itemName}</Text>
                ) : null}
                <View className="flex-row items-center gap-1.5">
                  <Text className="shrink text-body font-medium text-text-primary" numberOfLines={1}>{label}</Text>
                  <ExternalLink size={14} color={colors.textMuted} strokeWidth={2} />
                </View>
                <Text className="text-caption text-text-secondary" numberOfLines={1} ellipsizeMode="middle">
                  {address}
                </Text>
              </View>
              {pressed ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
            </>
          )}
        </Pressable>
        <Pressable
          onPress={() => void copy()}
          accessibilityRole="button"
          accessibilityLabel={copied ? `${label} copied` : `Copy ${label}`}
          className="gg-btn-secondary w-28 px-3"
        >
          {({ pressed }) => (
            <>
              {copied ? (
                <Check size={16} color={colors.success} strokeWidth={2.5} />
              ) : (
                <Copy size={16} color={colors.textPrimary} strokeWidth={2} />
              )}
              <Text className="text-button text-text-primary">{copied ? "Copied" : "Copy"}</Text>
              {pressed ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
            </>
          )}
        </Pressable>
      </View>
      {problem ? <Text accessibilityRole="alert" className="pt-1 text-caption text-error">{problem}</Text> : null}
    </View>
  );
}
