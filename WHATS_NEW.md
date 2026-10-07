# What's new in GRIDGO Supplier

Each GRIDGO Supplier release carries a short list of plain-language notes. The app shows them in the update prompt and on the update card in Alerts, under "What's new in <version>", and keeps every release below in Account > What's new.

Each release heading carries a label for the kind of release, in brackets:

- **New feature**: the release adds something a shop can now do.
- **Improvement**: something a shop already did works or reads better.
- **Fix**: something that was broken now works.

A release takes the biggest kind among its notes (see [`whats-new/README.md`](whats-new/README.md)). The version numbers stay as CI writes them; the label is not part of the version. There is no beta channel, so there is no Beta label.

Nothing here is technical or private. A shop reads it on its phone.

## Unreleased

Changes that have merged but are not released yet. Each one is a file in [`whats-new/`](whats-new/README.md). When a release ships, `.github/workflows/android-release.yml` does two things:

- It copies these notes into the release body, under `## What's new`.
- It moves them below, under that version's heading.

<!-- CI adds each release below this line. -->

## 1.0.164 (Fix)

- Shop photos save correctly from your camera or gallery, with a clear way to try again if an upload fails.

## 1.0.160 (New feature)

- Get a notification when a new app version is ready. Tap it to download the update.
- Production time is now set in working days on your open hours, with the date a job started now would be ready.

## 1.0.153 (Fix)

- Job history stays open even when an update has missing details.

## 1.0.148 (New feature)

- Home counts the listings that need work and lists them once. The add-a-listing steps keep Review in view.
- New jobs show your hour to answer, and you can cancel an accepted job or ask the client once for a new deadline.
- Pick what you list from a grid of product types; new listings go to Operations for review before clients see them.
- A late job that is on hold no longer tells you to finish it, and a job you let go no longer shows a late card.

## 1.0.142 (New feature)

- Signing up shows each category's products. You make only what your own shop produces, and never pass a job on.
- A late job now explains its lateness tier and any deduction, and Account lists your late jobs.

## 1.0.137 (New feature)

- Before a listing goes up, a quick check shows that sample photos must have no watermark, logo or shop name.
- Home now says whether clients can be matched with your shop, and lists each missing step with a button to fix it.

## 1.0.126 (New feature)

- See what changed in each update, and take a short tour of jobs, your schedule and your catalogue.
