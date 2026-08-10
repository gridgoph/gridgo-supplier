import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { CategoryRankList } from "@/components/CategoryRankList";
import { ErrorNotice } from "@/components/ErrorNotice";
import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { OptionList } from "@/components/controls/OptionList";
import { TextField } from "@/components/controls/TextField";
import { DAVAO_AREAS } from "@/data/davaoAreas";
import { PUBLISHED_CATALOG } from "@/data/serviceCatalog";
import {
  EMPTY_SIGNUP_FORM,
  hasErrors,
  promoteCategory,
  toggleCategory,
  toSignupRequest,
  validateSignup,
  type SignupForm,
} from "@/lib/signup";
import { useSession } from "@/store/session";

/**
 * Opening a shop account.
 *
 * A shop tells GRIDGO who it is, where it prints from, and what it does — best
 * first, because that ranking is what GRIDGO matches on. Nothing here promises
 * work: the account arrives unaccredited and the screen after this one says so
 * rather than dropping the shop onto an empty floor.
 *
 * The categories come from the app's own copy of GRIDGO's published chart,
 * because the live vocabulary is behind sign-in and nobody has signed in yet.
 * The platform re-checks every code and is the authority; a category retired
 * since this build shipped comes back as a plain-language error on the field.
 */
export default function SignupScreen() {
  const { signup, loading, error, clearError } = useSession();
  const [form, setForm] = useState<SignupForm>(EMPTY_SIGNUP_FORM);
  const [showErrors, setShowErrors] = useState(false);

  const errors = validateSignup(form);
  const patch = (next: Partial<SignupForm>) => {
    clearError();
    setForm((current) => ({ ...current, ...next }));
  };

  async function submit() {
    if (hasErrors(errors)) {
      setShowErrors(true);
      return;
    }
    const request = toSignupRequest(form);
    if (!request) {
      setShowErrors(true);
      return;
    }
    const created = await signup(request);
    // The root guard swaps the signed-in area in on its own once the account
    // lands, so there is nothing to navigate to on success.
    if (!created) setShowErrors(true);
  }

  const show = (field: keyof SignupForm) => (showErrors ? (errors[field] ?? null) : null);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      // Only iOS needs this: Android resizes the window for the keyboard itself
      // (`adjustResize` under edge-to-edge), and padding on top of that would
      // push the fields twice as far. Same behaviour, one platform's work.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="gg-screen">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gg-page pb-16 pt-12"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <GridgoLogo size={44} role="supplier" />

          <View className="mt-8 gap-2">
            <Text className="text-h1 text-text-primary">Open a shop account</Text>
            <Text className="text-body-lg text-text-secondary">
              Tell GRIDGO what your shop prints and where it prints from. Operations checks the
              details before any work reaches you.
            </Text>
          </View>

          <View className="mt-8 gap-6">
            <FieldShell label="Shop name" error={show("shopName")}>
              <TextField
                value={form.shopName}
                onChange={(shopName) => patch({ shopName })}
                kind="name"
                placeholder="PrintRight Davao"
                accessibilityLabel="Shop name"
              />
            </FieldShell>

            <FieldShell
              label="Your name"
              hint="Who GRIDGO calls when a job needs a decision."
              error={show("contactName")}
            >
              <TextField
                value={form.contactName}
                onChange={(contactName) => patch({ contactName })}
                kind="name"
                placeholder="Ben Santos"
                accessibilityLabel="Your name"
              />
            </FieldShell>

            <FieldShell label="Email" error={show("email")}>
              <TextField
                value={form.email}
                onChange={(email) => patch({ email })}
                kind="email"
                placeholder="you@yourshop.ph"
                accessibilityLabel="Email"
              />
            </FieldShell>

            <FieldShell
              label="Mobile number"
              hint="The rider collecting from you gets this number."
              error={show("phone")}
            >
              <TextField
                value={form.phone}
                onChange={(phone) => patch({ phone })}
                kind="phone"
                placeholder="0917 123 4567"
                accessibilityLabel="Mobile number"
              />
            </FieldShell>

            <FieldShell
              label="Password"
              hint="At least 8 characters."
              error={show("password")}
            >
              <TextField
                value={form.password}
                onChange={(password) => patch({ password })}
                kind="new-password"
                placeholder="Choose a password"
                accessibilityLabel="Password"
              />
            </FieldShell>

            <FieldShell
              label="Where your shop is"
              hint="GRIDGO works out the delivery fee from how far your shop is from the client. Operations confirms the exact pin when they check your account."
              error={show("areaCode")}
            >
              <OptionList
                options={DAVAO_AREAS.map((area) => ({ value: area.code, label: area.name }))}
                value={form.areaCode}
                onChange={(areaCode) => patch({ areaCode })}
                accessibilityLabel="Part of Davao your shop works out of"
              />
            </FieldShell>

            <FieldShell label="Street address" error={show("streetAddress")}>
              <TextField
                value={form.streetAddress}
                onChange={(streetAddress) => patch({ streetAddress })}
                placeholder="C.M. Recto St"
                accessibilityLabel="Street address"
              />
            </FieldShell>

            <FieldShell
              label="What you print"
              hint="Put what you do best at the top. GRIDGO offers you work in this order."
              error={show("categoryCodes")}
            >
              <CategoryRankList
                categories={PUBLISHED_CATALOG.map((category) => ({
                  code: category.code,
                  name: category.name,
                  bestFor: category.audience,
                }))}
                value={form.categoryCodes}
                onToggle={(code) =>
                  patch({ categoryCodes: toggleCategory(form.categoryCodes, code) })
                }
                onPromote={(code) =>
                  patch({ categoryCodes: promoteCategory(form.categoryCodes, code) })
                }
              />
            </FieldShell>
          </View>

          {error ? (
            <View className="mt-6">
              <ErrorNotice message={error} />
            </View>
          ) : null}

          <View className="mt-8 gap-3">
            <PrimaryButton
              label={loading ? "Opening your account…" : "Open my shop account"}
              disabled={loading}
              onPress={() => void submit()}
            />
            <SecondaryButton
              label="I already have an account"
              disabled={loading}
              onPress={() => router.back()}
            />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
