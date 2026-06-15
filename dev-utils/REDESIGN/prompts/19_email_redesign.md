# Redesign all outgoing emails (unified style)

Rebuilds *every* outgoing email at once so they all look polished, on-brand, and
share a consistent visual style. This is the emails' *visual design* only — their links,
recipients, and triggering logic are already correct.

> **Prerequisites** This task is deliberately scheduled last; the
> following are expected to already be complete before it begins, and are tracked elsewhere:
> - The **password reset page** redesign.
> - **Localization** of the register-flow pages (register + awaiting + verify) and the password reset page.
>
> Scheduling the emails after that work lets us restyle them as a single set with one shared
> shell, instead of redesigning the verification email now and re-touching it again later for
> consistency.

## Current state
All senders live in `src/server/controllers/emailController.ts`:
- `sendEmailConfirmation` — verification email, links to `GET /verify/:token`. HTML via the
  shared wrapper.
- `sendPasswordResetEmail` — password-reset email. HTML via the shared wrapper.
- `sendRatingAbuseEmail` — rating-abuse alert. **Currently text-only** (no HTML wrapper).

`createEmailHtmlWrapper(title, contentHtml)` is the shared wrapper used by the first two.
`mailer.send(type, { to, subject, html, text })` (`src/server/utility/mailer.ts`) sends — in dev
it returns `false` and logs the HTML/link instead. `getAppBaseUrl()`
(`src/server/utility/urlUtils.ts`) builds absolute URLs.

## Do
1. Build one reusable, well-built **email-layout shell** (evolve `createEmailHtmlWrapper`, or
   replace it with a better helper) and have **all three** emails use it, so they share the same
   header/footer/branding/spacing. Avoid redundancy — no near-duplicate wrappers.
2. Redesign each email's body on that shell:
   - **Verification** — clear heading, short friendly line, prominent **"Verify Account"**
     button, plain-text fallback link.
   - **Password reset** — same structure with a **"Reset Password"** button + fallback link.
   - **Rating abuse** — give it the shared HTML shell too (it's currently text-only); keep its
     dynamic subject/body but render it in the on-brand layout.
3. **Copy can change.** The exact wording doesn't have to match today's emails — reword freely as
   long as each email gets its point across and carries its required button(s)/link(s). The goal
   is *prettier* emails, not preserving the current plain text verbatim. Write the redesign in
   **English** (inline); *localizing* the emails is a separate task (see
   `20_localize_emails.md`) and is out of scope here.
4. Provide a **`text` alternative** alongside `html` in every `mailer.send(...)` call (improves
   deliverability and covers text-only clients).
5. **Preview** each rendered email and confirm they look good and consistent with one another.

## Email-HTML constraints (these are not normal web pages)
- **Inline CSS only** (Gmail/Outlook strip `<style>`/`<head>`).
- **Table-based layout** (`<table role="presentation">`), ~600px max width, centered.
- **Web-safe fonts** with fallbacks (Arial/Helvetica/sans-serif); no web fonts.
- **Bulletproof buttons:** a padded, background-colored `<a>` styled as a button; don't rely on
  CSS Outlook ignores.
- **Absolute URLs** (`getAppBaseUrl()`) for links and any images; no relative paths.
- **Images:** include `alt` text and assume they may be blocked — each email must read fine with
  images off; host any logo at an absolute site URL.
- **Dark-mode legibility:** don't hardcode text colors that vanish on dark backgrounds.
- Keep markup simple and well-indented (tabs).

## Out of scope
- The verify / password-reset landing page UIs and any link/token mechanics. No new email types.
- **Localization / translation** of email copy — tracked separately in `20_localize_emails.md`.
  Write English here.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- All three emails (verification, password reset, rating abuse) render as polished, on-brand
  messages sharing one consistent style, each with working absolute-URL buttons/links where
  applicable, a visible fallback link, and a plain-text alternative; all are legible with images
  off and in dark mode; you have previewed each.

## Gotcha
- `mailer.send` doesn't send in dev — it logs. To preview, render each email's HTML to a file and
  open it in a browser (and ideally an email-testing tool, since browser ≠ email-client
  rendering); test Gmail + an Outlook-style client if you can.
