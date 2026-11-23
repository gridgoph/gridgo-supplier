import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { NoteField } from "@/components/controls/NoteField";
import { TextField } from "@/components/controls/TextField";
import { SetupRequestList } from "@/components/templates/SetupRequestList";
import type { SetupRequest } from "@/lib/productTemplates";
import { askForTemplate, loadSetupRequests } from "@/lib/productTemplatesApi";

/**
 * "Not in the list?" — ask GRIDGO to add a product as a template.
 *
 * About one working day, and the shop is told when it is there. Today's full
 * builder stays one tap away for a shop that cannot wait.
 */
export default function AskTemplateScreen() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [requests, setRequests] = useState<SetupRequest[]>([]);

  const loadRequests = useCallback(async () => {
    const result = await loadSetupRequests();
    if (result.status === "ok") setRequests(result.value.filter((r) => r.kind === "template"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSetupRequests().then((result) => {
      if (!cancelled && result.status === "ok") setRequests(result.value.filter((r) => r.kind === "template"));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const nameProblem = !name.trim() ? "Name the product, the way a client would ask for it." : null;
  const messageProblem = !message.trim() ? "Say a little about it: sizes, paper or material." : null;

  async function send() {
    if (nameProblem || messageProblem) {
      setTried(true);
      return;
    }
    setSending(true);
    setSendError(null);
    const result = await askForTemplate({ name, message });
    setSending(false);
    if (result.status !== "ok") {
      setSendError(result.status === "failed" ? result.message : "GRIDGO cannot take requests on this app yet. Make a custom product instead.");
      return;
    }
    setSent(name.trim());
    setName("");
    setMessage("");
    setTried(false);
    void loadRequests();
  }

  return (
    <FlowScreen
      loading={false}
      error={null}
      onRetry={() => undefined}
      title="Ask GRIDGO to add a product"
      lede="The GRIDGO team adds it to the list, usually within one working day, and tells you. Then you tick it and price it like any other."
      actionError={sendError}
      footer={
        <>
          <PrimaryButton label={sending ? "Sending…" : "Send request"} hint="Ipadala" disabled={sending} onPress={() => void send()} />
          <SecondaryButton label="Make a custom product instead" disabled={sending} onPress={() => router.push("/shop/new")} />
        </>
      }
    >
      {sent ? (
        <View className="gg-panel gap-1" accessibilityLiveRegion="polite" testID="request-sent">
          <Text className="text-body font-medium text-text-primary">Sent: “{sent}”</Text>
          <Text className="text-body text-text-secondary">We tell you when it is in the list.</Text>
        </View>
      ) : null}

      <FieldShell label="Product" hint="The name a client would look for." error={tried ? nameProblem : null}>
        <TextField
          value={name}
          onChange={(value) => setName(value.slice(0, 120))}
          placeholder="Acrylic keychains"
          accessibilityLabel="Product"
        />
      </FieldShell>

      <FieldShell label="About it" hint="Sizes, paper or material, and how you price it." error={tried && !nameProblem ? messageProblem : null}>
        <NoteField
          value={message}
          onChange={setMessage}
          placeholder="5 cm, 3 mm acrylic, printed both sides. Priced per piece."
          accessibilityLabel="About it"
          maxLength={2000}
        />
      </FieldShell>

      <SetupRequestList requests={requests} title="Your requests" />
    </FlowScreen>
  );
}
