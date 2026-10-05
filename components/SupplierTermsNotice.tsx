import { Text, View } from "react-native";

import { supplierTerms } from "@/lib/supplierTerms";

/**
 * The supplier terms a shop agrees to by sending its application. Draws
 * nothing while no approved term exists (`lib/supplierTerms.ts`).
 */
export function SupplierTermsNotice({ terms = supplierTerms() }: { terms?: readonly string[] }) {
  if (!terms.length) return null;

  return (
    <View className="gg-panel gap-2">
      <Text className="text-body font-medium text-text-primary">
        What you agree to by sending this
      </Text>
      {terms.map((term) => (
        <Text key={term} className="text-body text-text-secondary">
          {term}
        </Text>
      ))}
    </View>
  );
}
