# Home/Index Page Localization Plan

## Context

The home/index page needs every English string localized through the per-component translation system documented in [TRANSLATION_SYSTEM.md](./TRANSLATION_SYSTEM.md). Strings on the home page come from three places:

1. The Nunjucks template ([src/server/views/index.njk](../../src/server/views/index.njk)).
2. Client-side TypeScript in [src/client/scripts/esm/views/index/](../../src/client/scripts/esm/views/index/).
3. Server-side splash texts hardcoded in [src/server/routes/splashTexts.ts](../../src/server/routes/splashTexts.ts) (~130 entries, randomly picked per request and passed to the template as `splashText`).

The legacy `[index]` block in [translation/en-US.toml](../../translation/en-US.toml) is orphaned (it describes a "what is it / how to / about" page layout that no longer exists in the current template).

**Assumed already in place** (delivered by a separate infrastructure pass):
- A `translation/shared/<lang>.toml` component that is auto-injected into every page via `layout.njk`. It contains:
  - `[client.variants]` with `<code> = "Display Name"` for each variant (flat map — no per-variant description; only group-level descriptions exist)
  - `[client.variant_groups.<code>]` with `name` and `description` for each group (including `custom`)
  - `[client.speeds.<code>]` — speed category labels (bullet/blitz/rapid/classical/correspondence)
  - `[client.game_modes]` — `casual`, `rated`
  - `[client.sides]` — `white`, `black`, `random` (capitalized)
  - `[client.win_conditions]` — `royalcapture`, `allroyalscaptured`, `allpiecescaptured`, `koth`
  - `[client.modifiers.<code>]` — `name` and parameterized `description`
  - `[client.variant_preview]` — narrative phrasing for the variant preview tooltip's rules list
- A `src/shared/util/format.ts` interpolation helper: `format(template, vars)` substitutes `{key}` placeholders.
- The variant registry ([src/shared/chess/variants/variantregistry.ts](../../src/shared/chess/variants/variantregistry.ts)) no longer carries variant descriptions, group names, or group descriptions in code (English variant **names** stay for ICN metadata).
- The modifier registry ([src/shared/util/modutil.ts](../../src/shared/util/modutil.ts)) no longer carries `name` or `getDescription` in its entries; the helpers `getModifierName(code)` and `getModifierDescription(modifier)` read from `t.shared.modifiers.<code>` and `format()` the description.
- [variantPreviewTooltip.ts](../../src/client/scripts/esm/game/rendering/variantPreviewTooltip.ts) reads all narrative + win-condition labels from `t.shared.variant_preview.*` and `t.shared.win_conditions.*`.
- `t.shared` and `window.t.shared` are populated on every page (including the index).

This plan covers the home-page-specific work: creating two new TOMLs (`splashes` and `index`), wiring `index.njk` and the index-page client scripts to use them, and cleaning up legacy keys.

## New TOML files

### `translation/splashes/en-US.toml`

Splash texts are stored as a `[splashes]` table of individually-keyed strings. Only English needs to be maintained; other languages are optional.

```toml
[splashes]
splash_1 = "Chess without borders"
splash_2 = "Chess on an infinite plane"
splash_3 = "Open world Chess!"
# ...all ~130 entries copied from the current splashTexts.ts list, keyed splash_1..splash_N
```

Numeric-suffixed keys are intentionally generic — splash text identities don't matter, only their values. Weblate exposes each table entry as a separately translatable string (its TOML adapter does not expose array elements individually, which is why a table is used here rather than a `splashes = [...]` array).

**No `[client]` table.** Splashes are picked server-side before SSR, so the strings don't need to ship to the browser.

Some current entries contain inline HTML (e.g. `<span class="lc">ω</span>`). The loader's XSS filter whitelists `em / strong / b / i / br` — **`span` is not whitelisted**. Confirm whether any current splash strings rely on `<span>` or other non-whitelisted tags by grepping `splashTexts.ts` before migrating. Three options if there are offenders:
- (a) Rewrite those splashes to use only whitelisted tags or plain text.
- (b) Extend the whitelist in `componentTranslationLoader.ts` to include `span` (and possibly a `class` attribute) — wider blast radius, affects every component.
- (c) Keep the HTML-bearing splashes hardcoded in code and only migrate plain-text ones.

