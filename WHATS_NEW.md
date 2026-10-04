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

## 1.0.137 (New feature)

- Before a listing goes up, a quick check shows that sample photos must have no watermark, logo or shop name.
- Home now says whether clients can be matched with your shop, and lists each missing step with a button to fix it.

## 1.0.126 (New feature)

- See what changed in each update, and take a short tour of jobs, your schedule and your catalogue.
