# GRIDGO Supplier — PRD (MVP)

**Supplier mobile** for print manufacturers (apparel/sublimation, signage, tarpaulin, upholstery, etc.). Time-sensitive actions; full portal is separate web.

## Sources

- Tinker PRD (supplier role)
- **Supplier presentation 2026-08-04** (primary narrative for this surface)
- Clerk identity and local `gridgo-api`; access details: [Supplier Clerk Design](docs/superpowers/specs/2026-08-14-supplier-clerk-design.md)

## Job to be done

Join GRIDGO’s B2B marketplace and receive orders from businesses/schools/networks without needing your own sales app — accept work, produce, self-QC, hand off to rider, see payout status.

## Presentation benefits → product features

| Benefit (deck) | MVP feature |
|---|---|
| Client acquisition | Assignment inbox of GRIDGO-matched jobs |
| Guaranteed payout | Payout status from demo ledger (real escrow later) |
| QA & centralized communication | Single job timeline / notes (no Messenger chaos) |
| Inventory management | Schedule, category capacity, and shop closures; full tracker later |

## Onboarding path (deck)

1. Apply as GRIDGO supplier  
2–3. Get accredited and list shop  
4. Start receiving GRIDGO orders  

Public application creates a pending supplier account; invitation acceptance remains available. Pending shops land on Home and can complete accreditation papers and their listing board while waiting for Operations.

## MVP screens

| Screen | Purpose |
|---|---|
| Login | Clerk identity with a server-authorized supplier projection |
| Home | Work ranked by urgency and the shop’s money awaiting action; accreditation wait for pending shops |
| Jobs | Accept/decline, production, self-QC, milestone evidence, pickup readiness; order IDs on cards and the workspace |
| Schedule | Promised dates agenda (Today / next 7 days) |
| Alerts | Assignment notifications |
| Account | Shop identity, settings, and sign out |

## Evidence and updates

Proof photographs remain visible after capture, in the filing confirmation, and beside the printing or packing milestone when the job is reopened. PDFs remain document tiles with a filename and type. Filing evidence does not release money: Operations reviews and releases the milestone. Pull-to-refresh in the workspace retries failed evidence metadata reads.

Focused screens refresh from GRIDGO when live updates arrive, including jobs, earnings, accreditation, services, and listings. Reopening the app reconciles current data; an unavailable live stream falls back to periodic foreground reads. Refreshes preserve active edits and existing alert sections, so a live arrival does not move a card during a swipe.

## Design system

Same as client: yellow budget, Satoshi, tokens, logo, icon+label status. No inventing a second brand.

## Out of scope

Client request flow, rider navigation, Ops matching admin.
