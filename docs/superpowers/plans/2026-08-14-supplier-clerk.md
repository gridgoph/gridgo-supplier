# Supplier Clerk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Clerk authentication to GRIDGO Supplier without writing role metadata client-side or removing the development-only legacy demo path. Current access rules are owned by [Supplier Clerk Design](../specs/2026-08-14-supplier-clerk-design.md#access-model).

**Architecture:** Clerk owns identity and session issuance; `gridgo-api` continues to project the supplier user and authorize every domain operation. A root bridge classifies Clerk metadata, provides fresh Clerk Bearer tokens to the existing API module, and hydrates the existing Zustand session only after `/auth/me` returns a supplier.

**Tech Stack:** See [package.json](../../../package.json) for the current dependencies and [package-lock.json](../../../package-lock.json) for resolved versions.

## Global Constraints

- Follow the versioned Expo documentation requirement in [AGENTS.md](../../../AGENTS.md).
- Use `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`; release runtime requires a `pk_live_` key.
- Never expose, print, bundle, or commit `CLERK_SECRET_KEY`.
- Follow the [membership-based access model](../specs/2026-08-14-supplier-clerk-design.md#access-model) before opening supplier routes.
- Follow the public-enrollment and invitation boundaries linked from the access design; never write Clerk role metadata client-side.
- Keep the local API demo login behind `__DEV__`.
- Reuse existing GRIDGO tokens, Satoshi, form controls, keyboard surface, and route guards.
- Do not add unrelated libraries or production SaaS.

---

### Task 1: Clerk setup and pure access rules

**Files:**
- Modify: `package.json`, `package-lock.json`, `app.json`, `app/_layout.tsx`
- Create: `lib/clerk.ts`, `lib/__tests__/clerk.test.ts`

**Interfaces:**
- Produces `clerkPublishableKey(value, development)`, `clerkAccessFor(metadata)`, and `appForGridgoRole(role)`.
- `clerkAccessFor` returns `supplier`, `unassigned`, or `mismatch` plus a human app label; it never manufactures metadata.

- [ ] Test metadata classification and publishable-key enforcement independently of the API membership decision; follow the [access model](../specs/2026-08-14-supplier-clerk-design.md#access-model) for bridge acceptance.
- [ ] Run `npx jest lib/__tests__/clerk.test.ts --runInBand` and confirm failure because `lib/clerk.ts` does not exist.
- [ ] Install `@clerk/expo`, `expo-secure-store`, and `expo-auth-session` with `npx expo install`; add the Clerk/SecureStore plugins.
- [ ] Implement the minimal pure helpers and rerun the focused test to green.

### Task 2: Fresh-token API bridge

**Files:**
- Modify: `lib/api.ts`, `lib/files.ts`, `lib/alertStream.ts`, `store/session.ts`
- Test: `lib/__tests__/apiAuth.test.ts`, `store/__tests__/sessionGuard.test.ts`

**Interfaces:**
- Produces `api.setTokenProvider(provider)`, `api.getAuthToken()`, and session methods `adoptClerkUser`, `setIdentityState`, `setExternalSignOut`.
- Existing `setToken/getToken` remains the legacy demo-token surface.

- [ ] Write tests proving the provider token wins per request, legacy tokens still work without a provider, clearing the provider restores legacy behavior, and Clerk sign-out is called after API logout.
- [ ] Run the focused tests and confirm expected failures from missing interfaces.
- [ ] Implement async token lookup in ordinary requests, file upload, and SSE setup; add session ownership and external sign-out coordination.
- [ ] Rerun focused API/session tests to green, then run existing push and alert-stream tests.

### Task 3: Clerk session bridge and route states

**Files:**
- Create: `components/ClerkSessionBridge.tsx`, `app/access.tsx`
- Modify: `app/_layout.tsx`, `app/index.tsx`
- Test: `app/__tests__/clerkRoutes.test.tsx`, `store/__tests__/sessionGuard.test.ts`

**Interfaces:**
- Bridge consumes Clerk `useAuth/useUser/useClerk` and produces Zustand identity status and the validated domain user.
- Root consumes only Zustand identity state for protected-route guards.

- [ ] Write tests for loading, signed-out, supplier hydration, unassigned access, mismatch access, and API projection failure.
- [ ] Run focused tests and confirm the bridge/routes fail because the new behavior is absent.
- [ ] Implement the bridge with cancellation-safe effects, fresh-token registration, role classification, `/auth/me`, and Clerk-owned sign-out.
- [ ] Update `Stack.Protected` groups and launch redirects; rerun route/session tests to green.

### Task 4: Invitation-first auth UI

**Files:**
- Create: `app/(auth)/welcome.tsx`, `app/(auth)/accept-invitation.tsx`, `app/(auth)/recover-password.tsx`, `components/GoogleSignInButton.tsx`, `components/AuthDivider.tsx`
- Modify: `app/(auth)/login.tsx`, `app/(auth)/signup/_layout.tsx`, `app/_layout.tsx`
- Copy: `assets/illustrations/storefront-welcome.svg`
- Test: `app/__tests__/login.test.tsx`, `app/__tests__/invitation.test.tsx`, `app/__tests__/keyboardSurfaces.test.ts`

**Interfaces:**
- Sign-in uses current `signIn.password()` and `signIn.finalize()`; Google alone uses `useSSO()` and its required `setActive()` result.
- Invitation acceptance consumes only `__clerk_ticket` through `signUp.create({ strategy: "ticket", ... })` and never sends role metadata. The one-shot call is required because this Clerk instance requires a password and the v4 factor-specific `ticket()` method does not accept one.

- [ ] Write screen tests proving the mockup hierarchy, Google button, recovery link, public application entry, ticket-required invitation behavior, and the development-only legacy action.
- [ ] Run focused screen tests and confirm expected failures.
- [ ] Copy the supplied SVG and update attribution; implement welcome, sign-in, recovery, invitation, Google, and access surfaces with existing primitives.
- [ ] Keep signup routes aligned with the [public application flow](../../../PRD.md#onboarding-path-deck); invitation acceptance is a separate entry.

### Task 5: Release safety, documentation, and full verification

**Files:**
- Modify: `scripts/assert-no-dev-credentials.mjs`, `AGENTS.md`, tests as failures require

**Interfaces:**
- Production scan rejects demo credentials, Clerk test keys, and Clerk secret keys; expects the configured production Clerk origin/key marker.

- [ ] Add a failing script test/export assertion for Clerk test/secret key leakage.
- [ ] Implement the bundle scan and update durable auth guidance in `AGENTS.md`.
- [ ] Run `npx tsc --noEmit`, `npm run lint`, and `npm test -- --runInBand`.
- [ ] Export Android, iOS, and web bundles with a release-form `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`; scan outputs for forbidden secrets/test keys and the expected configured host.
- [ ] Run `clerk doctor --json`, inspect the staged diff, and confirm `.env.local` is ignored.
- [ ] Commit, push `fm/gridgo-supplier-clerk`, open a direct PR with `gh-axi`, and report the PR URL without merging.
