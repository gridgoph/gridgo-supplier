import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";

import { ExpressOffer } from "@/components/express/ExpressOffer";
import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { CheckboxRow } from "@/components/controls/CheckboxRow";
import * as api from "@/lib/api";
import { acceptWindow } from "@/lib/acceptWindow";
import { apiErrorCode, humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { expressView } from "@/lib/expressOrder";
import { hasSpecialInstructions } from "@/lib/orderChanges";

type Props = {
  job: api.Order;
  reload: () => Promise<unknown>;
  /** Staff accept for the shop; the price is the Owner's. */
  staff: boolean;
};

/**
 * Accepting an Express order: the offer as the shop will print it, and two
 * answers. Nothing to quote — the page rate is GRIDGO's, and the client has
 * paid. The client's notes already sit under their files in the print list;
 * the tick appears only when there are some, because GRIDGO refuses the
 * acceptance without it.
 */
export function ExpressAcceptFlow({ job, reload, staff }: Props) {
  const view = expressView(job);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const onExpire = useCallback(() => setTimedOut(true), []);
  const needsTick = hasSpecialInstructions(job);
  const expired = timedOut || acceptWindow(job).kind === "expired";

  async function accept() {
    if (needsTick && !read) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.acceptExpress(job.id, needsTick);
      router.back();
    } catch (e) {
      if (apiErrorCode(e) === "shop_acceptance_expired") setTimedOut(true);
      else {
        setError(humanizeApiError(e, offlineMessage("accept this job")));
        void reload();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen
      loading={false}
      error={null}
      onRetry={() => void reload()}
      title="New Express job"
      subject={job.title}
      actionError={error}
      footer={
        expired ? (
          <PrimaryButton label="Back to To do" onPress={() => router.navigate("/(tabs)/home")} />
        ) : (
          <>
            <PrimaryButton label={busy ? "Accepting…" : "Accept"} hint="Dawata" disabled={busy} onPress={() => void accept()} />
            <SecondaryButton
              label="Can't do it"
              disabled={busy}
              onPress={() => router.replace({ pathname: "/job/[id]/decline", params: { id: job.id } })}
            />
          </>
        )
      }
    >
      {view ? <ExpressOffer order={job} view={view} hideEarnings={staff} onExpire={onExpire} /> : null}
      {expired ? (
        <Text className="text-body text-text-secondary" testID="express-expired">
          Time&apos;s up. GRIDGO sent it to the next shop.
        </Text>
      ) : needsTick ? (
        <View className="gap-2">
          <CheckboxRow
            checked={read}
            onChange={(next) => {
              setRead(next);
              setError(null);
            }}
            label="I've read the notes"
          />
          {showErrors && !read ? (
            <Text className="text-body text-error" accessibilityRole="alert">
              Tick that you read the notes to accept.
            </Text>
          ) : null}
        </View>
      ) : null}
    </FlowScreen>
  );
}
