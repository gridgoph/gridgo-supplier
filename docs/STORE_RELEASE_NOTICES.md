# Store availability before release notices

Uploading a bundle or IPA does not mean a tester can install it. The Android
and iOS upload workflows save `release.json` in a seven-day Actions artifact
**before** the store upload, without the announcement credential. Metadata creation
and artifact persistence must succeed before the notice-eligible upload can run. `store-release-notices.yml` checks pending
records every 30 minutes from trusted `main` code. It sends only after confirming
the exact build's availability. APK publishing and its immediate notice are unchanged.

## Availability signals

### Google Play

The older `edits.tracks` status is insufficient: the uploader itself writes
`completed` before review. Google's current
[`applications.tracks.releases.list`](https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases/list)
endpoint exposes a separate
[`releaseLifecycleState`](https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases).
The checker requires `RELEASE_LIFECYCLE_STATE_PUBLISHED` and the exact build in
`activeArtifacts`. Approval awaiting manual publication does not pass.

`PUBLISHED` includes partial and halted releases. The checker also opens a
disposable edit, reads the track, requires `status: completed` without a staged
fraction, then deletes that edit. It never commits, uploads, submits, or promotes
anything. Read errors, including unavailable/unauthorized lifecycle endpoints,
leave the notice unsent; there is no fallback to the older status alone.

Google permits only one open edit per user. The checker and every Play upload
(across all branches) share the `play-store-access` Actions concurrency group,
with cancellation disabled. APK builds retain their existing cancellation.
Both sides use GitHub's [`queue: max`](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
so a scheduled check cannot replace a pending upload.
Do not run this script locally with the production service account during an
upload: the Actions lock cannot serialize a local process. See Google's
[edit lifecycle](https://developers.google.com/android-publisher/edits).

This app's releases target `alpha` (closed testing). The successful upload's actual
`PLAY_TRACK` is saved as `playTrack` in the pending record, and the checker
requires both publication and completed/unstaged rollout on that exact track.
The workflow queues notices only when the upload targeted `alpha`; internal-only
uploads queue no Play notice. The checker also rejects internal, unknown, and
older trackless records before any store or announcement request. Availability
on the unused internal track is not required.

A first Play-channel device reporting a build is weaker evidence: distribution
is baked into the bundle, so a sideloaded bundle-generated APK can report `play`;
an internal install also cannot prove closed-track availability. The current
header/channel data has no track-specific, store-attested installation evidence.
The lifecycle endpoint avoids an API change or relying on those observations.

### TestFlight

Using the existing ASC key, the checker finds the exact app, marketing version,
and build number. It requires `processingState: VALID`, `expired: false`, a future
expiration date, `externalBuildState: IN_BETA_TESTING`, and
`betaReviewState: APPROVED`.

It enumerates all tester groups and their build relationships, following
pagination, to find the groups **actually assigned this build**. At least one
assigned group must be external. The external testing state and approved beta
review confirm access for assigned external groups; every assigned internal
group also requires `internalBuildState: IN_BETA_TESTING`. Internal-only
availability, processing complete, and approval alone cannot pass.
See Apple's [build beta details](https://developer.apple.com/documentation/appstoreconnectapi/buildbetadetail),
[beta review submission](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds-_id_-betaappreviewsubmission),
and [group builds](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-betagroups-_id_-builds).

A group intentionally left without this build **does not block the notice**.
Failed group/membership reads still block: a failed read cannot establish that
a group is unassigned. Missing explicit review approval or unknown availability
states also leave the notice pending. Group assignment is read live at each
check, so later assignment changes are respected while the notice is pending.
The existing GRIDGO API still delivers to the iOS install channel; it does not
filter recipients by TestFlight group. This gate confirms availability for
assigned groups, rather than asserting that deliberately excluded groups can
install the build.

## Operations and retries

- For notice-eligible `main` uploads, create and durably save the pending record
  before calling Play or TestFlight. Creation/save failures fail the run and
  block the store upload; rerun the workflow once artifact storage is healthy.
  A pending record from an unsuccessful upload run cannot announce: discovery
  still requires a successful trusted run and exact-build store availability.
  Branch uploads and internal-only Play uploads retain their no-notice path.
  Pending records are not backfilled for uploads made before this change.
- The scheduled workflow must reach GitHub's default branch (`main`) to run.
  GitHub may delay a schedule; late notices are acceptable.
- Reuse `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `ASC_API_KEY_P8`, `ASC_KEY_ID`,
  `ASC_ISSUER_ID`, `ASC_APP_ID`, and `RELEASE_ANNOUNCE_TOKEN`. No new credential or
  GRIDGO API deployment is needed. Store credentials stay on Actions runners.
- The GRIDGO API already de-duplicates `(app, version, channel)`. Delete the
  pending artifact only after it accepts the announcement. HTTP failures and
  missing credentials retain it; cleanup failures can retry without another push.
- Both artifact retention and record/run age cap checks at seven days. Expired,
  malformed, or unverifiable records are silently skipped. No timeout sends a notice.
- Manual **Announce available store releases** dispatch defaults to dry run.
  Local `node scripts/check-store-releases.mjs --dry-run` reads APIs but never
  sends or deletes pending artifacts. `--send` is reserved for actual delivery.

## Porting to Supplier and Rider

Copy these files verbatim:

- `scripts/store-availability.mjs`
- `scripts/queue-store-release.mjs`
- `scripts/check-store-releases.mjs`
- `scripts/announce-release.mjs` and `scripts/announce-release.test.mjs`
- `scripts/store-availability.test.mjs`
- `scripts/check-store-releases.test.mjs`
- `scripts/test-support/store-release.mjs` (test-only generated keys)
- `docs/STORE_RELEASE_NOTICES.md`

The shared `scripts/play-release-notes.mjs` is an existing dependency; retain its
`serviceAccountAssertion` export. Apply the Android/iOS workflow queue/save blocks
and the Android check step. Put queue/save before the store upload, keep both
steps blocking, and add the `save_play_notice` / `save_ios_notice` success
prerequisite to the corresponding upload. Copy `store-release-notices.yml`, changing only
`RELEASE_APP` and `PLAY_PACKAGE` to that repo's role/package; queue blocks also
use its role. Keep each repo's existing `ASC_APP_ID` variable and credentials.
Apply the Android concurrency change too; its group must match the checker's
`play-store-access` job group, so checks and uploads cannot invalidate each other.
Apply the corresponding upload-workflow test changes and README notice link.
The self-contained script fixtures intentionally use a fake Client app and need
no Supplier/Rider credentials or changes.

Supplier's old broadcast steps are named "Announce the Play release" and
"Announce the TestFlight release", guarded by `play_submit` / `testflight`
upload outcomes. Replace those post-upload steps with pre-upload queue/save
steps. Preserve the upload step IDs, and require saved pending metadata before
the upload itself. A pre-upload queue cannot depend on an upload outcome that
does not exist yet; successful-run discovery remains the post-upload gate.
Rider's old broadcast blocks match Client's names. Preserve each repository's
APK and What's New steps when moving the notice blocks.
