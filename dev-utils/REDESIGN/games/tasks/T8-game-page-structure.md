# T8 — Game-page UI structure (canvas + side bar)

Part of the game-page redesign (see `../requirements.md`). Build the **static structure** of the game page on top of the T3 shell: the WebGL `<canvas>` play area and the side bar (clocks, move history, chat, material). Markup + CSS layout only — **no game logic, no rendering, no data wiring** (that's T9, client render).

## Requirements

- One vertical bar on the left, spanning top to bottom, with clocks, moves, and chat, and material lost per side (take inspiration from how the variant preview tooltips render little silhouettes of the pieces when there is a promotion gamerule override).
- Game canvas covers the remaining right side of the screen, spanning from top to bottom.
- Game history moves bar: Lichess style. Each move is prepended with a tiny silhouette of the piece type that moved (take inspiration from variant preview tooltips again). Move coordinates too long are truncated, but hovering over them shows the full coordinates via the title attribute.

## MUST consult the user on the side-bar design

This is a UI-design task. **Do not invent the side-bar layout.** Before writing the markup/CSS, ask the user how they want the side bar — and build to their answers. Use `dev-utils/REDESIGN/design.md` "## Games" as the starting reference, not as a finished spec. Questions to resolve with the user (at least):

- Overall arrangement: side bar on the right (Lichess-style) vs. left; fixed width vs. proportional; canvas fills the rest?
- Which regions are present now and their vertical order: player/clock blocks (top & bottom, per color), move-history list, chat, material-lost-per-side. Which to scaffold now vs. defer?
- Move-history list: Lichess-style rows (tiny piece silhouette + move; long coordinates truncated with full value on hover via `title`) — confirm the structure.
- Responsive behavior: what happens on narrow/portrait screens (stack? collapse the bar? tabs?).
- Whether the three game *states* (open invite / live / over) change the side-bar structure, or just its populated content (content/behavior is T9 regardless — but structure may need slots).

Present concrete options (ASCII mockups are fine) and let the user choose before building.

## Scope (after the consultation)

- **`src/server/views/game.njk`** — replace the empty `<main>` with the canvas + side-bar structure the user approved. Static markup only: a `<canvas>` for the board, and side-bar containers/regions as empty, clearly-classed placeholders (populated by T9). Use Nunjucks `{% include %}` for any reusable sub-component (e.g. a username/clock block) if it fits existing conventions.
- **`src/client/css/game.css`** — the layout under the single top-level `.game { }` block: canvas sizing/positioning, side-bar dimensions, and the agreed responsive behavior. Theme via the existing `[data-theme]` CSS variables.
- The `<canvas>` is just the element (id/class for T9 to grab). Do **not** initialize WebGL or any rendering here.

## Out of scope / deferred

- All game logic, WebGL/board rendering, clocks counting, move-list population, chat behavior (T9).
- Loading state from the socket/HTTP, the slim client entry, role/spectator view differences (T9).
- The open-invite and game-over *content* (T9 / later); structure may include slots if the user wants, but no behavior.

## Constraints

- Markup + CSS only; the page must still render (empty regions) and pass checks.
- Follow `CLAUDE.md` + `stack.md`: per-page stylesheet with one top-level block, short descriptive nested class names (no BEM), semantic theme variables, tabs.
- Keep it the agreed structure — don't over-build regions the user chose to defer.

## Acceptance

- `npm run type-check --silent` passes.
- `npm run lint --silent` passes (fix any pre-existing warning touched).
- The client build succeeds; `/game/<valid id>` renders the canvas + side-bar structure (empty regions) matching what the user approved, with the agreed responsive behavior. No game/rendering behavior is present.
