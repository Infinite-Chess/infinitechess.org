// src/client/scripts/esm/views/game/game.ts

/**
 * Client entry for the game page (/game/:id).
 *
 * For now it only reads the SSR-injected `window.gamePageData` channel to prove the wiring.
 * Loading and rendering the game (live socket subscribe / dead fetch) are later tasks.
 */

console.debug('Game page data:', window.gamePageData);
