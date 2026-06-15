# Localize the outgoing emails

Translates the **user-facing** emails into the recipient's language. Big sites localize
transactional mail when they know the recipient's language — and here we do, for free, because
both user-facing emails are sent in direct response to a request from a localized page. No locale
needs to be stored anywhere.

> **Prerequisite (not part of this task).** The email **visual redesign**
> (`19_email_redesign.md`) should already be done — we localize the redesigned HTML, not the old plain text. Localizing
> first and redesigning second would mean reworking the strings twice.

## Scope — which emails
| Email | Recipient | Localize? |
|---|---|---|
| Verification (`sendEmailConfirmation`) | the registering user | **Yes** |
| Password reset (`sendPasswordResetEmail`) | the user | **Yes** |
| Rating abuse (`sendRatingAbuseEmail`) | the site operator (sent to `mailer.FROM`) | **No** — internal alert, stays English |

## Current state
The senders in `src/server/controllers/emailController.ts` build their subject, body, button
label, and fallback text from **hardcoded English strings**. They receive no language argument.

**Use the redesign-era per-component translation system — NOT the legacy `getTranslation` /
`i18next` path, which is being removed.** Read `dev-utils/REDESIGN/TRANSLATION_SYSTEM.md` first.
The relevant primitives:
- Server-emitted strings live in a per-component folder `translation/<component>/en-US.toml`
  (English is the required source; translators add the other languages). The component's whole
  TOML can be marked `script_only = true` when every key is server-emitted rather than
  template-rendered (see `translation/responses/en-US.toml`).
- A caller holding `req` reads strings via the typed accessor `req.t.<component>.<key>`. A caller
  holding only a **bare language code** — exactly an email sender — uses the
  `getScriptTranslations(component, lang)` primitive from
  `src/server/config/componentTranslationLoader.ts`. TRANSLATION_SYSTEM.md explicitly names the
  email sender as this primitive's intended use case.
- These strings are static — there is **no built-in interpolation**. For dynamic values use the
  `interpolate(template, vars)` helper (`src/shared/util/interpolate.ts`) with `{name}`-style
  placeholders, the same convention `translation/responses` already uses (e.g.
  `login_retry_in_one = "... {n} second."`).

Both senders' callers already have the request language in hand (`req.lang`):
- `sendEmailConfirmation` — called from `createAccountController` (`createNewMember` and
  `changePendingEmail`).
- `sendPasswordResetEmail` — called from `passwordResetController.handleForgotPasswordRequest`.

## Do
1. **Thread the language through.** Add a `language: string` parameter to `sendEmailConfirmation`
   and `sendPasswordResetEmail`, and pass `req.lang` from each caller. Leave `sendRatingAbuseEmail`
   untouched.
2. **Create a dedicated `email` translation component.** Add `translation/email/en-US.toml` with
   `script_only = true` (every key is server-emitted, none template-rendered), grouping keys in
   `[verify]` / `[reset]` sub-tables — subject, heading, body line(s), button label, and the
   plain-text fallback/`text` alternative. In each sender, resolve the table once via
   `getScriptTranslations('email', language)` and read `.verify.subject`, `.reset.button`, etc.,
   replacing every inline English string. Only author the **English** TOML; the other languages
   are filled by translators via the normal pipeline.
3. **Interpolation.** The verification email injects the **username**, and the reset email
   mentions the **1-hour expiry**. The new system returns static strings (no built-in
   interpolation), so put `{username}` / `{hours}` placeholders in the TOML values and resolve
   them with the `interpolate(template, vars)` helper (`src/shared/util/interpolate.ts`), e.g.
   `interpolate(t.verify.greeting, { username })`.
4. **Keep the shared shell language-agnostic.** The email-layout shell from task 19 takes a title
   + content; pass it already-translated strings — don't hardcode English inside the shell.
5. Run `npm run generate:types` so the `email` component appears in the generated
   `ScriptTranslations` interface, then **restart the server** (the loader reads the TOMLs once at
   boot, so TOML changes need a restart).
6. **Preview** the verification and password-reset emails in at least one non-English language and
   confirm the subject, body, button, and fallback link are all translated and still render well.

## Out of scope
- The rating-abuse email (internal — stays English).
- The email visual design (task 19) and any link/token mechanics.
- Translating into the non-English TOMLs by hand (translators own those).

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- Verification and password-reset emails render fully in the recipient's `req.lang` — subject,
  body, button label, and plain-text alternative all localized, with interpolated values
  (username / expiry) correct.
- The rating-abuse email is unchanged (still English, still sent to `mailer.FROM`).
- New English strings live in `translation/email/en-US.toml` and the `email` component is in the
  regenerated `ScriptTranslations` (`npm run generate:types`); you have previewed at least one
  non-English rendering.
