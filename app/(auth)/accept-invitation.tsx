import { useSignUp } from "@clerk/expo";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { PasswordField } from "@/components/controls/PasswordField";
import { TextField } from "@/components/controls/TextField";
import { clerkErrorMessage } from "@/lib/clerk";

export default function AcceptInvitationScreen() {
  const params = useLocalSearchParams<{ __clerk_ticket?: string | string[] }>();
  const ticket = first(params.__clerk_ticket);
  const { signUp, fetchStatus } = useSignUp();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!ticket) {
    return (
      <View className="gg-screen gg-page justify-center py-16">
        <GridgoLogo size={48} role="supplier" />
        <View className="mt-10 gap-3">
          <Text className="text-h1 text-text-primary">Open your invitation</Text>
          <Text className="text-body-lg text-text-secondary">
            Use the invitation link Operations emailed to this shop. The link is what safely assigns supplier access.
          </Text>
          <Text className="text-body text-text-muted">
            No email yet? Ask Operations to invite the email you want to use for GRIDGO.
          </Text>
        </View>
        <View className="mt-8">
          <SecondaryButton label="Back to welcome" onPress={() => router.replace("/(auth)/welcome")} />
        </View>
      </View>
    );
  }

  async function accept() {
    if (!ticket || !name.trim() || !password) return;
    if (password !== confirmation) {
      setProblem("The two passwords do not match.");
      return;
    }

    const person = splitName(name);
    setBusy(true);
    setProblem(null);
    try {
      // The ticket carries server-written access. No role or metadata is ever
      // accepted from this screen.
      const attempt = await signUp.create({
        strategy: "ticket",
        ticket,
        password,
        firstName: person.firstName,
        ...(person.lastName ? { lastName: person.lastName } : {}),
      });
      if (attempt.error) {
        setProblem(
          clerkErrorMessage(
            attempt.error,
            "This invitation could not be accepted. Ask Operations for a fresh link.",
          ),
        );
        return;
      }
      const completed = await signUp.finalize();
      if (completed.error) {
        setProblem(
          clerkErrorMessage(
            completed.error,
            "GRIDGO could not finish opening this invitation. Ask Operations for a fresh link.",
          ),
        );
        return;
      }
      router.replace("/");
    } catch (error) {
      setProblem(
        clerkErrorMessage(
          error,
          "This invitation could not be accepted. Ask Operations for a fresh link.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gg-screen">
      <FormScrollView fillHeight contentClassName="gg-page grow justify-center pb-10 pt-16">
        <GridgoLogo size={48} role="supplier" />
        <View className="mt-8 gap-2">
          <Text className="text-h1 text-text-primary">Open the shop</Text>
          <Text className="text-body-lg text-text-secondary">
            Finish the invitation Operations sent you. Your email and supplier access already travel with this link.
          </Text>
        </View>

        <View className="mt-8 gap-4">
          <FieldShell label="Your name">
            <TextField
              value={name}
              onChange={setName}
              kind="name"
              placeholder="Ben Santos"
              accessibilityLabel="Your name"
              returnKeyType="next"
            />
          </FieldShell>
          <FieldShell label="Choose a password">
            <PasswordField
              value={password}
              onChange={setPassword}
              kind="new-password"
              placeholder="At least 8 characters"
              accessibilityLabel="Choose a password"
              returnKeyType="next"
            />
          </FieldShell>
          <FieldShell label="Confirm password">
            <PasswordField
              value={confirmation}
              onChange={setConfirmation}
              kind="new-password"
              placeholder="Type it again"
              accessibilityLabel="Confirm password"
              returnKeyType="go"
              onSubmit={() => void accept()}
            />
          </FieldShell>
        </View>

        {problem ? (
          <View className="mt-4">
            <ErrorNotice message={problem} />
          </View>
        ) : null}

        <View nativeID="clerk-captcha" />
        <View className="mt-6 gap-3">
          <PrimaryButton
            label={busy ? "Opening the shop…" : "Accept invitation"}
            disabled={
              busy ||
              fetchStatus === "fetching" ||
              !name.trim() ||
              !password ||
              !confirmation
            }
            onPress={() => void accept()}
          />
          <SecondaryButton label="Back to welcome" onPress={() => router.replace("/(auth)/welcome")} />
        </View>
      </FormScrollView>
    </View>
  );
}

function first(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.trim() || null;
}

export function splitName(value: string): { firstName: string; lastName?: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "";
  return parts.length ? { firstName, lastName: parts.join(" ") } : { firstName };
}
