# Redesign the verification email's HTML

**Atomic task.** Rebuilds the verification email so it looks polished and on-brand. This is the
email's *visual design* only — its link and recipient are already correct.

## Current state
`sendEmailConfirmation` in `src/server/controllers/emailController.ts` sends a functional but
plain verification email linking to `GET /verify/:token`. `createEmailHtmlWrapper(title,
contentHtml)` is the shared wrapper used by all emails; `sendPasswordResetEmail` and
`sendRatingAbuseEmail` also use it. `mailer.send({ to, subject, html, text })`
(`src/server/utility/mailer.ts`) sends — in dev it returns `false` and logs the HTML/link
instead. `getAppBaseUrl()` (`src/server/utility/urlUtils.ts`) builds absolute URLs.

## Do
1. Redesign the verification email's HTML to look polished and on-brand: a clear heading, a
   short friendly line, a prominent **"Verify Account" button**, and a plain-text fallback link
   (some clients don't render buttons). Keep the existing copy intent — English only; emails
   are sent server-side, so they use the **server** translation path (not the client `t.*`);
   match how the current email obtains its text.
2. **Wrapper strategy (avoid redundancy):** prefer turning `createEmailHtmlWrapper` (or a new,
   better email-layout helper) into a reusable, well-built shell and have the verification
   email use it. **If you change the shared wrapper, verify the password-reset and rating-abuse
   emails still render.** If a clean shared shell is awkward, scope the redesign to the
   verification email but don't duplicate a near-identical wrapper.
3. Provide a **`text` alternative** alongside `html` in the `mailer.send(...)` call (improves
   deliverability and covers text-only clients), at least for the verification email.
4. **Preview** the rendered HTML and confirm it looks good.

## Email-HTML constraints (these are not normal web pages)
- **Inline CSS only** (Gmail/Outlook strip `<style>`/`<head>`).
- **Table-based layout** (`<table role="presentation">`), ~600px max width, centered.
- **Web-safe fonts** with fallbacks (Arial/Helvetica/sans-serif); no web fonts.
- **Bulletproof button:** a padded, background-colored `<a>` styled as a button; don't rely on
  CSS Outlook ignores.
- **Absolute URLs** (`getAppBaseUrl()`) for the link and any images; no relative paths.
- **Images:** include `alt` text and assume they may be blocked — the email must read fine with
  images off; host any logo at an absolute site URL.
- **Dark-mode legibility:** don't hardcode text colors that vanish on dark backgrounds.
- Keep markup simple and well-indented (tabs).

## Out of scope
- The verify landing page UI and the verify link/token mechanics. No new email types.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- The verification email renders as a polished, on-brand message with a working "Verify
  Account" button to the correct `/verify/:token` absolute URL, a visible fallback link, and a
  plain-text alternative; if the shared wrapper changed, the other emails still render; it is
  legible with images off and in dark mode; you have previewed it.

## Gotcha
- `mailer.send` doesn't send in dev — it logs. To preview, render the email HTML to a file and
  open it in a browser (and ideally an email-testing tool, since browser ≠ email-client
  rendering); test Gmail + an Outlook-style client if you can.
