import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Monitor } from "lucide-react-native";

import { ArtworkPanel } from "@/components/ArtworkPanel";
import { ClientChatRow } from "@/components/ClientChatRow";
import { ExpressPrintList } from "@/components/ExpressPrintList";
import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useExpressCard } from "@/hooks/useExpressCard";
import { useJob } from "@/hooks/useJob";
import { useThemeColors } from "@/hooks/useTheme";
import { clientChatHref, clientChatOf, showsClientChat } from "@/lib/clientChat";
import { formatDeadlineTime, shopDueAt } from "@/lib/dates";
import { expressView } from "@/lib/expressOrder";
import { orderReference } from "@/lib/orderReference";
import { expressStage } from "@/lib/todo";
import type { Order } from "@/lib/api";

/**
 * Print it: everything the press needs for an Express job, on one screen
 * (gridgo-supplier#269). Opened from the accepted card's Print button, which
 * is optional — "It's ready" works without it.
 *
 * The PC comes first because that is where most shops print from: the same
 * job is already on the shop's dashboard for anyone signed in with this
 * account. Printing from the phone opens the client's files below.
 */
export default function PrintScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title="Print it"
      subject={job?.title}
      lede={job ? ledeOf(job) : undefined}
      footer={job ? <Footer job={job} reload={reload} /> : null}
    >
      {job ? <PrintBody job={job} /> : null}
    </FlowScreen>
  );
}

function ledeOf(job: Order): string | undefined {
  const ref = orderReference(job.id);
  const due = formatDeadlineTime(shopDueAt(job));
  const who = job.fulfillmentMode === "delivery" ? "Rider" : "Client";
  return [ref ? `#${ref}` : null, due ? `${who} at ${due}` : null].filter(Boolean).join(" · ") || undefined;
}

function PrintBody({ job }: { job: Order }) {
  const colors = useThemeColors();
  const view = expressView(job);
  const chat = clientChatOf(job);

  return (
    <View className="gap-4">
      <View className="gg-panel-high flex-row gap-3" testID="print-on-pc">
        <Monitor size={22} color={colors.textPrimary} strokeWidth={2} aria-hidden />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body-lg font-medium text-text-primary">Easier on your PC</Text>
          <Text className="text-body text-text-secondary">
            Sign in to the GRIDGO shop dashboard on your PC with this account. This job is already
            there, files and all.
          </Text>
        </View>
      </View>

      {view ? <ExpressPrintList view={view} /> : null}

      <View className="gap-2">
        <Text className="text-body font-medium text-text-secondary">Print from this phone</Text>
        <ArtworkPanel order={job} />
      </View>

      {showsClientChat(chat) ? (
        <ClientChatRow orderId={job.id} chat={chat} onPress={() => router.push(clientChatHref(job.id))} />
      ) : null}
    </View>
  );
}

function Footer({ job, reload }: { job: Order; reload: () => Promise<unknown> }) {
  const card = useExpressCard(job, reload);
  if (expressStage(job) !== "working") {
    return <SecondaryButton label="Back to To do" onPress={() => router.navigate("/(tabs)/home")} />;
  }
  return (
    <View className="gap-2">
      {card.error ? (
        <Text className="text-body text-error" accessibilityRole="alert">
          {card.error}
        </Text>
      ) : null}
      <PrimaryButton
        label={card.busy === "ready" ? "Saving…" : "It's ready"}
        hint="Andam na"
        disabled={card.busy != null}
        onPress={async () => {
          if (await card.ready()) router.navigate("/(tabs)/home");
        }}
        testID="print-ready"
      />
    </View>
  );
}
