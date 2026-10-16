import { router, useLocalSearchParams } from "expo-router";
import { CircleCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { NoteField } from "@/components/controls/NoteField";
import { useThemeColors } from "@/hooks/useTheme";
import { legalDate, openRequestOf, PRIVACY_KINDS } from "@/lib/legal";
import { usePrivacyRequests } from "@/store/privacyRequests";

const MAX_DETAILS = 4000;

/**
 * See my data / Correct my data: what will happen, an optional (or, for a
 * correction, needed) note, and one send.
 *
 * Deletion is not here: it goes through Delete account, which checks it is
 * the account holder before anything is sent.
 */
export default function PrivacyRequestScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = params.kind === "correction" ? "correction" : "access";
  const copy = PRIVACY_KINDS[kind];

  const sending = usePrivacyRequests((state) => state.sending);
  const error = usePrivacyRequests((state) => state.error);
  const sent = usePrivacyRequests((state) => state.sent);
  const requests = usePrivacyRequests((state) => state.requests);
  const [details, setDetails] = useState("");
  const [showProblem, setShowProblem] = useState(false);

  useEffect(() => {
    usePrivacyRequests.getState().clearSend();
    return () => usePrivacyRequests.getState().clearSend();
  }, []);

  const open = openRequestOf(requests, kind);
  const missingDetails = copy.detailsRequired && !details.trim();

  function send() {
    if (missingDetails) {
      setShowProblem(true);
      return;
    }
    void usePrivacyRequests.getState().send(kind, details);
  }

  if (sent) {
    const due = legalDate(sent.dueAt);
    return (
      <View className="gg-screen">
        <FormScrollView contentClassName="gg-page gap-6 pb-16 pt-4">
          <View className="gap-3" accessibilityLiveRegion="polite">
            <CircleCheck size={32} color={colors.success} aria-hidden />
            <Text className="text-h2 text-text-primary" accessibilityRole="header">
              Request sent
            </Text>
            <Text className="text-body-lg text-text-primary">
              {due ? `GRIDGO will answer by ${due}.` : "GRIDGO will answer as soon as it can."}
            </Text>
            <Text className="text-body text-text-secondary">
              Operations check it is you first, so they may contact you on your sign-in email or
              your shop&apos;s number. You can follow it on Your data.
            </Text>
          </View>
          <SecondaryButton label="Back to Your data" onPress={() => router.back()} />
        </FormScrollView>
      </View>
    );
  }

  return (
    <View className="gg-screen">
      <FormScrollView contentClassName="gg-page gap-6 pb-16 pt-4">
        <View className="gap-3">
          <Text className="text-h2 text-text-primary" accessibilityRole="header">
            {copy.title}
          </Text>
          <Text className="text-body-lg text-text-secondary">{copy.explain}</Text>
        </View>

        {open ? (
          <View className="gg-panel gap-1">
            <Text className="text-body font-medium text-text-primary">
              You already asked on {legalDate(open.requestedAt) ?? "an earlier day"}
            </Text>
            <Text className="text-body text-text-secondary">
              That request is still open
              {legalDate(open.dueAt) ? `, due by ${legalDate(open.dueAt)}` : ""}. Send another
              only if you have something to add.
            </Text>
          </View>
        ) : null}

        <FieldShell
          label={copy.detailsLabel}
          error={showProblem && missingDetails ? "Say what is wrong, so Operations can fix it." : null}
        >
          <NoteField
            value={details}
            onChange={setDetails}
            accessibilityLabel={copy.detailsLabel}
            placeholder={copy.detailsPlaceholder}
            maxLength={MAX_DETAILS}
          />
        </FieldShell>

        {error ? <ErrorNotice message={error} /> : null}

        <View className="gap-3">
          <PrimaryButton
            label={sending ? "Sending…" : "Send request"}
            disabled={sending}
            onPress={send}
          />
          <SecondaryButton label="Cancel" disabled={sending} onPress={() => router.back()} />
        </View>
      </FormScrollView>
    </View>
  );
}
