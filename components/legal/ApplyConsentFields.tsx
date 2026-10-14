import { Text, View } from "react-native";

import { PrivacyPolicyLink } from "@/components/AccountPrivacy";
import { ErrorNotice } from "@/components/ErrorNotice";
import { SkeletonBlock } from "@/components/Skeleton";
import { CheckboxRow } from "@/components/controls/CheckboxRow";
import { LegalDocumentRow } from "@/components/legal/LegalDocumentRow";
import type { LegalVersion } from "@/lib/api";
import { applyAgreementLabel, type ApplyConsent } from "@/lib/legal";
import type { LegalLibraryStatus } from "@/store/legalLibrary";

type Props = {
  consent: ApplyConsent;
  onChange: (next: ApplyConsent) => void;
  /** Terms, Privacy and the Supplier Agreement, as GRIDGO has them in effect now. */
  documents: LegalVersion[] | null;
  status: LegalLibraryStatus;
  onRetry: () => void;
  /** The send was pressed before the box was ticked. */
  showProblem?: boolean;
  disabled?: boolean;
};

/**
 * What a shop agrees to before GRIDGO opens its account, at the bottom of the
 * apply review.
 *
 * The documents come first, so the box below them agrees to something the
 * shop could see and open — each row is the exact version that will be
 * recorded. The box starts unticked and the send waits for it; the news box is
 * separate, optional, and never stands in the way. An API with no legal
 * library yet gets the old Privacy Policy link and no box: there is nothing to
 * record against.
 */
export function ApplyConsentFields({
  consent,
  onChange,
  documents,
  status,
  onRetry,
  showProblem = false,
  disabled = false,
}: Props) {
  if (status === "unsupported") return <PrivacyPolicyLink />;

  const set = (patch: Partial<ApplyConsent>) => onChange({ ...consent, ...patch });

  return (
    <View className="gap-4">
      <View className="gap-2">
        <Text className="text-h3 text-text-primary" accessibilityRole="header">
          Before you send
        </Text>
        <Text className="text-body text-text-secondary">
          Your shop works with GRIDGO under these. Tap one to read it.
        </Text>
      </View>

      {documents ? (
        <View className="gg-card-flush">
          {documents.map((doc, index) => (
            <LegalDocumentRow key={doc.id} doc={doc} divided={index > 0} />
          ))}
        </View>
      ) : status === "failed" ? (
        <ErrorNotice
          message="GRIDGO's terms did not load, and you need them to apply. Check this phone's connection and try again."
          onRetry={onRetry}
        />
      ) : (
        <View accessibilityLabel="Loading GRIDGO's terms" className="gap-2">
          <SkeletonBlock className="h-56 w-full rounded-card" />
        </View>
      )}

      <View className="gap-1">
        <CheckboxRow
          checked={consent.agreed}
          onChange={(agreed) => set({ agreed })}
          disabled={disabled || !documents}
          label={applyAgreementLabel(documents)}
          hint={
            showProblem && !consent.agreed ? (
              <Text className="text-caption text-error" accessibilityRole="alert">
                Tick this to send your application.
              </Text>
            ) : (
              "Required. GRIDGO records which versions you agreed to, and when."
            )
          }
        />
        <CheckboxRow
          checked={consent.marketing}
          onChange={(marketing) => set({ marketing })}
          disabled={disabled}
          label="Send me GRIDGO news and offers for shops"
          hint="Optional. Leave it unticked and nothing changes about your application."
        />
      </View>
    </View>
  );
}
