import { useSession as useClerkSession, useUser } from "@clerk/expo";
import { router } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import { PrivacyPolicyLink } from "@/components/AccountPrivacy";
import { BusyOverlay } from "@/components/BusyOverlay";
import { DangerButton } from "@/components/DangerButton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { PasswordField } from "@/components/controls/PasswordField";
import { TextField } from "@/components/controls/TextField";
import { deletionConfirmMethod, DELETION_SENT } from "@/lib/accountDeletion";
import { useAccountDeletion } from "@/store/accountDeletion";

const BUSY_LABEL = {
  checking: "Checking it is you…",
  sending: "Sending your request…",
  emailing: "Emailing your code…",
} as const;

/**
 * Delete account: what it means, then proof that it is the account holder.
 *
 * Reached only from Danger zone on Your shop details. Nothing leaves the phone
 * until Clerk has re-checked the person on this session — the password for an
 * account that has one, an emailed code for a Google-only account — and only
 * then is `POST /me/account-deletion-request` sent. See
 * `lib/accountDeletion.ts`, shared with the client and rider apps.
 *
 * No yellow on this screen: the one action is a deletion, and it is drawn in
 * the error token like every other action that cannot be taken back.
 */
export default function DeleteAccountScreen() {
  const { user: clerkUser, isLoaded } = useUser();
  const { session } = useClerkSession();
  const method = deletionConfirmMethod(clerkUser);

  const secret = useAccountDeletion((s) => s.secret);
  const codeSent = useAccountDeletion((s) => s.codeSent);
  const destination = useAccountDeletion((s) => s.destination);
  const busy = useAccountDeletion((s) => s.busy);
  const fieldError = useAccountDeletion((s) => s.fieldError);
  const error = useAccountDeletion((s) => s.error);
  const confirmed = useAccountDeletion((s) => s.confirmedAt != null);
  const sent = useAccountDeletion((s) => s.sent);
  const setSecret = useAccountDeletion((s) => s.setSecret);
  const emailCode = useAccountDeletion((s) => s.emailCode);
  const submit = useAccountDeletion((s) => s.submit);

  // Leaving drops what was typed, so the next visit starts a fresh flow.
  useEffect(() => () => useAccountDeletion.getState().reset(), []);

  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? "";

  if (isLoaded && !clerkUser) {
    return (
      <View className="gg-screen">
        <FormScrollView contentClassName="gg-page pb-16 pt-4">
          <EmptyState
            title="Sign-in unavailable"
            body="GRIDGO could not reach the sign-in behind this account, so it cannot confirm it is you. Go back, then open Delete account again."
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        </FormScrollView>
      </View>
    );
  }

  if (sent) {
    return (
      <View className="gg-screen">
        <FormScrollView contentClassName="gg-page pb-16 pt-4">
          <View className="gap-3" accessibilityLiveRegion="polite">
            <Text className="text-h2 text-text-primary" accessibilityRole="header">
              Request sent
            </Text>
            <Text className="text-body-lg text-text-primary">{DELETION_SENT}</Text>
            <Text className="text-body text-text-secondary">
              Operations processes it by hand. Your account stays available while the request
              is reviewed.
            </Text>
          </View>
          <View className="mt-8">
            <SecondaryButton label="Back to your shop details" onPress={() => router.back()} />
          </View>
        </FormScrollView>
      </View>
    );
  }

  const askingForCode = method === "email_code" && !codeSent && !confirmed;

  return (
    <View className="gg-screen">
      <FormScrollView contentClassName="gg-page pb-16 pt-4">
        <View className="gap-3">
          <Text className="text-h2 text-text-primary" accessibilityRole="header">
            Delete your GRIDGO account
          </Text>
          <Text className="text-body text-text-secondary">
            Operations will delete your GRIDGO sign-in and personal data. You will lose access
            across GRIDGO apps, and deletion cannot be undone. Records that must be retained are
            explained in the Privacy Policy.
          </Text>
          <Text className="text-body text-text-secondary">
            This sends a request for manual processing within 30 days. Your account stays
            available while the request is reviewed.
          </Text>
          <PrivacyPolicyLink />
        </View>

        <View className="mt-8 gap-4">
          <Text className="text-overline text-text-muted">CONFIRM IT IS YOU</Text>

          {confirmed ? (
            <Text className="text-body text-text-secondary">
              You have confirmed it is you. Send the request again when this phone is back
              online.
            </Text>
          ) : method === "password" ? (
            <FieldShell
              label="Your password"
              hint="The one you sign in to GRIDGO with. GRIDGO checks it with your sign-in and never stores it."
              error={fieldError}
            >
              <PasswordField
                value={secret}
                onChange={setSecret}
                accessibilityLabel="Your password"
                placeholder="Your password"
                kind="password"
                returnKeyType="go"
                onSubmit={() => void submit(method, session)}
                editable={busy == null}
              />
            </FieldShell>
          ) : askingForCode ? (
            <Text className="text-body text-text-secondary">
              This account signs in with Google, so it has no password. GRIDGO will email a
              6-digit code to {email || "the address you sign in with"} to confirm it is you.
            </Text>
          ) : (
            <View className="gap-3">
              <FieldShell
                label="Code from the email"
                hint={`Sent to ${destination || email || "the address you sign in with"}.`}
                error={fieldError}
              >
                <TextField
                  value={secret}
                  onChange={setSecret}
                  accessibilityLabel="Code from the email"
                  placeholder="6-digit code"
                  kind="code"
                  returnKeyType="go"
                  onSubmit={() => void submit(method, session)}
                  editable={busy == null}
                />
              </FieldShell>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send another code"
                hitSlop={12}
                disabled={busy != null}
                onPress={() => void emailCode(session)}
                className="self-start"
              >
                <Text className="text-caption font-medium text-brand">Send another code</Text>
              </Pressable>
            </View>
          )}
        </View>

        {error ? (
          <View className="mt-6">
            <ErrorNotice message={error} />
          </View>
        ) : null}

        <View className="mt-8 gap-3">
          {askingForCode ? (
            <SecondaryButton
              label={busy === "emailing" ? "Emailing…" : "Email me a code"}
              disabled={busy != null}
              onPress={() => void emailCode(session)}
            />
          ) : (
            <DangerButton
              label={
                busy === "checking"
                  ? "Checking…"
                  : busy === "sending"
                    ? "Sending request…"
                    : confirmed
                      ? "Send the request again"
                      : "Delete my account"
              }
              disabled={busy != null}
              onPress={() => void submit(method, session)}
            />
          )}
          <SecondaryButton
            label="Keep my account"
            disabled={busy != null}
            onPress={() => router.back()}
          />
        </View>
      </FormScrollView>

      <BusyOverlay visible={busy != null} label={busy ? BUSY_LABEL[busy] : ""} />
    </View>
  );
}
