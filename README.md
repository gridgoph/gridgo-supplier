# GRIDGO Supplier

The **supplier** mobile app for GRIDGO (Davao City managed-printing marketplace).

Scaffolded from `gridgo-client` with the same design system, starter template, logo assets, Expo SDK 54, Expo Router, and NativeWind tokens.

## Role scope

- Time-sensitive job alerts, accept/decline
- Production status updates and self-QC evidence
- Pickup handoff
- Payout notifications

The full supplier portal (capacity, detailed work) is a separate Next.js surface — not this binary.

## Shared demo backend

All GRIDGO mobile apps talk to the local **gridgo-api** demo server (not Clerk / Supabase / PayMongo).

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
| `npm start` | Metro for Expo Go (`expo start --go --port 8082`) |
| `npm run android` / `npm run ios` | Platform-targeted |
| `npm run lint` | ESLint |
| `npm test` | Jest |

Typecheck: `npx tsc --noEmit`.

## Android emulator API URL

From the **Android emulator**, `127.0.0.1` is the emulator itself. Use:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:8787 npm start
```

Physical device / Expo Go on phone: use the host LAN IP (e.g. `http://192.168.1.55:8787`).
