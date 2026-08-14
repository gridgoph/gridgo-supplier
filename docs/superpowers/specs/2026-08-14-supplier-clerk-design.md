# Supplier Clerk Design

## Purpose

Add Clerk identity to GRIDGO Supplier while keeping `gridgo-api` as the domain and authorization boundary. Supplier identity is invitation-first: no public route, button, or request assigns the `supplier` role.

The supplied visual contract and architecture report are the approved product design for this work. No open product decision remains.

## Access model

- One shared Clerk application serves the GRIDGO fleet.
- This binary accepts only `publicMetadata.gridgoRole === "supplier"`.
- Missing metadata is unassigned access. Any other allowed role is a role mismatch. Neither state hydrates the supplier domain session or exposes protected routes.
- Invitation metadata is server-written. The app accepts only a Clerk `__clerk_ticket`; it never submits a requested role.
- Google may create or authenticate a Clerk identity, but it never grants supplier access. An uninvited identity reaches the access screen.
- `gridgo-api` remains authoritative for the supplier projection, accreditation, ownership, and every domain write.

## Session architecture

`ClerkProvider` wraps the existing root shell with Clerk's SecureStore-backed `tokenCache`. A small bridge reads Clerk auth and user resources, classifies the role, registers an async token provider with `lib/api.ts`, and fetches `/auth/me` before adopting the server-projected user into Zustand.

The API layer asks the Clerk token provider for a fresh token for each request. File uploads and SSE connection setup use the same async token path. The old in-memory bearer remains for the development-only local demo login. Signing out sends the device token to `gridgo-api`, signs out Clerk when Clerk owns the session, clears both token paths, and returns push registration to the unclaimed state.

The root route model becomes:

1. Clerk restoring: keep the splash/loading surface.
2. Signed out: welcome, sign-in, recovery, and invitation acceptance routes.
3. Clerk signed in without supplier access: access screen only.
4. Supplier signed in but not accredited: accreditation and shared settings routes.
5. Accredited supplier: full app.

## Screens and visual language

- Welcome: GRIDGO supplier lockup, the supplied storefront illustration, “Open the shop with GRIDGO,” primary “Accept an invitation,” secondary “Already have an account.”
- Sign in: “Welcome Back.” / “Let’s sign in,” existing 12pt field geometry, password reveal, recover-password link, one yellow Sign in action, divider, Google button, and invitation guidance. The legacy local demo is a separate `__DEV__`-only action.
- Accept invitation: ticket-gated name and password form. Without a ticket it explains that the shop must open the emailed invitation link and ask Operations to invite the intended email.
- Access screen: distinguishes unassigned access from another GRIDGO role without exposing raw role strings. It never writes metadata and offers sign-out.
- Light and Dark use the existing GRIDGO tokens, Satoshi, labels, controls, and spacing.

The signature element is the supplier storefront illustration: it is the one expressive surface, while auth forms remain quiet and operational. This is specific to a shop opening its production floor, not a generic account welcome.

## Errors and incomplete flows

- Clerk field errors are presented beside their fields; cancellations from Google are silent.
- Invitation expiry or invalidity stays on the invitation screen with a plain Operations recovery instruction.
- If Clerk authenticates but the API cannot project a supplier, the access screen fails closed and exposes no domain content.
- The app never prints Clerk errors, metadata, tokens, or infrastructure details to a release screen.

## Validation

- Unit tests cover role classification, publishable-key enforcement, async token selection, Clerk session adoption, and the absence of public supplier creation controls.
- Screen tests cover sign-in, invitation-without-ticket, invitation acceptance, and mismatch copy.
- Existing session, push/logout, navigation, keyboard-surface, release-config, and development-credential tests remain green.
- Run `npx tsc --noEmit`, `npm run lint`, the full Jest suite, Expo Android/iOS/web exports, and production-bundle secret/key scans.

