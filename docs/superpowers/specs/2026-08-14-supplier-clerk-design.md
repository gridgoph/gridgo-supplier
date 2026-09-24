# Supplier Clerk Design

## Purpose

Add Clerk identity to GRIDGO Supplier while keeping `gridgo-api` as the domain and authorization boundary. Public application and invitation entry points follow [PRD.md](../../../PRD.md#onboarding-path-deck); the app never writes Clerk role metadata.

The supplied visual contract and architecture report are the approved product design for this work. No open product decision remains.

## Access model

- One shared Clerk application serves the GRIDGO fleet.
- The bridge requests `/auth/me` with a Clerk JWT and `X-GRIDGO-Role: supplier`, including when primary-role metadata names another role. Metadata alone cannot reject a supplier membership.
- `lib/api.ts` projects supplier access when `/auth/me` includes a supplier membership and takes accreditation status from the supplier approval case when available; otherwise it uses the returned user projection. `store/session.ts` accepts only the supplier role.
- An unmapped identity enters public apply. A non-supplier projection or a forbidden supplier projection stays behind the access guard. An expired/invalid session retries once with a cache-bypassing Clerk token, then opens Sign in with the session-ended message if still unauthenticated.
- Invitation metadata is server-written. Invitation acceptance consumes a Clerk `__clerk_ticket`; public enrollment follows the separate contract in [AGENTS.md](../../../AGENTS.md#mvp-stack-current-phase).
- Google may create or authenticate a Clerk identity, but it never grants supplier membership by itself.
- `gridgo-api` remains authoritative for the supplier projection, accreditation, ownership, and every domain write.

## Session architecture

`ClerkProvider` wraps the existing root shell with Clerk's SecureStore-backed `tokenCache`. A small bridge reads Clerk auth and user resources, reads metadata for error handling, registers an async token provider with `lib/api.ts`, and fetches `/auth/me` before adopting the server-projected user into Zustand.

The API layer asks the Clerk token provider for a token for each request; `lib/api.ts` owns the single silent refresh/retry after a 401. `store/session.ts` owns session expiry and `components/ClerkSessionBridge.tsx` prevents stale Clerk updates from turning expiry into an access error. File uploads and SSE connection setup use the same async token path. The old in-memory bearer remains for the development-only local demo login. Signing out sends the device token to `gridgo-api`, signs out Clerk when Clerk owns the session, clears both token paths, and returns push registration to the unclaimed state.

The route guards and pending-shop access are documented in [AGENTS.md](../../../AGENTS.md#mvp-stack-current-phase) and implemented in `app/_layout.tsx`. The navigator remounts on account changes, preserving drafts across approval changes for the same account.

## Screens and visual language

- Welcome and public application follow [PRD.md](../../../PRD.md#onboarding-path-deck).
- Sign in: “Welcome Back.” / “Let’s sign in,” existing 12pt field geometry, password reveal, recover-password link, one yellow Sign in action, divider, Google button, and invitation guidance. The legacy local demo is a separate `__DEV__`-only action.
- Accept invitation: ticket-gated name and password form. Without a ticket it explains that the shop must open the emailed invitation link and ask Operations to invite the intended email.
- Access screen: explains a role mismatch or projection failure without exposing raw role strings. It never writes metadata and offers sign-out; unassigned identities use apply instead.
- Light and Dark use the existing GRIDGO tokens, Satoshi, labels, controls, and spacing.

The signature element is the supplier storefront illustration: it is the one expressive surface, while auth forms remain quiet and operational. This is specific to a shop opening its production floor, not a generic account welcome.

## Errors and incomplete flows

- Clerk field errors are presented beside their fields; cancellations from Google are silent.
- Invitation expiry or invalidity stays on the invitation screen with a plain Operations recovery instruction.
- If Clerk authenticates but the API cannot project a supplier, the access screen fails closed and exposes no domain content.
- The app never prints Clerk errors, metadata, tokens, or infrastructure details to a release screen.

## Validation

- Unit tests cover metadata classification, membership projection, publishable-key enforcement, async token selection, and Clerk session adoption. `components/__tests__/ClerkSessionBridge.test.tsx` covers supplier membership despite mismatched primary-role metadata.
- Screen tests cover sign-in, invitation-without-ticket, invitation acceptance, and mismatch copy.
- Existing session, push/logout, navigation, keyboard-surface, release-config, and development-credential tests remain green.
- Run `npx tsc --noEmit`, `npm run lint`, the full Jest suite, Expo Android/iOS/web exports, and production-bundle secret/key scans.

