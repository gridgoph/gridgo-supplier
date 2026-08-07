# GRIDGO Supplier — PRD (MVP)

**Supplier mobile** for print manufacturers (apparel/sublimation, signage, tarpaulin, upholstery, etc.). Time-sensitive actions; full portal is separate web.

## Sources

- Tinker PRD (supplier role)
- **Supplier presentation 2026-08-04** (primary narrative for this surface)
- Captain MVP: custom auth + local API

## Job to be done

Join GRIDGO’s B2B marketplace and receive orders from businesses/schools/networks without needing your own sales app — accept work, produce, self-QC, hand off to rider, see payout status.

## Presentation benefits → product features

| Benefit (deck) | MVP feature |
|---|---|
| Client acquisition | Assignment inbox of GRIDGO-matched jobs |
| Guaranteed payout | Payout status from demo ledger (real escrow later) |
| QA & centralized communication | Single job timeline / notes (no Messenger chaos) |
| Inventory management | Schedule + capacity placeholders; full tracker later |

## Onboarding path (deck)

1. Apply as GRIDGO supplier  
2–3. Get accredited and list shop  
4. Start receiving GRIDGO orders  

MVP skips full accreditation UI; demo supplier is pre-seeded.

## MVP screens

| Screen | Purpose |
|---|---|
| Login | Custom auth; role must be `supplier` |
| Home | Pending accept + in-production counts |
| Jobs | Accept/decline, start production, self-QC, ready for pickup |
| Schedule | Promised dates agenda (Today / next 7 days) |
| Alerts | Assignment notifications |
| Account | Identity + API base + sign out |

## Design system

Same as client: yellow budget, Satoshi, tokens, logo, icon+label status. No inventing a second brand.

## Out of scope

Client request flow, rider navigation, Ops matching admin.
