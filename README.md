# GRIDGO Supplier

The **supplier** mobile app for GRIDGO (Davao City managed-printing marketplace).

Scaffolded from `gridgo-client` with shared design tokens and logo assets, using Expo, Expo Router, and NativeWind. [package.json](package.json) owns the current dependency versions; [package-lock.json](package-lock.json) locks the installed graph.

## Role scope

- Time-sensitive job alerts, accept/decline
- Production status updates and packaging readiness (quality is checked together with the rider at pickup)
- Pickup handoff
- Payout notifications

The mobile app also includes schedule, capacity, accreditation, and the shop’s listing board. See [PRD.md](PRD.md) for product scope and job-evidence behavior.

## Local development

Use Node.js 22.13 or newer, the minimum for [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).

Clerk provides identity; **gridgo-api** provides supplier data and authorization. Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` for your Clerk instance before starting Metro. The local supplier fixture is available only in development builds. Supabase and PayMongo are not app dependencies.

```bash
# terminal 1
cd ../gridgo-api && npm install && npm run dev

# terminal 2
npm install
EXPO_PUBLIC_API_URL=http://127.0.0.1:8787 npm start
```

On a physical device, use your machine's LAN IP instead of `127.0.0.1`.

## Scripts

| Command | Does |
|---|---|
| `npm start` | Metro for Expo Go |
| `npm run start:usb` | Set up Android USB port forwarding and start Metro for the development client |
| `npm run android` / `npm run ios` | Build and run a native development app |
| `npm run lint` | ESLint |
| `npm test` | Jest |

Typecheck: `npx tsc --noEmit`. Script definitions and the Metro port live in [package.json](package.json).

For native push, use an installed development build. Connect an authorized Android device over USB, build with `npm run android`, then use `npm run start:usb` for later Metro sessions. Supply `GOOGLE_SERVICES_JSON` when building with Firebase; see [Push notifications](AGENTS.md#push-notifications) for configuration and Expo Go limitations.

## Update prompt

A release build compares its `versionCode` with the newest GitHub Release at launch and on return to the foreground, and offers the APK when there is a newer one ([lib/appUpdate.ts](lib/appUpdate.ts)). Development builds and Expo Go have no real `versionCode` and skip the check. To see the prompt anyway, pretend to be an old build:

```bash
EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE=1 npm start
```

The override works in development only. Restart Metro with a higher number (for example `2`) to see the one-time "Update completed" note on the next launch.

## Android emulator API URL

From the **Android emulator**, `127.0.0.1` is the emulator itself. Use:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:8787 npm start
```

For a physical device over Wi-Fi, use the host machine’s reachable LAN address. API URL precedence and build-time configuration are documented in [AGENTS.md](AGENTS.md#mvp-stack-current-phase).
