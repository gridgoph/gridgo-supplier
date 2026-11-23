import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { UploadList } from "@/components/UploadList";
import { FieldShell } from "@/components/controls/FieldShell";
import { NoteField } from "@/components/controls/NoteField";
import { SetupRequestList } from "@/components/templates/SetupRequestList";
import { useFileUpload } from "@/hooks/useFileUpload";
import { storedUploads } from "@/lib/files";
import {
  SETUP_FILE_MAX_BYTES,
  SETUP_FILE_TYPES,
  SETUP_FILES_MAX,
  type SetupRequest,
} from "@/lib/productTemplates";
import { askForSetup, loadSetupRequests } from "@/lib/productTemplatesApi";

/**
 * "Let GRIDGO set it up" (gridgo-supplier#268).
 *
 * For a shop that would rather not type: send a photo of the price list on the
 * wall, a PDF, a voice note, or just a message. The GRIDGO team fills in the
 * products, and each one comes back with "Prices to confirm" — nothing goes
 * live until the shop has checked and confirmed it. The files are private to
 * the shop and the GRIDGO team.
 *
 * Voice notes are picked from the phone's files (a recorder or chat app saves
 * them there), so this app asks for no new permission.
 */
export default function SetupHelpScreen() {
  const upload = useFileUpload("product_setup", { maxBytes: SETUP_FILE_MAX_BYTES });
  const [message, setMessage] = useState("");
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [requests, setRequests] = useState<SetupRequest[]>([]);

  const loadRequests = useCallback(async () => {
    const result = await loadSetupRequests();
    if (result.status === "ok") setRequests(result.value.filter((r) => r.kind === "setup"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSetupRequests().then((result) => {
      if (!cancelled && result.status === "ok") setRequests(result.value.filter((r) => r.kind === "setup"));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const stored = storedUploads(upload.items);
  const room = SETUP_FILES_MAX - upload.items.length;
  const problem =
    upload.busy
      ? "Wait for your files to finish sending."
      : !stored.length && !message.trim()
        ? "Add a photo of your price list, a voice note, or a message."
        : null;

  async function send() {
    if (problem) {
      setTried(true);
      return;
    }
    setSending(true);
    setSendError(null);
    const result = await askForSetup({ message, fileIds: stored.map((item) => item.fileId!) });
    setSending(false);
    if (result.status !== "ok") {
      setSendError(result.status === "failed" ? result.message : "GRIDGO cannot take price lists on this app yet. Message the GRIDGO team instead.");
      return;
    }
    setSent(true);
    setMessage("");
    for (const item of upload.items) upload.remove(item.key);
    setTried(false);
    void loadRequests();
  }

  return (
    <FlowScreen
      loading={false}
      error={null}
      onRetry={() => undefined}
      title="Let GRIDGO set it up"
      lede="Send your price list. The GRIDGO team adds your products and prices, then you check them. Nothing goes live until you confirm."
      actionError={sendError ?? (tried ? problem : null)}
      footer={
        <>
          <PrimaryButton label={sending ? "Sending…" : "Send to GRIDGO"} hint="Ipadala sa GRIDGO" disabled={sending} onPress={() => void send()} />
          {sent ? <SecondaryButton label="Back to products" onPress={() => router.back()} /> : null}
        </>
      }
    >
      {sent ? (
        <View className="gg-panel gap-1" accessibilityLiveRegion="polite" testID="setup-sent">
          <Text className="text-body font-medium text-text-primary">Sent to the GRIDGO team</Text>
          <Text className="text-body text-text-secondary">
            We tell you when your products are ready to check. They stay hidden until you confirm the prices.
          </Text>
        </View>
      ) : null}

      <FieldShell label="Price list" hint="Photos, PDFs or voice notes, up to 10 files of 20 MB each.">
        <View className="gap-2">
          <UploadList
            items={upload.items}
            onRetry={(key) => void upload.retry(key)}
            onRemove={upload.remove}
            emptyHint="A clear photo of the price list on your wall works."
            wording="photo"
          />
          {room > 0 ? (
            <View className="flex-row gap-2">
              <View className="flex-1">
                <SecondaryButton label="Take a photo" onPress={() => void upload.takePhoto()} />
              </View>
              <View className="flex-1">
                <SecondaryButton label="Choose files" onPress={() => void upload.pickDocuments(room, SETUP_FILE_TYPES)} />
              </View>
            </View>
          ) : null}
        </View>
      </FieldShell>

      <FieldShell label="Message" hint="Optional. Anything the price list does not say.">
        <NoteField
          value={message}
          onChange={setMessage}
          placeholder="Tarpaulin ₱18 per sq ft. Same day if before 2 PM."
          accessibilityLabel="Message for the GRIDGO team"
          maxLength={2000}
        />
      </FieldShell>

      <SetupRequestList requests={requests} title="Sent to the GRIDGO team" />
    </FlowScreen>
  );
}
