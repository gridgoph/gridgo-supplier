import { useUser } from "@clerk/expo";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { BusyOverlay } from "@/components/BusyOverlay";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ShopPortrait } from "@/components/ShopPortrait";
import { SkeletonBlock } from "@/components/Skeleton";
import { FieldShell } from "@/components/controls/FieldShell";
import { TextField } from "@/components/controls/TextField";
import type { SupplierProfile } from "@/lib/api";
import { changeShopPortrait } from "@/lib/clerkIdentity";
import {
  draftFromProfile,
  hasShopDetailChanges,
  loadShopDetails,
  saveShopDetails,
  shopDetailPatch,
  shopDetailProblems,
  SHOP_DETAILS_NOT_OPEN_YET,
  SHOP_DETAILS_STALE,
  type ShopDetailDraft,
  type ShopDetailField,
  type ShopDetailProblems,
} from "@/lib/shopProfile";
import { useSession } from "@/store/session";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The shop's own details, corrected by the shop.
 *
 * Reached by tapping the identity card on Account, because that card is where a
 * wrong shop name is noticed. It opens on the picture rather than on a field:
 * the portrait is the one thing here a client sees, and everything under it is
 * how the shop is described in words.
 *
 * Two owners meet on this screen and the layout says which is which. GRIDGO
 * holds the shop name, the contact person and the number, and those are three
 * fields with one Save. The picture, the sign-in email and the password belong
 * to the account, and none of them is a keystroke — one opens the camera roll
 * and the other two open a screen of their own — so none wears a field's
 * clothing.
 *
 * Nothing is drawn to press until something has actually changed — a disabled
 * yellow button is not a state — and a save carries the version the details
 * were read at, so a change Operations made in the meantime is offered rather
 * than overwritten.
 */