Decision needed during implementation; (a) is preferred unless there's a strong reason a splash needs styling.

### `translation/index/en-US.toml`

Page-specific strings only. Structure:

```toml
[hero]
title = "Infinite Chess"

[new_player_prompt]
label = "New?"
tutorial_button = "Take the tutorial"
dismiss_button = "I'm experienced"

[lobby]
title = "Lobby"
viewer_count_tooltip = "Viewer count"
idle_overlay = "Hover to reconnect."

[lobby_table]
player = "Player"
variant = "Variant"
time = "Time"
mode = "Mode"

[lobby_buttons]
create_online = "Create online game"
challenge_friend = "Challenge a friend"
play_computer = "Play against computer"

[modal]
title = "Game options"
submit = "Create Game"

[variant_selector]
label = "Variant"
custom_create_name = "Create"
custom_create_desc = "Go to the board editor."
custom_from_icn_name = "From ICN"
custom_from_icn_desc = "Paste an accessible ICN code."
icn_placeholder = "Paste ICN text here"
add_modifier_tooltip = "Add a fun modifier"
edit_tooltip = "Edit position and gamerules"
saved_positions = "Saved positions"
cloud_load_failed = "Failed to load cloud save."
local_load_failed = "Failed to load local save."

[time_control]
label = "Time control"
timed = "Timed"
infinite = "Infinite"
minutes_per_side = "Minutes per side"
increment_seconds = "Increment in seconds"

[game_mode]
label = "Game mode"

[side]
label = "Side"

[strength]
label = "Strength"

[modifiers_section]
label = "Modifiers:"

[client]
# Mirror of every key above that JS reads at runtime. At minimum:
# - lobby_buttons.*           (gameSetupModal.ts sets button textContent on modal open)
# - variant_selector.saved_positions, cloud_load_failed, local_load_failed (variantSelector.ts)
# Recommended: mirror the entire structure for simplicity. The cost is small and avoids
# constantly relitigating "does this string need to ship to the client?"
```

**Note on `[client]` mirroring**: The doc says "the `[client]` block is the **only** part shipped to the browser." Things only read by Nunjucks (e.g. `[hero] title`) don't strictly need to be under `[client]`. But for a page where many strings *are* read by JS, mirroring the whole structure under `[client]` keeps the TOML simple. Mirror everything that's used in JS. Keep purely SSR-only strings (e.g. lobby table headers) outside `[client]` unless they end up needing it.

**Intentionally not translated** (universal across languages, stay hardcoded in the template):
- Time preset button labels: "1+2", "2+2", "3+2", "5+2", "8+3", "10+4", "15+5", "20+6"
- Strength numerals: "1" through "8"
- The "+" separator between minutes and increment

**Intentionally skipped** (out of scope until the underlying features land):
- The two "X not implemented yet" toast errors in [gameSetupModal.ts](../../src/client/scripts/esm/views/index/gameSetupModal.ts) — friend challenge and computer game flows. These strings disappear when those features ship.

## Splash texts wiring

### [splashTexts.ts](../../src/server/routes/splashTexts.ts)

Replace the hardcoded array with a per-request read from the splashes component for the resolved language. The TOML stores entries under `[splashes]` as a table; the server takes `Object.values(...)` to get the list. Pattern (concrete API depends on what the loader exposes):

```ts
import { getTemplateTranslation } from '../config/componentTranslationLoader.js';
import { getLanguageToServe } from '../utility/translate.js';

export function getRandomSplashText(req: express.Request): string {
    const lang = getLanguageToServe(req);
    const entries = (getTemplateTranslation('splashes', lang) as { splashes: Record<string, string> }).splashes;
    const values = Object.values(entries);
    return values[Math.floor(Math.random() * values.length)]!;
}
```

