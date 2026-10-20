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

## 1.0.318 (New feature)

- Set how long a listing takes in one question, Same day or Days, and see the dates clients will be offered.
- A tight-deadline offer is marked on Home, and its accept screen no longer warns of a deduction during the pilot.

## 1.0.304 (New feature)

- New jobs with a tight deadline say so before you accept, and you can decline them with a reason at no penalty.
- You can add up to three screenshots when you report a problem, so Operations sees what you saw.

## 1.0.298 (Fix)

- A job the client paid in full now says "Client paid in full" instead of "Downpayment in".

## 1.0.293 (Fix)

- Signing in with an account that is not a shop now says so on Sign in, and the emailed code is called a code.

## 1.0.288 (New feature)

- New Performance page: late-finish notices, warnings, on-time rate and Top Pick. Warnings only, no money taken.

## 1.0.283 (New feature)

- Message the client about a job through GRIDGO, and see exactly what the client approved.

## 1.0.277 (Fix)

- When the rider hangs up, your call now says the rider ended it and how long it lasted, not a lost connection.

## 1.0.271 (New feature)

- Hardbound jobs show the cover choice and spine text the client gave, with a preview of the spine.

## 1.0.266 (Improvement)

- Alerts opens straight away on what you last saw, and stays quick with a long inbox.

## 1.0.261 (Fix)

- On iPhone, sheets now reach the bottom of the screen without an empty gap under the buttons.

## 1.0.256 (Fix)

- Jobs and listings have a back button again on iPhone, and Alerts shows only the updates for how you installed the app.

## 1.0.251 (New feature)

- Price per-page work by how much strong colour each page has, and send a colour correction for the client to approve.

## 1.0.247 (Fix)

- On iPhone, the bottom tabs have room above them, so lists no longer run into the icons.

## 1.0.239 (Fix)

- Update notices now open Google Play or TestFlight, and arrive only once your store has the new version.

## 1.0.234 (New feature)

- Turn on Express for a listing so clients can pick any deadline from today. Express jobs carry a tag.

## 1.0.230 (New feature)

- Add as many proof photos as you like to each payout part, pick several at once, and see each photo once.

## 1.0.221 (New feature)

- Read GRIDGO's terms in Account, agree to them when they change, and ask to see, fix or delete your data.
- Set production time in hours for same-day jobs, and see what a job still needs before it can be packaged.
- Messages from your rider and Operations ring on your phone, and tapping one opens that conversation.
- Newer jobs: send finished photos for review, then pack in front of the rider once the unpacked check passes.
- A job now lists every file and design link the client sent for each item, with their labels and the main file marked.
- Read and tick a client's special instructions before accepting, and ask for a change when they cost more.
- Set your open days and hours, closure dates, close for a while, or stay open later today.
- Mark which print layouts a listing offers, and see the client's chosen layout and page fit on each job.
- Jobs show the exact colours the client named, beside the colours GRIDGO read from each file.

## 1.0.197 (Fix)

- Photos sent to Operations in chat now upload correctly on Android.
- Finished jobs no longer show due or late countdowns, and missing client dates no longer appear in job headers.

## 1.0.190 (Improvement)

- Document jobs show the pages selected for printing, the full file count, and pages per copy.
- Jobs cards now show when your shop must have the job ready, with due and late wording based on that date.

## 1.0.183 (New feature)

- The shop map stays large enough to place your pin, even with larger text or the keyboard open.
- Send a photo of the packed job before dispatch so the client and Operations can see it.
- Searching for your shop during sign-up brings the map into view, even with larger text and the keyboard open.
- Delete account now lives under Danger zone in Your shop details and asks for your password or an emailed code first.
- Job cards show your shop's own price and the size selected from your listing.

## 1.0.168 (New feature)

- Request account deletion from Account and read the Privacy Policy from Account or sign-up.

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
