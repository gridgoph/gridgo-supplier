import { useState } from "react";
import { router } from "expo-router";

import { OnboardingStep } from "@/components/OnboardingStep";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { TextField } from "@/components/controls/TextField";
import { hasProblems, shopStepProblems, stepAt } from "@/lib/onboardingSteps";
import { useSignupDraft } from "@/store/signupDraft";

/**
 * Step one: who the shop is and how GRIDGO reaches it.
 *
 * The identity first, because it is what a shop owner already knows by heart —
 * nothing here needs looking up, so the flow starts moving before it asks for
 * anything that does.
 */
export default function ShopIdentityStep() {
  const draft = useSignupDraft((s) => s.draft);
  const patch = useSignupDraft((s) => s.patch);
  const [showProblems, setShowProblems] = useState(false);

  const step = stepAt("shop");
  const problems = shopStepProblems(draft);
  const problem = (field: string) => (showProblems ? (problems[field] ?? null) : null);

  function next() {
    if (hasProblems(problems)) {
      setShowProblems(true);
      return;
    }
    router.push("/(auth)/signup/location");
  }

  return (
    <OnboardingStep
      id="shop"
      title={step.title}
      lede={step.lede}
      onBack={() => router.back()}
      backLabel="Back to sign in"
      contentClassName="gap-6 pb-4 pt-4"
      footer={
        <>
          <PrimaryButton label="Continue" onPress={next} />
          <SecondaryButton label="I already have an account" onPress={() => router.back()} />
        </>
      }
    >
      <FieldShell label="Shop name" error={problem("shopName")}>
        <TextField
          value={draft.shopName}
          onChange={(shopName) => patch({ shopName })}
          kind="name"
          placeholder="PrintRight Davao"
          accessibilityLabel="Shop name"
        />
      </FieldShell>

      <FieldShell
        label="Your name"
        hint="Who GRIDGO calls when a job needs a decision."
        error={problem("contactName")}
      >
        <TextField
          value={draft.contactName}
          onChange={(contactName) => patch({ contactName })}
          kind="name"
          placeholder="Ben Santos"
          accessibilityLabel="Your name"
        />
      </FieldShell>

      <FieldShell label="Email" error={problem("email")}>
        <TextField
          value={draft.email}
          onChange={(email) => patch({ email })}
          kind="email"
          placeholder="you@yourshop.ph"
          accessibilityLabel="Email"
        />
      </FieldShell>

      <FieldShell
        label="Mobile number"
        hint="The rider collecting from you gets this number."
        error={problem("phone")}
      >
        <TextField
          value={draft.phone}
          onChange={(phone) => patch({ phone })}
          kind="phone"
          placeholder="0917 123 4567"
          accessibilityLabel="Mobile number"
        />
      </FieldShell>

      <FieldShell
        label="Password"
        hint="At least 8 characters. This is the only thing GRIDGO does not keep while you finish signing up."
        error={problem("password")}
      >
        <TextField
          value={draft.password}
          onChange={(password) => patch({ password })}
          kind="new-password"
          placeholder="Choose a password"
          accessibilityLabel="Password"
          returnKeyType="done"
          onSubmit={next}
        />
      </FieldShell>
    </OnboardingStep>
  );
}
