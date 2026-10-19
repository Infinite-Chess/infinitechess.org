# Redesign TODO

---

## Page Redesigns

*Each page: new Nunjucks template extending `layout.njk`, new CSS file in `src/client/css/`, updated route handler with full SSR context, and updated/new TS where needed. Add shared CSS rules to `global.css` as you encounter the need for them.*

**Working with pages during the redesign:**
- **Redesigning a page** — replace its placeholder `.njk` stub with the real template; add a CSS file in `src/client/css/` and an esbuild entry point.
- **Removing a page** — delete its `.njk`, its CSS, and its entry point together; remove the route from `root.ts`.
- **Adding a new page** — add a route to `root.ts`, create a `.njk` template and a CSS file in `src/client/css/`, add an esbuild entry point.

- Delete all old ejs documents, stylesheets, and scripts related to the old pages.

- Should we have some special 429 "Too Many Requests" page or handling? Does sending the html for that page each rate limit effectively defeat the purpose? We're still sending just as much data each request??

### Profile
- SSR all profile data (username, rating, join date, etc.).
- User info: Patron badge, username, member since, online/last online status. World ranking.
- Spectate (if in live game).
- Manage account: Change username, password, cancel patron plan, delete account.

### Leaderboard
- SSR initial batch of leaderboard rows; Snabbdom for the "Show More" interaction.

### News
- SSR for news post "NEW" badges.

### Board Editor
- Share games via url. Next to the link to copy notation. Maximum piece count / icn length prevents dirty images.
- Create an invite from the position. Maximum piece count / icn length prevents dirty images. Same model popup as creating an invite from the lobby.
- Move to Analysis Board
- Wire the variant selector's pencil (edit) button, already rendered but inert, to open the selected variant in the editor.

### Tutorial
- Interactive tutorial teaching users the basic controls, features, and rules, of Infinite Chess.

### Checkmate Practice
- Along the top is a bar displaying your percentage completion of all checkmates, with badges displayed at the percentages you will earn them. If the user is not logged in, display a clear warning that users cannot earn badges without an account.
- Large banners for each checkmate to play, similar to that of Lichess's learn page. Each banner is colored, with clear boundaries, and like the existing checkmate practice on the main branch, contains svgs of the pieces showing you the checkmate pattern you need to solve. Unsolved checkmates are blue. Solved are green, with a checkmark badge. Checkmates are categorized and clearly separated by difficulty.

### Donate
- Lichess inspired. Donating any amount gives you a cool badge next to your username.
- One-time and Monthly donation options.
- TODO: Study laws and regulations surrounding payment processing and accepting users credit cards and other private information.
- TODO: Answer whether regulations are stricter if a patron plan also gives you a cool skin in the future infinite-multiplayer game. It wouldn't provide players an advantage. One could argue the skin is just a cosmetic reward similar to that of the badge?
- When monthly dontations stop, badge is removed.
- Maybe a lifetime donation amount where the badge is permanent?
- Lichess offers golden wings after 5 years of active patron status. And instantly after a lifetime donation, unlocking all colors.
- Do not handle raw credit card numbers, that's a huge liability. Instead, accept the 3% & ~$0.50 processing fee of payment processors such as Stripe, PayPal, etc.

### About Infinite Chess
- Brief story about the game's inception, why it is interesting, and how users can learn more. Basically the stuff on the existing home page on the main branch, but more professional.
- Reconsider linking it from below the home page's splash text.

### Terms of Service
- What it and the Privacy Policy must cover is sketched in [terms.md](terms.md).
- English only, rendered from a Markdown file, with an optional notice that the English version is authoritative.
- Add a `last_emailed_tos_version` INTEGER column to the `members` table (default 0) to track which ToS-update broadcast each member has been emailed — for when the ToS-update email broadcaster is built.

### Privacy Policy
- English only, same approach as ToS.

### Credits
- State the project is open source, conveniently link to the github.
- Thank all github contributors. List all contributors on the github, similarly to the existing home page on the main branch.
- Give appropriate credit for other aspects of the website and game - variants, textures, sounds, music, external code, language translations, etc. Similar to the existing credits page on the main branch.

