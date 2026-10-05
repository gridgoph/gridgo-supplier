import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { FieldShell } from "@/components/controls/FieldShell";
import { NoteField } from "@/components/controls/NoteField";
import { OptionList } from "@/components/controls/OptionList";
import { TextField } from "@/components/controls/TextField";
import { useBoard } from "@/hooks/useBoard";
import { boardTargets } from "@/lib/listings";
import {
  BOARD_NOT_OPEN_YET,
  loadProductTypeRequests,
  requestProductType,
} from "@/lib/listingsApi";
import {
  PRODUCT_TYPE_DESCRIPTION_MAX,
  PRODUCT_TYPE_NAME_MAX,
  productTypeRequestBlocker,
  REQUEST_STATUS_LABEL,
  type ProductTypeRequest,
} from "@/lib/productTypes";

/**
 * Ask Operations for a product type GRIDGO does not list.
 *
 * Opened from the add-a-listing grid, with whatever the shop searched for
 * already typed. A request names one of the shop's own categories and is only
 * a request: it adds nothing to the shop's accreditation and creates no
 * listing. Once Operations adds the type it appears in the grid like any other.
 */
export default function RequestProductTypeScreen() {
  const params = useLocalSearchParams<{ name?: string }>();
  const { catalog, services, loading, notOpenYet, error, reload } = useBoard({ limit: 1 });
  const targets = useMemo(() => boardTargets(catalog, services), [catalog, services]);

  const [chosenCategory, setCategory] = useState<string | null>(null);
  const [name, setName] = useState(typeof params.name === "string" ? params.name : "");
  const [description, setDescription] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [requests, setRequests] = useState<ProductTypeRequest[]>([]);

  const categoryCode =
    chosenCategory ?? (targets.length === 1 ? targets[0].category.code : null);
  const categoryNames = useMemo(
    () => Object.fromEntries(targets.map((entry) => [entry.category.code, entry.category.name])),
    [targets],
  );
  const blocker = productTypeRequestBlocker({ categoryCode, name, description });

  const loadRequests = useCallback(async () => {
    const result = await loadProductTypeRequests();
    if (result.status === "ok") setRequests(result.value);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadProductTypeRequests();
      if (!cancelled && result.status === "ok") setRequests(result.value);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function send() {
    if (sending) return;
    if (blocker || !categoryCode) {
      setShowErrors(true);
      return;
    }
    setSending(true);
    setSendError(null);
    const result = await requestProductType({ categoryCode, name, description });
    setSending(false);
    if (result.status !== "ok") {
      setSendError(result.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : result.message);
      return;
    }
    setSent(result.value.name);
    setName("");
    setDescription("");
    setShowErrors(false);
    void loadRequests();
  }

  return (
    <FlowScreen
      loading={loading && !catalog}
      error={notOpenYet ? BOARD_NOT_OPEN_YET : !catalog ? error : null}
      onRetry={() => void reload()}
      title="Request a new product type"
      lede="Tell Operations what you make that is not on GRIDGO yet. Once they add it, it appears in the list and you can list it."
      actionError={sendError}
      footer={
        <>
          <PrimaryButton
            label={sending ? "Sending…" : "Send request"}
            disabled={sending}
            onPress={() => void send()}
          />
          <SecondaryButton label="Back to the list" disabled={sending} onPress={() => router.back()} />
        </>
      }
    >
      {sent ? (
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">Request sent for “{sent}”</Text>
          <Text className="text-body text-text-secondary">
            Operations adds it or tells you what they need. You get an alert either way.
          </Text>
        </View>
      ) : null}

      {targets.length > 1 ? (
        <FieldShell
          label="Which of your categories it belongs under"
          error={showErrors && !categoryCode ? blocker : null}
        >
          <OptionList
            options={targets.map((entry) => ({
              value: entry.category.code,
              label: entry.category.name,
            }))}
            value={categoryCode}
            onChange={setCategory}
            accessibilityLabel="Which of your categories it belongs under"
          />
        </FieldShell>
      ) : categoryCode ? (
        <SpecRow label="Category" value={categoryNames[categoryCode] ?? categoryCode} />
      ) : null}

      <FieldShell
        label="Product type"
        hint="The name a client would look for."
        error={showErrors && categoryCode && !name.trim() ? blocker : null}
      >
        <TextField
          value={name}
          onChange={(value) => setName(value.slice(0, PRODUCT_TYPE_NAME_MAX))}
          placeholder="Acrylic keychains"
          accessibilityLabel="Product type"
        />
      </FieldShell>

      <FieldShell
        label="What it is and how you make it"
        hint="Sizes, materials and the machine you use help Operations place it."
        error={showErrors && categoryCode && name.trim() ? blocker : null}
      >
        <NoteField
          value={description}
          onChange={setDescription}
          placeholder="Laser-cut 3 mm acrylic, printed both sides, in-house UV printer."
          accessibilityLabel="What it is and how you make it"
          maxLength={PRODUCT_TYPE_DESCRIPTION_MAX}
        />
      </FieldShell>

      {requests.length ? (
        <View className="gap-3">
          <Text className="text-body font-medium text-text-secondary">Your requests</Text>
          {requests.map((request) => (
            <View key={request.id} className="gg-card gap-2">
              <Text className="text-body font-medium text-text-primary">{request.name}</Text>
              <View className="flex-row">
                <StatusChip
                  tone={
                    request.status === "approved"
                      ? "success"
                      : request.status === "needs_revision"
                        ? "warning"
                        : "info"
                  }
                  icon={
                    request.status === "approved"
                      ? "circle-check"
                      : request.status === "needs_revision"
                        ? "square-pen"
                        : "clock"
                  }
                  label={REQUEST_STATUS_LABEL[request.status]}
                />
              </View>
              {request.status === "needs_revision" && request.reason ? (
                <Text className="text-body text-text-secondary">Reason: {request.reason}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </FlowScreen>
  );
}
