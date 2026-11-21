import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DigitBoxes } from "@/components/DigitBoxes";
import { EmptyState } from "@/components/EmptyState";
import { FormScrollView } from "@/components/FormScrollView";
import { ErrorNotice } from "@/components/ErrorNotice";
import { NumberPad } from "@/components/NumberPad";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { TeamFace } from "@/components/team/TeamFace";
import { spacing } from "@/constants/theme";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import type { TeamPerson } from "@/lib/teamRoster";
import { askConfirm } from "@/store/sheets";
import { useSession } from "@/store/session";
import { useShopWorker } from "@/store/shopWorker";

const NOTICE = {
  timed_out: "Your turn ended. Pick yourself again to keep working.",
  locked_elsewhere: "This phone was handed back. Pick who is working now.",
} as const;

/**
 * "Who's working?" — the shop's shared phone between turns.
 *
 * Only the phone-free teammates are here: a person with their own login works
 * on their own phone. Tap your face, type your four digits, and the phone acts
 * as you until someone taps Switch, the app sits away for a while, or GRIDGO's
 * 30 minutes run out. A wrong PIN says so and clears; five in a row block the
 * PIN (and this phone) for 15 minutes, which GRIDGO counts, not this screen.
 *
 * There is no back. The login's own screens come back only through a fresh
 * sign-in, so Sign out is the one other door, and it says that.
 */
export default function WhoIsWorkingScreen() {
  const insets = useSafeAreaInsets();
  const shopName = useShopWorker((s) => s.shopName);
  const notice = useShopWorker((s) => s.notice);
  const select = useShopWorker((s) => s.select);
  const logout = useSession((s) => s.logout);
  const [people, setPeople] = useState<TeamPerson[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setPicked] = useState<TeamPerson | null>(null);
  // A picked person who left the team is not a choice any more.
  const picked = chosen && people?.some((person) => person.key === chosen.key) ? chosen : null;
  const [pin, setPin] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const picker = await api.getWorkingPicker();
      setPeople(picker.people);
      setLoadError(null);
    } catch (error) {
      setLoadError(humanizeApiError(error, offlineMessage("load your team")));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function submit(next: string) {
    if (!picked || busy || next.length !== 4) return;
    setBusy(true);
    setProblem(null);
    const refused = await select(picked.key, next);
    setBusy(false);
    if (refused) {
      setProblem(refused);
      setPin("");
      void load();
    }
  }

  function type(next: string) {
    setProblem(null);
    setPin(next);
    if (next.length === 4) void submit(next);
  }

  async function signOut() {
    const ok = await askConfirm({
      question: "Sign out of this shop phone?",
      consequence:
        "Nobody can pick themselves here until someone signs in again. Signing in again opens the owner's screens.",
      confirmLabel: "Sign out",
      cancelLabel: "Stay on the picker",
      destructive: true,
    });
    if (ok) void logout();
  }

  return (
    <View className="gg-screen">
      <FormScrollView contentClassName="gg-page gap-6 pb-10">
        <View className="gap-1" style={{ paddingTop: insets.top + spacing.md }}>
          <Text className="text-body text-text-secondary" numberOfLines={1}>
            {shopName ? `Shop phone for ${shopName}` : "Shop phone"}
          </Text>
          <Text className="text-h1 text-text-primary" accessibilityRole="header">
            Who&apos;s working?
          </Text>
        </View>

        {notice ? <ErrorNotice message={NOTICE[notice]} announce /> : null}

        {people == null && !loadError ? (
          <View className="flex-row gap-4" accessibilityLabel="Loading your team">
            {[0, 1, 2].map((index) => (
              <View key={index} className="flex-1 items-center gap-2">
                <SkeletonBlock className="h-20 w-20 rounded-pill" />
                <SkeletonBlock className="h-4 w-16" />
              </View>
            ))}
          </View>
        ) : null}

        {loadError && people == null ? (
          <EmptyState
            title="The team list is not reachable"
            body={loadError}
            actionLabel="Try again"
            onAction={() => void load()}
          />
        ) : null}
        {loadError && people ? <ErrorNotice message={loadError} onRetry={() => void load()} /> : null}

        {people && !people.length ? (
          <EmptyState
            title="Nobody uses a PIN here yet"
            body="The owner adds staff with a PIN on the Team screen. Staff with their own phone sign in there."
          />
        ) : null}

        {people && people.length ? (
          <View className="flex-row flex-wrap" accessibilityRole="radiogroup" accessibilityLabel="Pick yourself">
            {people.map((person) => {
              const selected = picked?.key === person.key;
              return (
                <Pressable
                  key={person.key}
                  onPress={() => {
                    setPicked(person);
                    setPin("");
                    setProblem(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={person.name}
                  className="w-1/3 items-center gap-2 py-2"
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                >
                  <TeamFace name={person.name} photoFileId={person.photoFileId} size={80} selected={selected} />
                  <Text
                    className={selected ? "text-body font-bold text-text-primary" : "text-body text-text-primary"}
                    numberOfLines={1}
                  >
                    {person.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {picked ? (
          <View className="gap-4">
            <Text className="text-center text-body-lg font-bold text-text-primary">
              {picked.name}, enter your PIN
            </Text>
            <View className="items-center">
              <View className="w-60">
                <DigitBoxes
                  value={pin}
                  onChange={type}
                  length={4}
                  masked
                  editable={!busy}
                  invalid={problem != null}
                  systemKeyboard={false}
                  autoFocus={false}
                  accessibilityLabel={`${picked.name}'s 4-digit PIN`}
                  testID="worker-pin"
                />
              </View>
            </View>
            {problem ? <ErrorNotice message={problem} announce /> : null}
            <NumberPad
              disabled={busy}
              onDigit={(digit) => type(`${pin}${digit}`.slice(0, 4))}
              onDelete={() => {
                setProblem(null);
                setPin(pin.slice(0, -1));
              }}
            />
          </View>
        ) : people && people.length ? (
          <View className="gap-4">
            {problem ? <ErrorNotice message={problem} announce /> : null}
            <Text className="text-center text-body text-text-secondary">Tap your face to start.</Text>
          </View>
        ) : null}

        <View className="gap-2 pt-4">
          <SecondaryButton label="Sign out of this phone" onPress={() => void signOut()} />
          <Text className="text-center text-caption text-text-muted">
            The owner gets their screens back by signing in again, or on their own phone.
          </Text>
        </View>
      </FormScrollView>
    </View>
  );
}