---

## Components

- **Settings:** Add a way to change keybinds.

- **Game options modal (FUTURE):** A way to add special rule modifications to the selected variant: Fog of War, Duck Chess, Antichess, Atomic, KoTH, Chess 960, Obstocean (infinite obstacles), Drawback Chess, Progressive Chess. None are mutually-exclusive, add as many as desired. Adding a modification shows that respective symbol in the Variant column of the seek.

---

## Translation System Refactor

- Localize each page. All keys should be well organized in their respective components. Keys needing to be accessible by the js should be put in the `[script]` object of the TOML, and can be accessed via the global `t` variable. Server-side keys needed for sending translated responses should be placed into the `responses` component TOML (which is `script_only`, so its keys live at the top level rather than under a `[script]` table), and can be accessed via `req.t.responses` (or `ws.t.responses` from socket code). As we create each new component TOML, delete related keys out of the old monolith English TOML.

- Analyze the remaining keys in the old monolith English TOML determine whether the stragglers should be deleted or migrated into new components. Delete all old monolith TOMLs.

- Delete everything left of the old translations system: generate-translation-types (remove that from the `generate:types` script, too), and `src/types/translations.ts`. Also remove `../types/**/*` from the `include` property of `src/shared/tsconfig.json`. Remove unused global declares from `src/client/types/globals.d.ts`.

- **Once all pages are redesigned and real page usage is known: audit `shared/` for per-feature splitting to reduce bandwidth.** The `translation/shared/` component is injected into `window.t` on *every* page sitewide (via `layout.njk`), so every string it holds ships on every page load whether or not that page uses it. The current convention is "anything used (or likely to be used post-redesign) on more than one page goes in `shared`," which is simple but means genuinely cross-page-but-not-universal string groups (e.g. account-field validation, used only on register/awaiting/resetpassword) ride along on the homepage, game, leaderboard, etc. that never reference them. When page usage is finalized, audit `shared`'s contents and split out string groups consumed only by a *handful* of related pages into their own per-feature components (like `header`/`footer` already are), injected only where needed — leaving `shared` for what is *truly* universal (e.g. likely variant codes, sitewide error fallbacks, socket messages, etc.). This trades a little extra per-page injection wiring for a leaner baseline payload on every page. It's a deliberate convention change, not a one-off: do it across the board or not at all, since a single exception just makes the rule inconsistent.

- Also audit `global.css` as to whether or not it should be split up. Are there rules in there that are only used by a few pages? If so, consider moving them into the per-page CSS files instead of having them ship on every page.

- Also audit the shared svg symbols in header.njk as to if any are just used on one or just a couple pages. If so, consider moving them into the per-page templates.

- Once all pages are localized: Remove whitelisted XSS tags from xss_options constant that aren't used in any toml component.

- Setup Weblate.

- Rewrite the translation guide in `docs/TRANSLATING.md` to reflect the new system and Weblate. It should cover how to use Weblate, and also contain pointers for fast-tracking translation via AI by translating whole components at once. It should also include info about retaining any xss-whitelisted html tags they should not modify in strings, UNLESS wherever html tags are in use in strings, those templates are commented to clearly explain their presence and the need to preserve them, then they don't have to explicitly be explained in the guide, to keep it simpler.

---

## Deferred DB Writes

- Audit all route handlers and wrap non-critical DB writes (last-active timestamp updates, marking notifications as read, etc.) in `res.on('finish')` so they run after the response is sent. *(Best done after all pages are complete)*

---

## Late-Stage Polish

- Delete any unused theme-specific css variables in global.css

- Delete any unused css rules in all stylesheets.

- Double check sure any straggling unused files - scripts, stylesheets, templates, etc. related to the old system are deleted.

- Add `<link rel="modulepreload">` for each page's JS entry points in its Nunjucks template. *(Do last, once every page's import graph is finalized)*

- Consider `@view-transition` if there's white flashes between page loads.

- Optional: Implement the audio autoplay fallback: detect when the browser has blocked audio before the first user gesture and display a muted indicator in the header (similar to Lichess's approach).
