import * as Clipboard from "expo-clipboard";
import { QrCode } from "lucide-react-native";
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { router } from "expo-router";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SheetSurface } from "@/components/SheetSurface";
import { useShopMoney } from "@/hooks/useShopMoney";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/money";
import { whenLabel } from "@/lib/shopMoney";

/**
 * Pay GRIDGO (gridgo-api `docs/SHOP_MONEY_API.md`): GRIDGO's QR Ph, the amount
 * and the reference to put on the transfer, and the deadline.
 *
 * There is no payment provider behind this: the QR is GRIDGO's static one, so
 * the shop types the amount and the reference in its own banking app, and the
 * GRIDGO team checks the money arrived before confirming it. Nothing here says
 * it is confirmed automatically, and nothing reopens the shop on a tap — the
 * read after confirmation does that.
 *
 * The sheet reads the request itself rather than being handed one, so an
 * amount GRIDGO has since lowered (recovered from a payout) is the one shown.
 */
export default function PayGridgoSheet() {
  const colors = useThemeColors();
  const { read } = useShopMoney("week");
  const [copied, setCopied] = useState(false);
  const pay = read?.payGridgo ?? null;

  if (!read) {
    return (
      <SheetSurface
        title="Pay GRIDGO"
        body="Reading what you owe…"
        footer={<SecondaryButton label="Close" onPress={() => router.back()} />}
      />
    );
  }

  if (!pay) {
    return (
      <SheetSurface
        title="Nothing to pay"
        body="You do not owe GRIDGO anything right now."
        footer={<SecondaryButton label="Close" onPress={() => router.back()} />}
      />
    );
  }

  const qr = api.notificationImageUrl(pay.qrImageUrl);
  const deadline = whenLabel(pay.deadlineAt);
  const copy = async () => {
    await Clipboard.setStringAsync(pay.reference);
    setCopied(true);
  };

  return (
    <SheetSurface
      title={`Pay GRIDGO ${formatPhp(pay.amountMinor)}`}
      body={
        read.balances.paused
          ? "New orders are paused until the GRIDGO team confirms this payment. Jobs you already accepted can still be finished."
          : deadline
            ? `Due ${deadline}. Unpaid by then, new orders pause until it is paid.`
            : undefined
      }
      footer={
        <>
          <PrimaryButton
            label={copied ? "Reference copied" : "Copy reference"}
            onPress={() => void copy()}
            testID="pay-gridgo-copy"
          />
          <SecondaryButton label="Close" onPress={() => router.back()} />
        </>
      }
    >
      <View className="gap-4" testID="pay-gridgo-sheet">
        <View className="items-center gap-2">
          {qr ? (
            <View className="rounded-card border border-outline bg-paper p-3">
              <Image
                source={{ uri: qr }}
                style={{ width: 200, height: 200 }}
                resizeMode="contain"
                accessibilityLabel="GRIDGO's QR Ph code"
              />
            </View>
          ) : (
            <View className="h-48 w-48 items-center justify-center rounded-card bg-surface-variant">
              <QrCode size={32} color={colors.textMuted} strokeWidth={1.75} aria-hidden />
              <Text className="mt-2 px-4 text-center text-caption text-text-muted">
                Ask the GRIDGO team in chat for the QR.
              </Text>
            </View>
          )}
          <Text className="text-caption text-text-muted">GRIDGO · QR Ph</Text>
        </View>

        <View className="gg-panel gap-3">
          <Row label="Amount" value={formatPhp(pay.amountMinor)} testID="pay-gridgo-amount" />
          <View className="gg-divider" />
          <Row label="Reference" value={pay.reference} testID="pay-gridgo-reference" />
        </View>

        <Text className="text-body text-text-secondary">
          Scan with your banking app, enter this amount, and put the reference in the note. The
          GRIDGO team checks the payment arrived and confirms it
          {read.balances.paused ? "; new orders reopen then." : "."}
        </Text>
      </View>
    </SheetSurface>
  );
}

function Row({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3" testID={testID}>
      <Text className="text-body text-text-muted">{label}</Text>
      <Text
        className="min-w-0 flex-1 text-right text-body-lg font-medium text-text-primary"
        selectable
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
    </View>
  );
}
