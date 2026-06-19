# T1 — Sound completion signal

Part of the game-page redesign (see `../requirements.md`). This is the first, fully-additive task: nothing else exists yet that depends on it. It does **not** wire any new sound into any flow — it only adds the *ability* to know when a sound has finished, which T8 (gamestart notify) will later consume.

## Goal

Expose a promise that resolves when a played sound has fully finished — **including effect tails** (e.g. reverb), so a caller can await it before doing something disruptive like a hard page navigation that would otherwise cut the sound off.

## Background

- `src/client/scripts/esm/audio/AudioManager.ts`
  - `playAudio(buffer, options)` returns a `SoundObject | undefined` whose `.source` is a native `AudioBufferSourceNode`.
  - It already computes the sound's full lifetime (source duration + longest effect tail + delay) inside `scheduleDisconnection()`, which sets a single `setTimeout` at `totalLifetimeMillis` to disconnect the nodes. That timer is the exact moment everything (including the reverb tail) is done.
- `src/client/scripts/esm/game/misc/gamesound.ts`
  - `playSoundEffect()` calls `AudioManager.playAudio` but returns `Promise<void>` and discards the `SoundObject`. All current callers (`movesound.ts`, the named `play*` helpers) ignore the return value, so widening it is backward-compatible.

## Required changes

1. **`AudioManager.ts` — add a completion promise to `SoundObject`.**
   - Add a `whenEnded: Promise<void>` field to the `SoundObject` interface, documented as resolving once the sound and all its effect tails have fully finished.
   - In `playAudio`, create the promise and resolve it at `totalLifetimeMillis` — **reuse the existing single timer in `scheduleDisconnection`**, do not add a second timer or duplicate the duration math. Pass a resolve callback into `scheduleDisconnection` (or have it return the lifetime) so the one `setTimeout` both disconnects nodes and resolves `whenEnded`.
   - **Do not use `source.onended` instead.** That native event fires at the end of the *note*, before the reverb tail decays, so it would cut the tail off. We intentionally resolve at the full lifetime (note + tail) — consistent with how `scheduleDisconnection` already keeps tails alive before disconnecting. (The lifetime math ignores `playbackRate`, which is fine: notify sounds play at rate 1.)
   - Looping sounds: `scheduleDisconnection` early-returns for `loop`, so `whenEnded` for a looping sound never resolves. That is correct (a loop never ends) — note it in the field's jsdoc.

2. **`gamesound.ts` — surface the `SoundObject`.**
   - Change `playSoundEffect` to return `Promise<SoundObject | undefined>` instead of `Promise<void>`: return the result of `AudioManager.playAudio`. The early-return / failure paths return `undefined`.
   - Import the `SoundObject` type from its source in `AudioManager.ts` (do not re-export it elsewhere — reference the source per project rules).
   - Leave the named `play*` helpers (`playViola_c3`, `playMarimba`, etc.) returning `void`; they don't need completion.

## Out of scope

- Choosing/adding the gamestart notify sound (that's T8).
- Any navigation, lobby, or seek code.
- A timeout cap — the 1.5s race lives at the call site in T8, not here.

## Constraints

- Follow `CLAUDE.md`: no redundancy (one timer, shared duration math), tight jsdoc, tabs, reference source types (never re-export).
- Purely additive: existing sounds must behave exactly as before.

## Acceptance

- `npm run type-check --silent` passes.
- `npm run lint --silent` passes (fix any pre-existing warning touched).
- No behavior change to any existing sound; `whenEnded` is available on the returned `SoundObject` and resolves after the sound + tail complete.