If the loader's current API doesn't expose a getter for non-`[client]` components by language, add one (mirroring `getResponseTranslation`'s shape). The English-fallback path is already handled by `deepMerge` at boot, so a `de-DE` request with no `de-DE` splashes TOML still returns an English splash without extra code.

### [root.ts](../../src/server/routes/root.ts)

Whichever route renders `index.njk` already calls `getRandomSplashText()` and passes the result to the template as `splashText`. The signature changes (takes `req` now), but the call site is a one-line edit. No template change needed since the template still receives a single `splashText` string.

## Template wiring — [index.njk](../../src/server/views/index.njk)

1. At the top of the body block, add:
   ```njk
   {% set t = templateT('index') %}
   ```

2. In the `{% block head %}`, inject the index component into `window.t` (preserving the existing `window.t` that `layout.njk` set):
   ```njk
   <script>window.t = Object.assign(window.t || {}, { index: {{ clientT('index') | json | safe }} });</script>
   ```

3. Replace every hardcoded English string with `{{ t.<section>.<key> }}`. Section-by-section:

   - **Hero** (current lines 50–56): `<h1>{{ t.hero.title }}</h1>`. The `{{ splashText | safe }}` line stays as-is — splash text is already injected by the route.

   - **New-player prompt** (lines 59–65): label, tutorial link text, dismiss button text.

   - **Lobby header & idle overlay** (lines 85–96): `t.lobby.title`, `t.lobby.viewer_count_tooltip` (in the `title` attribute), `t.lobby.idle_overlay`.

   - **Lobby table headers** (lines 103–108): `t.lobby_table.player`, `.variant`, `.time`, `.mode`.

   - **Lobby action buttons** (lines 70–82): emit these buttons with **no text content** (empty inner text). JS owns the labels via `t.index.lobby_buttons.*` on modal open. Leave any IDs / data attributes / icons in place — only the text disappears from the template.

   - **Modal title & submit** (lines 154, 317): `t.modal.title`, `t.modal.submit`.

   - **Variant selector section** (lines 165–214):
     - Section label: `t.variant_selector.label`.
     - The `variantGroupItem()` macro iterates `variantGroups`. For each group, render the name and description from the *shared* TOML: `templateT('shared').variant_groups[group.group].name` and `.description`. (Or equivalent helper — the macro will need access to the shared object; pass it in as a macro argument.) **Phase A note:** this macro signature change and the shared-translation lookups for variant/group display are owned by Phase A (infrastructure); Phase B inherits the new pattern.
     - For each variant inside a group, render the display name from `templateT('shared').variants[variant.code]` (flat string lookup, no description field).
     - The hardcoded "Custom" group entries (lines 178–180, 193–196): replace `"Custom"` and `"Your own position, your own rules."` with `templateT('shared').variant_groups.custom.name` / `.description`.
     - Hardcoded "Create" / "From ICN" entries inside the custom panel are page-specific (they're index-only UX, not reusable codes), so they go in **index** TOML, not shared: `t.variant_selector.custom_create_name`, `.custom_create_desc`, `.custom_from_icn_name`, `.custom_from_icn_desc`.
     - ICN textarea placeholder (line 211): `placeholder="{{ t.variant_selector.icn_placeholder }}"`.
     - Two icon-button tooltips (lines 171–172): `data-tooltip="{{ t.variant_selector.add_modifier_tooltip }}"` and `.edit_tooltip`.

   - **Modifiers section** (lines 216–226): `t.modifiers_section.label` (`"Modifiers:"`). The modifier list itself ("Slide Limit" etc.) is rendered from the modifier registry — already wired through shared by the infrastructure pass.

   - **Time control section** (lines 230–265): `t.time_control.label`, `.timed`, `.infinite`, `.minutes_per_side`, `.increment_seconds`. The "+" separator (line 247) and the eight preset buttons stay hardcoded.

   - **Game mode section** (lines 270–277): `t.game_mode.label` for the section header. Button text comes from `templateT('shared').game_modes.casual` / `.rated`.

   - **Side section** (lines 279–297): `t.side.label` for the section header. White/Random/Black button text comes from `templateT('shared').sides.white` / `.random` / `.black`.

   - **Strength section** (lines 299–312): `t.strength.label` for the section header. The eight numeric buttons stay hardcoded.

4. After changes: run the page in a browser and inspect the rendered HTML to confirm no English strings slipped through.

## JS swaps in [src/client/scripts/esm/views/index/](../../src/client/scripts/esm/views/index/)

### [gameSetupModal.ts](../../src/client/scripts/esm/views/index/gameSetupModal.ts)

- **Delete** the `SUBMIT_LABELS` constant (currently lines 30–34).
- The function that opens the modal and sets the lobby button label needs to read from `t.index.lobby_buttons` instead. The three modal-mode keys map to:
  - `'create-online'` → `t.index.lobby_buttons.create_online`
  - `'challenge-friend'` → `t.index.lobby_buttons.challenge_friend`
  - `'play-computer'` → `t.index.lobby_buttons.play_computer`
- The two "...not implemented yet" toast errors stay hardcoded — out of scope.

### [variantSelector.ts](../../src/client/scripts/esm/views/index/variantSelector.ts)

- "Saved positions" header in the snabbdom VNode (around line 290): replace the hardcoded string with `t.index.variant_selector.saved_positions`.
- "Failed to load cloud save." (around line 270): replace with `t.index.variant_selector.cloud_load_failed`.
- "Failed to load local save." (around line 279): replace with `t.index.variant_selector.local_load_failed`.

### Other index scripts

- [index.ts](../../src/client/scripts/esm/views/index/index.ts), [newPrompt.ts](../../src/client/scripts/esm/views/index/newPrompt.ts), [timeControls.ts](../../src/client/scripts/esm/views/index/timeControls.ts), [modifierSelector.ts](../../src/client/scripts/esm/views/index/modifierSelector.ts), [lobby.ts](../../src/client/scripts/esm/views/index/lobby.ts), [seekPreviewCache.ts](../../src/client/scripts/esm/views/index/seekPreviewCache.ts): no user-facing English strings to migrate (verify with a grep — anything found should go to `t.index.<section>.<key>`).

## Legacy cleanup

1. **Index orphans**: before deleting, grep the codebase for these keys to confirm zero references:
   - `index.title`, `index.secondary_title`, `index.what_is_it_title`, `index.what_is_it_pargaraphs` (note the typo), `index.how_to_title`, `index.how_to_paragraph`, `index.about_title`, `index.about_paragraphs`, `index.patreon_title`, `index.github_title`, `index.javascript.contribution_count_singular`, `index.javascript.contribution_count_plural`.
   
   If zero references, delete the `[index]` (and `[index.javascript]`) block from:
   - [translation/en-US.toml](../../translation/en-US.toml)
   - All sibling language files: `de-DE.toml`, `el-GR.toml`, `es-ES.toml`, `fi-FI.toml`, `fr-FR.toml`, `pl-PL.toml`, `pt-BR.toml`, `ru-RU.toml`, `zh-CN.toml`, `zh-TW.toml`.
   
   Per [CLAUDE.md](../../CLAUDE.md), only the English file is actively maintained — but the orphan blocks should be removed from non-English files too so they don't carry dead keys forward.

2. Do **not** touch the legacy variant/modifier/speed translation blocks here — those were removed by the infrastructure pass.

## Type generation

After all the above, run `npm run generate:types`. The generated [client-translations.d.ts](../../src/client/types/client-translations.d.ts) will gain a `t.index.*` namespace. (`splashes` has no `[client]` table → no type entry, which is intentional.)

## Verification

1. `npm run generate:types` — `t.index.*` and `t.shared.*` autocompete in client scripts.
2. `npm run type-check --silent` — clean.
3. `npm run lint --silent` — clean (or improvements only).
4. Restart the dev server (TOML changes require a boot pass through the loader).
5. Load `/` and verify:
   - Hero shows a splash text. Refresh several times to confirm rotation works and the array is being read.
   - New-player prompt: label, tutorial button, dismiss button all render with the right text.
   - Lobby: title, "Hover to reconnect." overlay, viewer-count tooltip, all four table headers.
   - The three lobby action buttons render with text — confirms JS read from `t.index.lobby_buttons.*` succeeded.
   - Open the game setup modal:
     - "Game options" title, "Create Game" submit button.
     - Variant section: section label, every preset variant's name + description (from shared), the "Custom" group, and inside it "Create" / "From ICN" rows with their descriptions.
     - ICN textarea placeholder reads correctly.
     - Two icon-button tooltips reveal on hover.
     - Time control: section label, Timed/Infinite toggle, "Minutes per side", "Increment in seconds", preset buttons (unchanged English).
     - Game mode: section label + Casual / Rated buttons.
     - Side: section label + White / Random / Black buttons.
     - Strength: section label + numeric buttons.
     - Modifiers: section label "Modifiers:" + "Slide Limit" entry.
   - Hover a variant in the selector — preview tooltip shows variant name + description (from shared) and the rules narrative (already wired by infrastructure).
   - Hover a custom seek in the lobby — variant preview tooltip works.
   - Trigger the cloud / local load failure error paths in `variantSelector.ts` (e.g. by mocking a fetch failure) — confirm the translated error text appears.
6. Set the `i18next` cookie to a language with no overrides yet (e.g. `de-DE`) and reload — confirm English fallback for any not-yet-translated keys (deepMerge handles this at load time, so missing keys should never crash).
7. **Splash HTML check**: visually scan the splash texts that contain inline HTML to ensure the XSS whitelist didn't strip styling unexpectedly. If a `<span>` got stripped, decide between the three options noted in the splashes TOML section.
8. Inspect `view-source:` on `/` and confirm no orphan English strings remain in the rendered HTML.

## Critical files

**New:**
- `translation/splashes/en-US.toml`
- `translation/index/en-US.toml`

**Modified:**
- [src/server/views/index.njk](../../src/server/views/index.njk) — `templateT('index')`, head-block `window.t.index` injection, every English string replaced with translation references, lobby buttons emitted with empty text content, variant section consumes shared variant/group strings via the macro.
- [src/server/routes/splashTexts.ts](../../src/server/routes/splashTexts.ts) — read splash table entries from the `splashes` component instead of a hardcoded list; signature gains the request.
- [src/server/routes/root.ts](../../src/server/routes/root.ts) — pass `req` to `getRandomSplashText()` (one-line edit).
- [src/client/scripts/esm/views/index/gameSetupModal.ts](../../src/client/scripts/esm/views/index/gameSetupModal.ts) — drop `SUBMIT_LABELS`; read button labels from `t.index.lobby_buttons.*`.
- [src/client/scripts/esm/views/index/variantSelector.ts](../../src/client/scripts/esm/views/index/variantSelector.ts) — swap "Saved positions" and the two load-failure messages to `t.index.variant_selector.*`.
- [translation/en-US.toml](../../translation/en-US.toml) plus all sibling `translation/<lang>.toml` files — delete the orphaned `[index]` and `[index.javascript]` blocks.

## Open questions to resolve during implementation

1. **Splash HTML compatibility**: do any current splashes use tags outside the `em / strong / b / i / br` whitelist? If so, choose between rewriting them, extending the whitelist, or keeping HTML-bearing ones in code. The shared decision affects both the splashes TOML and possibly `componentTranslationLoader.ts`.
2. **Macro signature for variant rendering**: the `variantGroupItem()` macro needs access to the shared variant/group translations. Cleanest is to pass the shared object as a macro argument from the page template. Confirm the macro signature change is local and doesn't break other callers (grep for macro usage first).
3. **`getTemplateTranslation` for non-`[client]` access from non-template code**: confirm the loader's API exposes (or can be extended to expose) a getter for non-`[client]` component data by language, for `splashTexts.ts`. If not, add it.
