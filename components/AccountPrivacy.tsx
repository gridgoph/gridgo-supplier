import { router, type Href } from 'expo-router';
import { ExternalLink, ShieldCheck, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { DangerButton } from '@/components/DangerButton';
import { useThemeColors } from '@/hooks/useTheme';
import type { DeletionConfirmMethod } from '@/lib/accountDeletion';

/*
 * Shared verbatim by the client, supplier and rider apps. Keep the three
 * copies identical.
 */

const PRIVACY_URL = 'https://gridgo.talasora.com/privacy';

export const DELETE_ACCOUNT_ROUTE = '/delete-account' as Href;

/** The policy as an inline link, where a form needs it beside its fields. */
export function PrivacyPolicyLink() {
  const [failed, setFailed] = useState(false);
  return <View className="gap-2">
    <Pressable accessibilityRole="link" accessibilityLabel="Privacy Policy" className="gg-touch min-h-11 justify-center" onPress={() => { setFailed(false); void Linking.openURL(PRIVACY_URL).catch(() => setFailed(true)); }}>
      <Text className="text-body font-medium text-text-primary">Privacy Policy</Text>
    </Pressable>
    {failed ? <Text selectable accessibilityRole="alert" className="text-body text-text-secondary">Open {PRIVACY_URL} in your browser.</Text> : null}
  </View>;
}

/**
 * The Privacy Policy, as a button of its own on Account.
 *
 * It used to be a line of text sitting on top of Delete account, and read as
 * that button's caption. Now it is a bordered row with its own mark and a line
 * saying where it goes, and deletion lives under Danger zone on the profile.
 */
export function PrivacyPolicyButton() {
  const colors = useThemeColors();
  const [failed, setFailed] = useState(false);
  return <View className="gap-2">
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Privacy Policy"
      accessibilityHint="Opens GRIDGO's Privacy Policy in your browser"
      className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      onPress={() => { setFailed(false); void Linking.openURL(PRIVACY_URL).catch(() => setFailed(true)); }}
    >
      <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
        <ShieldCheck size={20} color={colors.textPrimary} aria-hidden />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body-lg font-medium text-text-primary">Privacy Policy</Text>
        <Text className="text-caption text-text-muted" numberOfLines={2}>What GRIDGO collects, why, and how long it keeps it</Text>
      </View>
      <ExternalLink size={18} color={colors.textMuted} aria-hidden />
    </Pressable>
    {failed ? <Text selectable accessibilityRole="alert" className="text-body text-text-secondary">Open {PRIVACY_URL} in your browser.</Text> : null}
  </View>;
}

/**
 * The bottom of the profile: the one thing on it that cannot be taken back.
 *
 * Marked in words and an icon as well as colour, so it reads in greyscale. The
 * button only opens the Delete account screen; nothing is sent until the
 * person confirms it is them there.
 */
export function DangerZone({ confirmBy }: { confirmBy: DeletionConfirmMethod }) {
  const colors = useThemeColors();
  return <View className="gap-3">
    <View className="flex-row items-center gap-2">
      <TriangleAlert size={16} color={colors.error} aria-hidden />
      <Text accessibilityRole="header" className="text-overline text-error">DANGER ZONE</Text>
    </View>
    <View className="gap-3 rounded-card border border-error bg-surface p-4">
      <View className="gap-1">
        <Text className="text-body-lg font-bold text-text-primary">Delete account</Text>
        <Text className="text-body text-text-secondary">
          Ask GRIDGO to delete your sign-in and personal data. This cannot be undone.
          {confirmBy === 'password'
            ? ' You will type your password to confirm it is you.'
            : ' You will type a code we email you to confirm it is you.'}
        </Text>
      </View>
      <DangerButton label="Delete account" onPress={() => router.push(DELETE_ACCOUNT_ROUTE)} />
    </View>
  </View>;
}
