# Agent prompt: shared `fetch()` wrapper that injects `is-fetch-request`

Paste the section below into a new session to run this task.

---

## Task

Create a thin, drop-in replacement for the browser `fetch()` that guarantees the
custom `is-fetch-request: 'true'` header is present, then replace the hand-written
header in every client fetch call site with it.

## Why this header exists (context)

Three middlewares are mounted globally with `app.use(...)` in
`src/server/middleware/middleware.ts` (~lines 190–194):
`assignOrRenewBrowserID`, `setPrefsCookie`, `setPracticeProgressCookie`. Each runs
on every request and sets/renews a cookie — but only for real HTML page loads. They
skip that side-effect when the request is a `fetch`, detected via:

```js
if (req.headers['is-fetch-request'] === 'true' || !req.accepts('html')) return next();
```

The `!req.accepts('html')` fallback is unreliable for `fetch` (a default `fetch`
sends `Accept: */*`, which matches `accepts('html')`), so the explicit header is the
only dependable signal. Therefore **every** client fetch must send it, or it triggers
unwanted cookie churn on API responses. Do not change any server behavior.

## Model it on the existing utility

`src/client/scripts/esm/util/fetchDeduplicator.ts` exports a single function
`fetchWithDeduplication(url, options)` in the same style we want: one small util file,
single normal `export` (per `docs/GUIDELINES.md`). The new helper is **independent** of
the deduplicator (different concern) — don't merge them.

## Requirements

1. New file under `src/client/scripts/esm/util/` (pick a context-appropriate name per
   `docs/GUIDELINES.md`, e.g. `apifetch.ts` exporting `apifetch`).
2. **True drop-in signature** — must mirror native fetch exactly so a call site can swap
   `fetch(` → `apifetch(` with no other edits:
   `(input: RequestInfo | URL, init?: RequestInit): Promise<Response>`.
3. Inject `is-fetch-request: 'true'` into the headers **without clobbering** caller
   headers, correctly handling every form `init.headers` can take: `undefined`, a plain
   `Record<string, string>`, a `Headers` instance, and an array of `[key, value]` tuples.
   (A `new Headers(init?.headers)` then `.set(...)` handles all forms cleanly.)
4. Do **not** force `Content-Type`, `method`, `credentials`, or `body` — callers keep
   passing those. The helper's only job is guaranteeing the one header.
5. Replace all current call sites. Get the authoritative list with
   `grep -rln "is-fetch-request" src/client`, then in each, switch to the helper and
   delete the now-redundant manual `'is-fetch-request': 'true'` entry. As of this writing
   the senders are: `util/validatorama.ts`, `components/header/news-notification.ts`,
   `views/login.ts`, `game/chess/checkmatepractice.ts`,
   `game/editorstores/editorSavesAPI.ts`, `components/header/preferences.ts`,
   `components/header/dropdowns/languagedropdown.ts`, `views/news.ts`, `views/member.ts`,
   `views/register.ts`, `views/resetpassword.ts`, `views/leaderboard.ts`.
   - Note: a couple of these also use `fetchWithDeduplication`. Leave the dedup behavior
     intact — only consolidate the header. If a site needs both, the cleanest path is
     having the helper build the headers and pass them through; decide per site.
6. Confirm zero `'is-fetch-request'` string literals remain in `src/client` outside the
   new helper.
7. Run `npm run type-check --silent` and `npm run lint --silent`; both must pass.

## Acceptance check

- Helper compiles and is the single source of the header string.
- Every former call site is byte-for-byte simpler (header removed) and unchanged in
  behavior (same method/body/credentials/Content-Type).
- `grep -rn "is-fetch-request" src/client` shows only the new helper file.

## After completion

This prompt doc is single-use — once the task is done and the checks pass, delete
`dev-utils/REDESIGN/SHARED_FETCH_PROMPT.md`.
