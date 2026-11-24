import { useUser } from "@clerk/expo";
import { Image } from "expo-image";
import { Stack, router } from "expo-router";
import { BadgeCheck, ImagePlus } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";

import { BusyOverlay } from "@/components/BusyOverlay";
import { ErrorNotice } from "@/components/ErrorNotice";
import { JobTicketCode } from "@/components/JobTicketCode";
import { OnboardingStep } from "@/components/OnboardingStep";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { TextField } from "@/components/controls/TextField";
import { useThemeColors } from "@/hooks/useTheme";
import {
  confirmPhoneCode,
  isVerifiedPhone,
  resendPhoneCode,
  startPhoneConfirm,
  type ClerkPhoneNumber,
  type ClerkPhoneUser,
} from "@/lib/clerkPhone";
import {
  isHomeSignup,
  isManagerSignup,
  missionProgress,
  philippineMobile,
  shopProblems,
  shopValue,
  type ShopFields,
} from "@/lib/guidedSignup";
import { choosePhoto } from "@/lib/pickFile";
import { returnToMissions, useGuidedStepDraft } from "@/hooks/useApplyEntry";
import { useGuidedSignup } from "@/store/guidedSignup";
import { useSignupDraft } from "@/store/signupDraft";

/**
 * Mission 1: your shop (gridgo-supplier#265).
 *
 * The mobile is confirmed here with a texted code because GRIDGO checks it on
 * Clerk's record, not on what was typed: riders and Operations call this
 * number. A manager also names the owner's mobile, which is where the owner's
 * claim link is tied — it grants nothing by itself.
 */
