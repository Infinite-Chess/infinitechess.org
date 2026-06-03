# Chunk 05 — Redesign the account-verification email

**Read `00_OVERVIEW.md` first. Depends only on chunk `01`** (which points the
verification email at the new `/verify/:token` link). Independent of `02`, `03`, `04` —
do it any time after `01`, in parallel if you like. This is a self-contained,
isolation-reviewable task: **rebuild the HTML of the verification email from scratch.**

The current email looks bad and is being redesigned. Chunk `01` only fixed its *link* and
*content*; this chunk owns its *visual design*.

## Context (files)
- `src/server/controllers/emailController.ts` — contains:
  - `createEmailHtmlWrapper(title, contentHtml)` — the **shared** wrapper used by all
    emails (a single `<div>` with inline styles).
  - `sendEmailConfirmation(...)` — builds and sends the verification email (the one to
    redesign). After chunk `01` it links to `GET /verify/:token`.
  - `sendPasswordResetEmail(...)` and `sendRatingAbuseEmail(...)` — other emails that
    currently share `createEmailHtmlWrapper`.
- `src/server/utility/mailer.ts` — `mailer.send({ to, subject, html, text })`. In dev,
  `send` returns `false` and the link/HTML is logged to the console instead of sent.
- `src/server/utility/urlUtils.ts` — `getAppBaseUrl()` for absolute URLs (emails can't use
  relative paths). Use it for the verify link **and** any image/logo `src`.

## Scope (do)
1. **Redesign the verification email's HTML** so it looks polished and on-brand for
   infinitechess.org: a clear heading, a short friendly line, a prominent **"Verify
   Account" button**, and a plain-text fallback link (some clients don't render buttons).
   Keep the existing copy intent (English only; route user-facing strings appropriately —
   note that emails are sent server-side, so they use the server translation path, not the
   client `t.*`; match how the current email obtains its text).
2. **Decide the wrapper strategy and avoid redundancy** (per `CLAUDE.md`):
   - Preferred: turn `createEmailHtmlWrapper` (or a new, better email-layout helper) into a
     reusable, well-built email shell, and have the verification email use it. If you
     change the shared wrapper, **you must verify the password-reset and rating-abuse
     emails still render correctly** with it.
   - If a clean shared shell is awkward, scope your redesign to the verification email and
     leave the others untouched — but don't duplicate a near-identical wrapper.
3. **Plain-text alternative:** provide a `text` version alongside `html` in the
   `mailer.send(...)` call (improves deliverability and covers text-only clients), at least
   for the verification email.
4. **Provide a way to preview** what you built (see Gotchas) and confirm it renders well.

## Email-HTML constraints (these are not normal web pages — follow them)
- **Inline CSS only.** Many clients (Gmail, Outlook) strip `<style>`/`<head>` CSS. Put
  styles inline on elements.
- **Table-based layout**, not flexbox/grid. Use `<table role="presentation">` for
  structure. Constrain content to ~`600px` max width, centered.
- **Web-safe fonts** with fallbacks (e.g. Arial/Helvetica/sans-serif). No web fonts.
- **Bulletproof button**: a padded, background-colored `<a>` styled as a button (table-cell
  based). Don't rely on CSS that Outlook ignores; a simple, robust button is fine.
- **Absolute URLs** for the link and any images (`getAppBaseUrl()`); no relative paths, no
  local/bundled CSS.
- **Images:** include `alt` text; assume images may be blocked by default, so the email
  must read fine with images off. If adding a logo, host it at an absolute site URL.
- Consider **dark-mode** legibility (don't hardcode text colors that vanish on dark
  backgrounds; keep sufficient contrast).
- Keep the markup simple and well-indented (tabs).

## Out of scope
- The verify **landing page** (`/verify/:token`) UI — that's chunk `03`. This chunk is only
  the email itself.
- The verify link/token mechanics — chunk `01`.
- No new email types; just redesign the verification email (and, if you refactor the shared
  shell, keep the other emails working).

## Acceptance criteria
- `npm run type-check --silent` and `npm run lint --silent` both pass.
- The verification email renders as a polished, on-brand message with a working "Verify
  Account" button linking to the correct `/verify/:token` absolute URL, plus a visible
  fallback link, and a plain-text alternative.
- If the shared wrapper was changed, the password-reset and rating-abuse emails still
  render correctly.
- The email is legible with images disabled and in dark mode.
- You have previewed the rendered HTML and confirmed it looks good.

## Gotchas
- **Previewing in dev:** `mailer.send` doesn't actually send in dev — it logs. To see your
  design, render the email HTML to a file and open it in a browser (and ideally paste it
  into an email-testing tool / send yourself a real one via a configured SMTP), since
  browser rendering ≠ email-client rendering. Test at least Gmail + one Outlook-style
  client if you can.
- Don't introduce a second wrapper that duplicates the existing one — consolidate.
- Server-side emails localize via the server translation path (the current code already
  pulls its text somewhere) — follow the existing mechanism; don't reach for client `t.*`.