export default function ShopDetailsScreen() {
  const refresh = useSession((s) => s.refresh);
  const sessionUser = useSession((s) => s.user);
  const { user: clerkUser } = useUser();
  const colors = useThemeColors();
  const [portraitBusy, setPortraitBusy] = useState(false);
  const [portraitError, setPortraitError] = useState<string | null>(null);

  const [profile, setProfile] = useState<SupplierProfile | null>(null);
  const [draft, setDraft] = useState<ShopDetailDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [refusals, setRefusals] = useState<ShopDetailProblems>({});
  const [loadProblem, setLoadProblem] = useState<{
    kind: "not_open_yet" | "failed";
    message: string;
  } | null>(null);
  const [saveNotice, setSaveNotice] = useState<{
    message: string;
    reloadable: boolean;
  } | null>(null);

  /**
   * `adoptDraft` is the difference between the two reasons this runs. Coming
   * back to the screen must not swallow what the shop is halfway through
   * typing, so a focus reload keeps the draft; asking for the latest after a
   * conflict is the one case where GRIDGO's values should replace it.
   */
  const load = useCallback(async (adoptDraft: boolean) => {
    setLoading(true);
    const outcome = await loadShopDetails();
    setLoading(false);

    if (outcome.status === "ok") {
      setProfile(outcome.value);
      setDraft((current) =>
        adoptDraft || !current ? draftFromProfile(outcome.value) : current,
      );
      setLoadProblem(null);
      if (adoptDraft) {
        setSaveNotice(null);
        setRefusals({});
        setShowProblems(false);
      }
      return;
    }

    setLoadProblem(
      outcome.status === "not_open_yet"
        ? { kind: "not_open_yet", message: SHOP_DETAILS_NOT_OPEN_YET }
        : {
            kind: "failed",
            message: outcome.status === "failed" ? outcome.message : SHOP_DETAILS_STALE,
          },
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  const problems = draft ? shopDetailProblems(draft) : {};
  const changed = profile && draft ? hasShopDetailChanges(profile, draft) : false;

  /** A refusal from GRIDGO always shows; a typo only after a save is tried. */
  function fieldError(field: ShopDetailField): string | null {
    return refusals[field] ?? (showProblems ? (problems[field] ?? null) : null);
  }

  function edit(patch: Partial<ShopDetailDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    // A refusal was about what was on screen a moment ago. The stale notice
    // stays, because editing does not resolve a change somebody else made.
    setRefusals({});
  }

  async function save() {
    if (!profile || !draft) return;

    if (Object.keys(shopDetailProblems(draft)).length) {
      setShowProblems(true);
      return;
    }

    const patch = shopDetailPatch(profile, draft);
    if (!Object.keys(patch).length) return;

    setSaving(true);
    setSaveNotice(null);
    setRefusals({});
    const outcome = await saveShopDetails(profile.version, patch);
    setSaving(false);

    if (outcome.status === "ok") {
      // Adopt the version GRIDGO answered with, so a second save from this
      // screen builds on the record it just wrote rather than the one before.
      setProfile(outcome.value);
      setDraft(draftFromProfile(outcome.value));
      // Account reads the shop's name from the session, so it has to be
      // re-read before this screen closes over it.
      await refresh();
      router.back();
      return;
    }

    if (outcome.status === "stale") {
      setSaveNotice({ message: SHOP_DETAILS_STALE, reloadable: true });
      return;
    }

    if (outcome.status === "not_open_yet") {
      setSaveNotice({ message: SHOP_DETAILS_NOT_OPEN_YET, reloadable: false });
      return;
    }

    if (outcome.field) {
      setRefusals({ [outcome.field]: outcome.message });
      return;
    }

    setSaveNotice({ message: outcome.message, reloadable: false });
  }

  async function changePortrait() {
    if (!clerkUser) return;
    setPortraitBusy(true);
    setPortraitError(null);
    const outcome = await changeShopPortrait(clerkUser);
    setPortraitBusy(false);
    if (outcome.status === "failed") setPortraitError(outcome.message);
  }

  const shopName = draft?.shopName || profile?.shopName || sessionUser?.supplierName || "Your shop";

  return (
    <View className="gg-screen">
      <FormScrollView contentClassName="gg-page pb-16 pt-4">
        {/*
          The picture leads. It is the only thing on this screen a client ever
          looks at, and a round frame is this app's one way of saying "premises
          and people" where every other photograph is a print sample in its
          crop-mark frame.
        */}
        <View className="items-center gap-3">
          <ShopPortrait imageUrl={clerkUser?.imageUrl} shopName={shopName} size={96} />
          {/* Fixed width so the control does not resize under the thumb when
              its label changes to "Saving…" and back. */}
          <View className="w-44">
            <SecondaryButton
              label={
                portraitBusy
                  ? "Saving…"
                  : clerkUser?.hasImage
                    ? "Change photo"
                    : "Add a photo"
              }
              disabled={portraitBusy || !clerkUser}
              onPress={() => void changePortrait()}
            />
          </View>
          <Text className="text-center text-caption text-text-muted">
            Your shopfront, your sign, or the best job on your rack. Not a logo a client cannot
            place.
          </Text>
        </View>

        {portraitError ? (
          <View className="mt-4">
            <ErrorNotice message={portraitError} />
          </View>
        ) : null}

        <View className="mt-8 gap-2">
          <Text className="text-h2 text-text-primary">Name and contact</Text>
          <Text className="text-body text-text-secondary">
            The name clients and riders see on your jobs, and how GRIDGO reaches you when one
            needs a decision.
          </Text>
        </View>

        {loading && !draft ? (
          <View className="mt-8">
            <DetailsSkeleton />
          </View>
        ) : null}

        {/*
          Nothing on screen yet gets the full invitation to act; a screen that
          has already loaded keeps its content and states the failure quietly,
          so a refresh that did not land never takes the details away.
        */}
        {loadProblem && !draft ? (
          <View className="mt-8">
            <EmptyState
              title={
                loadProblem.kind === "not_open_yet"
                  ? "Your shop details are not open yet"
                  : "Your shop details are not reachable"
              }
              body={loadProblem.message}
              actionLabel={loadProblem.kind === "not_open_yet" ? "Check again" : "Try again"}
              onAction={() => void load(true)}
            />
          </View>
        ) : null}

        {loadProblem && draft ? (
          <View className="mt-8">
            <ErrorNotice message={loadProblem.message} onRetry={() => void load(true)} />
          </View>
        ) : null}

        {profile && draft ? (
          <>
            <View className="mt-8 gap-6">
              {/* The kind picks the keyboard, the autofill and the capitalisation. */}
              <FieldShell
                label="Shop name"
                hint="What clients and riders see on every job GRIDGO sends you."
                error={fieldError("shopName")}
              >
                <TextField
                  value={draft.shopName}
                  onChange={(shopName) => edit({ shopName })}
                  kind="name"
                  placeholder="PrintRight Davao"
                  accessibilityLabel="Shop name"
                  editable={!saving}
                />
              </FieldShell>

              <FieldShell
                label="Contact person"
                hint="Who GRIDGO calls when a job needs a decision."
                error={fieldError("contactName")}
              >
                <TextField
                  value={draft.contactName}
                  onChange={(contactName) => edit({ contactName })}
                  kind="name"
                  placeholder="Ben Santos"
                  accessibilityLabel="Contact person"
                  editable={!saving}
                />
              </FieldShell>

              <FieldShell
                label="Mobile number"
                hint="The rider collecting from you gets this number."
                error={fieldError("phone")}
              >
                <TextField
                  value={draft.phone}
                  onChange={(phone) => edit({ phone })}
                  kind="phone"
                  placeholder="0917 123 4567"
                  accessibilityLabel="Mobile number"
                  editable={!saving}
                />
              </FieldShell>

              {/*
                Changed, but not typed here. The address is the GRIDGO sign-in,
                so moving it means proving the new one answers — three steps and
                a code, which is a screen and not a keystroke. Drawing it as a
                field would promise that typing in it does something, and
                drawing it greyed out would say it cannot be changed at all.
                So it is the fact, and under it the way to change it.
              */}
              <View className="gap-2">
                <Text className="text-caption text-text-muted">Email</Text>
                <Pressable
                  onPress={() => router.push("/change-email")}
                  accessibilityRole="button"
                  accessibilityLabel="Change email"
                  accessibilityHint={`Your sign-in is ${profile.email}`}
                  className="gg-touch flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3 py-3"
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                >
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-body text-text-primary" numberOfLines={1}>
                      {profile.email}
                    </Text>
                    <Text className="text-caption text-text-muted">Change email</Text>
                  </View>
                  <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
                </Pressable>
                <Text className="text-caption text-text-muted">
                  This is what you sign in with. Changing it sends a code to the new address
                  first.
                </Text>
              </View>

              {/*
                Same grammar as the email: the fact, and under it the way to
                change it. The value is never the real password — only a mask —
                because this row is a door, not a field.
              */}
              <View className="gap-2">
                <Text className="text-caption text-text-muted">Password</Text>
                <Pressable
                  onPress={() => router.push("/change-password")}
                  accessibilityRole="button"
                  accessibilityLabel="Change password"
                  accessibilityHint="Set a new password for your GRIDGO sign-in"
                  className="gg-touch flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3 py-3"
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                >
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-body text-text-primary" accessibilityElementsHidden>
                      ••••••••
                    </Text>
                    <Text className="text-caption text-text-muted">Change password</Text>
                  </View>
                  <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
                </Pressable>
                <Text className="text-caption text-text-muted">
                  This is what you sign in with. Changing it signs you out of GRIDGO everywhere
                  else.
                </Text>
              </View>
            </View>

            {saveNotice ? (
              <View className="mt-6">
                <ErrorNotice
                  message={saveNotice.message}
                  onRetry={saveNotice.reloadable ? () => void load(true) : undefined}
                  retryLabel="Load the latest"
                />
              </View>
            ) : null}

            <View className="mt-8">
              {changed ? (
                <PrimaryButton
                  label={saving ? "Saving…" : "Save changes"}
                  disabled={saving}
                  onPress={() => void save()}
                />
              ) : (
                // Nothing to save is not worth a dead yellow button.
                <Text className="text-caption text-text-muted">
                  These are the details GRIDGO has for your shop. Change one to save it.
                </Text>
              )}
            </View>
          </>
        ) : null}
      </FormScrollView>

      <BusyOverlay visible={saving} label="Saving your shop details…" />
    </View>
  );
}

/**
 * Placeholders in the shape of the form, so the page does not grow under the
 * thumb when the real fields land.
 */
function DetailsSkeleton() {
  return (
    <View
      className="gap-6"
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your shop details"
    >
      {[0, 1, 2, 3, 4].map((row) => (
        <View key={row} className="gap-2">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-4 w-3/4" />
        </View>
      ))}
    </View>
  );
}
