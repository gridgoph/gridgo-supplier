# Pending "What's new" notes

A shop reads each file here in the update prompt, under "What's new in <version>", and on the update card in Alerts. Each user-facing pull request adds one file.

- **Name:** `<PR number>-<short-slug>.md`, for example `94-whats-new-and-tour.md`. The number orders the list.
- **Content:** an optional `Kind:` line, then exactly one line, a bullet starting `- `, at most 120 characters.
- **Kind:** `Kind: feature` (a shop can do something new), `Kind: improvement` (something it already does works or reads better) or `Kind: fix` (something broken now works). Leave it out and the note counts as an improvement. A release is labelled by the biggest kind it carries: New feature, Improvement or Fix. Account > What's new shows that label; see [`WHATS_NEW.md`](../WHATS_NEW.md).
- **Style:** plain words that a shop understands, describing what it will notice. Do not include links, code, file names, issue numbers, people, money figures, or anything private.

For example:

```
Kind: fix
- Sample photos no longer go blank after the app sits in the background.
```

`node scripts/whats-new.js check` validates the notes, and `__tests__/whatsNew.test.ts` runs the same check in CI. A CI build bundles [`WHATS_NEW.md`](../WHATS_NEW.md) and these notes (as its own version) into the app, so Account > What's new reads offline. When a release ships, CI copies these notes and the release label into the GitHub Release and files them in [`WHATS_NEW.md`](../WHATS_NEW.md) under `## <version> (<label>)`. Then it deletes the files here.

A change that a shop would not notice, such as a refactor, a test, or CI work, needs no note.
