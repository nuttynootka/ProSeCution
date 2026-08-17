# ProSeCution — Pro Se Legal Case Manager

An offline-first, privacy-first case manager for self-represented litigants. Built as an
installable web app (PWA) targeting Android.

> **Not legal advice.** This is a document and deadline management tool. Anything it
> generates is a working draft that a human must review and adopt before filing.

## Status

Early construction. The work is broken into 51 reviewable chunks across 11 stages;
Chunk 1 (project scaffold) is complete.

| Stage | Scope | State |
| --- | --- | --- |
| 1 | Foundation shell + design system | Chunk 1 done |
| 2 | Encrypted store, cases & parties | not started |
| 3 | Documents, OCR, timeline | not started |
| 4 | Deadline engine + calendar export | not started |
| 5 | PDF templates & form filler | not started |
| 6 | Compliance (PII redaction, service, fee waiver, backup) | not started |
| 7 | Local MVP checkpoint | not started |
| 8 | Retrieval backend | not started |
| 9–10 | AI agents (grounded Q&A, drafting, opposing-filing audit) | not started |
| 11 | Hardening & release | not started |

## Planned capabilities

Document intake with on-device OCR and confidence-based correction; a chronological case
timeline with full-text search; jurisdiction-aware deadline calculation exported to the
phone's native calendar; PDF court-form filling with a ruled-line paragraph engine;
automated PII redaction; proof-of-service and fee-waiver generation; encrypted backup and
restore; and AI assistance for grounded legal Q&A, motion drafting and opposing-filing
analysis — all strictly grounded in a cited legal corpus.

## Design decisions worth knowing

- **Deadline reminders go through the system calendar.** The web platform has no offline
  scheduled-notification API. Writing deadlines into the phone's own calendar means
  Android fires reminders natively — more reliable than app-scheduled alarms, since
  Android aggressively kills background apps.
- **Encrypted at rest, with an honest caveat.** Case data is encrypted with AES-256-GCM
  via Web Crypto, keyed from a user passphrase. Unlike a native app there is no
  hardware-backed key isolation, and the key lives in memory while unlocked.
- **No cloud backup.** Case files never sync anywhere. The only migration path is a
  passphrase-protected encrypted export.
- **AI is optional and bring-your-own-key.** Ships with a free default; supplying your own
  API key unlocks stronger models. Generation runs client-side and goes directly to the
  chosen provider. The UI discloses each provider's data-training policy at the point of
  selection.

## Development

```bash
npm install
npm run dev        # dev server
npm run build      # typecheck + production build
npm run test:e2e   # Playwright, emulating a Pixel 7
npm run icons      # regenerate PWA icons from public/icons/icon.svg
```

Pushes to `main` build, test and deploy to GitHub Pages automatically.

## Repository layout

- `src/` — application source
- `e2e/` — Playwright specs and screenshot capture
- `project/`, `chats/` — the original Claude Design mockup and design conversation, kept
  as the visual specification
- `archive/android-scaffold/` — an earlier native Kotlin scaffold, superseded by the PWA
