# Supplier Google SSO Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Supplier Google sign-in in Expo Go and route identities without supplier access to clear, role-aware access copy.

**Architecture:** Keep Clerk's browser SSO and the existing session bridge. Add the default callback as an unguarded Expo Router route, activate every returned Clerk session before navigating home, and translate supplier projection authorization failures into access-screen copy through the API error boundary.

**Tech Stack:** See [package.json](../../../package.json) for the current dependencies and [package-lock.json](../../../package-lock.json) for resolved versions.

## Global Constraints

- Do not call `WebBrowser.maybeCompleteAuthSession()` or use `useOAuth`.
- Do not start Expo or drive the phone; the captain performs the phone test.
- Do not print or expose Clerk secrets.
- Do not add libraries or change `gridgo-api`.
- Only a server-written supplier role may open supplier work.

---

### Task 1: Callback and session activation

**Files:**
- Create: `app/sso-callback.tsx`
- Modify: `app/_layout.tsx`, `app/(auth)/login.tsx`, `app/__tests__/login.test.tsx`
- Test: `app/__tests__/ssoCallback.test.tsx`

**Interfaces:**
- Consumes: Clerk `startSSOFlow({ strategy: "oauth_google" })` and `useClerk().setActive`.
- Produces: an unguarded `/sso-callback` route and an activation-before-navigation login path.

- [ ] **Step 1: Write failing callback and activation tests**

  Assert that `/sso-callback` renders “Signing you in…” and replaces to `/`; press the Google button with `createdSessionId: "sess_google"` and assert `setActive({ session: "sess_google" })` precedes `router.replace("/")`.

- [ ] **Step 2: Verify the tests are red**

  Run `npx jest app/__tests__/ssoCallback.test.tsx app/__tests__/login.test.tsx --runInBand` and confirm failures for the missing route and missing activation.

- [ ] **Step 3: Implement the callback and activation**

  Register `sso-callback` before protected groups, render a quiet callback route that replaces to `/`, and await the flow-provided or `useClerk` activation function before replacing from login.

- [ ] **Step 4: Verify the focused tests are green**

  Rerun the focused Jest command and confirm both regression suites pass.

### Task 2: Projection failures become no-account access copy

**Files:**
- Modify: `components/ClerkSessionBridge.tsx`, `lib/apiErrors.ts`
- Test: `components/__tests__/ClerkSessionBridge.test.tsx`

**Interfaces:**
- Consumes: `ApiError.status` inside `lib/apiErrors.ts` only.
- Produces: `supplierProjectionErrorMessage(error)` with explicit 401/403 no-account guidance.

- [ ] **Step 1: Write a failing bridge test**

  Reject `/auth/me` with 401 and 403 and assert the identity remains closed with copy containing “No supplier account”, “apply as a shop”, and “Operations”.

- [ ] **Step 2: Verify the test is red**

  Run `npx jest components/__tests__/ClerkSessionBridge.test.tsx --runInBand` and confirm the existing generic invitation message fails the assertions.

- [ ] **Step 3: Implement the error translation**

  Add the focused helper in `lib/apiErrors.ts` and use it from `ClerkSessionBridge` without exposing status codes or raw API codes to the screen.

- [ ] **Step 4: Verify the focused test is green**

  Rerun the bridge test and confirm both authorization statuses pass.

### Task 3: Full verification and direct PR

**Files:**
- Review: all changed files

**Interfaces:**
- Produces: a committed branch and direct pull request; no merge.

- [ ] **Step 1: Run fresh verification**

  Run focused regressions, `npx tsc --noEmit`, `npm run lint`, and `npm test -- --runInBand` without starting Expo.

- [ ] **Step 2: Review scope and secrets**

  Inspect `git diff --check`, `git diff`, and `git status --short`; verify there are no secret values or unrelated edits.

- [ ] **Step 3: Commit and publish**

  Commit on `fm/gridgo-supplier-sso-wrong-app`, push only that branch, open a ready direct PR with `gh-axi`, and append the PR URL to the firstmate status file.