export default function SignupYourShopStep() {
  useGuidedStepDraft();
  const colors = useThemeColors();
  const { user } = useUser();
  const clerkUser = user as unknown as ClerkPhoneUser | null;
  const signup = useGuidedSignup((s) => s.signup);
  const save = useGuidedSignup((s) => s.save);
  const draft = useSignupDraft((s) => s.draft);
  const patch = useSignupDraft((s) => s.patch);
  const manager = isManagerSignup(signup);
  // A home printer's name and photo never reach a client (gridgo-api#412):
  // no logo, and the name is said to be GRIDGO's only.
  const home = isHomeSignup(signup);
  const progress = missionProgress("shop", home);
  const [showProblems, setShowProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeFor, setCodeFor] = useState<ClerkPhoneNumber | null>(null);
  const [code, setCode] = useState("");
  const [confirmedNow, setConfirmedNow] = useState<string | null>(null);
  const prefilled = useRef(false);

  // Resume: what GRIDGO already saved fills the fields once.
  useEffect(() => {
    const saved = signup?.steps.shop;
    if (prefilled.current || !saved) return;
    prefilled.current = true;
    patch({
      shopName: draft.shopName || saved.shopName,
      contactName: draft.contactName || saved.contactName,
      phone: draft.phone || saved.phone,
      ownerPhone: draft.ownerPhone || saved.ownerPhone || "",
    });
  }, [draft.contactName, draft.ownerPhone, draft.phone, draft.shopName, patch, signup]);

  const fields: ShopFields = {
    shopName: draft.shopName,
    contactName: draft.contactName,
    phone: draft.phone,
    ownerPhone: draft.ownerPhone ?? "",
  };
  const mobile = philippineMobile(draft.phone);
  const phoneConfirmed = Boolean(mobile && (confirmedNow === mobile || isVerifiedPhone(clerkUser, mobile)));
  const problems = shopProblems(fields, { manager, phoneConfirmed, home });
  const problem = (field: keyof ShopFields) => (showProblems ? (problems[field] ?? null) : null);

  async function sendCode() {
    setError(null);
    if (!mobile || !clerkUser) {
      setShowProblems(true);
      return;
    }
    setBusy(true);
    const started = await startPhoneConfirm(clerkUser, mobile);
    setBusy(false);
    if (started.status === "verified") setConfirmedNow(mobile);
    else if (started.status === "code_sent") {
      setCode("");
      setCodeFor(started.phone);
    } else setError(started.message);
  }

  async function confirm() {
    if (!codeFor || !clerkUser || code.replace(/\D/g, "").length < 6) return;
    setBusy(true);
    const problem = await confirmPhoneCode(clerkUser, codeFor, code);
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setConfirmedNow(codeFor.phoneNumber);
    setCodeFor(null);
  }

  async function pickLogo() {
    const picked = await choosePhoto();
    if (picked.ok) patch({ logo: picked.document });
  }

  async function next() {
    setError(null);
    if (Object.keys(problems).length) {
      setShowProblems(true);
      return;
    }
    setBusy(true);
    const result = await save("shop", shopValue(fields, manager));
    setBusy(false);
    if (result.status === "ok") {
      returnToMissions();
      return;
    }
    if (result.status === "enrolled") {
      router.replace("/(auth)/signup/missions");
      return;
    }
    setError(result.status === "failed" ? result.message : "Try again in a moment.");
  }

  if (codeFor) {
    return (
      <OnboardingStep progress={progress} title="Enter the code" lede="" contentClassName="gap-6 pb-4 pt-4">
        <JobTicketCode
          title=""
          email={draft.phone.trim()}
          value={code}
          onChange={setCode}
          onVerify={() => void confirm()}
          onResend={() => {
            void resendPhoneCode(codeFor).then(setError);
          }}
          verifyLabel="Confirm number"
          busy={busy}
          error={error}
        />
        <SecondaryButton label="Change the number" onPress={() => setCodeFor(null)} />
      </OnboardingStep>
    );
  }

  return (
    <>
      {home ? <Stack.Screen options={{ title: "About you" }} /> : null}
      <OnboardingStep
        progress={progress}
        title={home ? "About you" : "Your shop"}
        lede={
          home
            ? "Clients never see your name. GRIDGO and your rider call this number."
            : "What clients and riders see, and the number they call."
        }
        contentClassName="gap-6 pb-4 pt-4"
        overlay={<BusyOverlay visible={busy} label="Saving…" />}
        footer={
          <>
            {error ? <ErrorNotice message={error} /> : null}
            <PrimaryButton label="Save" hint="I-save" disabled={busy} onPress={() => void next()} />
          </>
        }
      >
        {home ? null : (
          <Pressable
            onPress={() => void pickLogo()}
            accessibilityRole="button"
            accessibilityLabel={draft.logo ? "Change your shop logo" : "Add your shop logo"}
            className="flex-row items-center gap-3"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-card border border-outline bg-surface-variant">
              {draft.logo ? (
                <Image
                  source={{ uri: draft.logo.uri }}
                  style={{ width: 64, height: 64 }}
                  contentFit="cover"
                />
              ) : (
                <ImagePlus size={24} color={colors.textMuted} aria-hidden />
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-body font-medium text-text-primary">
                {draft.logo ? "Change logo" : "Add your logo"}
              </Text>
              <Text className="text-caption text-text-muted">Optional. You can add it later.</Text>
            </View>
          </Pressable>
        )}

        <FieldShell
          label={home ? "A name for your printing" : "Shop name"}
          hint={home ? "Only GRIDGO sees this. Clients see your barangay." : undefined}
          error={problem("shopName")}
        >
          <TextField
            value={draft.shopName}
            onChange={(shopName) => patch({ shopName })}
            kind="name"
            placeholder={home ? "For example, Night prints" : "Your shop's name"}
            accessibilityLabel={home ? "A name for your printing" : "Shop name"}
          />
        </FieldShell>

        <FieldShell label="Your name" error={problem("contactName")}>
          <TextField
            value={draft.contactName}
            onChange={(contactName) => patch({ contactName })}
            kind="name"
            placeholder="First and last name"
            accessibilityLabel="Your name"
          />
        </FieldShell>

        <FieldShell
          label="Your mobile"
          hint={phoneConfirmed ? undefined : "We text you a code to confirm it."}
          error={problem("phone")}
        >
          <TextField
            value={draft.phone}
            onChange={(phone) => {
              patch({ phone });
              setConfirmedNow(null);
            }}
            kind="phone"
            placeholder="0917 123 4567"
            accessibilityLabel="Your mobile"
          />
        </FieldShell>
        {phoneConfirmed ? (
          <View className="-mt-3 flex-row items-center gap-2" testID="phone-confirmed">
            <BadgeCheck size={18} color={colors.success} aria-hidden />
            <Text className="text-caption font-medium text-success">Number confirmed</Text>
          </View>
        ) : (
          <View className="-mt-3">
            <SecondaryButton
              label="Text me a code"
              disabled={busy || !mobile}
              onPress={() => void sendCode()}
            />
          </View>
        )}

        {manager ? (
          <FieldShell
            label="Owner's mobile"
            hint="Your owner gets a link to claim the shop. It only works with this number."
            error={problem("ownerPhone")}
          >
            <TextField
              value={draft.ownerPhone ?? ""}
              onChange={(ownerPhone) => patch({ ownerPhone })}
              kind="phone"
              placeholder="0917 765 4321"
              accessibilityLabel="Owner's mobile"
            />
          </FieldShell>
        ) : null}
      </OnboardingStep>
    </>
  );
}
