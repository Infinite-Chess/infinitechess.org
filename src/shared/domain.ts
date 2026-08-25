// src/shared/domain.ts

/**
 * Shared domain types and schemas between server and client: the vocabulary of games,
 * seeks and pages, independent of how it happens to be delivered.
 *
 * A schema belongs here if more than one transport needs it — HTTP, SSR, or both websocket
 * directions. A schema that exists ONLY as websocket message contents belongs with the
 * direction it travels instead: serverbound.ts (client → server) or clientbound.ts
 * (server → client), beside the route union that carries it.
 *
 * This file sits at the TOP of the shared ladder: nothing under chess/ may import from
 * here, so a schema the chess layer also needs is owned down there instead, beside the
 * vocabulary it describes.
 */

import type { ValidEngine } from './chess/engines/engine.js';
import type { TimeControl } from './chess/util/clockutil.js';
import type { GameConclusion } from './chess/util/winconutil.js';
import type { GameStateVariant } from './chess/variants/variantselection.js';
import type { Player, PlayerGroup } from './util/typeutil.js';

import * as z from 'zod';

import typeschemas from './chess/util/typeschemas.js';
import { RatingSchema } from './chess/util/metadatautil.js';
import { TimeControlSchema } from './chess/util/clockutil.js';
import { OutSeekVariantSchema } from './chess/variants/variantselection.js';
import { GameModifierSchema, GameModifier } from './util/modutil.js';

// Common Helper Schemas -------------------------------------------------------

/** Whether a game is casual or rated. */
export type GameMode = z.infer<typeof GameModeSchema>;
export const GameModeSchema = z.enum(['casual', 'rated']);

/** The username container of an seek sent by the server. DIFFERENT FROM UsernameContainerProperties!!!! */
export type ServerUsernameContainer = z.infer<typeof ServerUsernameContainerSchema>;
const ServerUsernameContainerSchema = z.strictObject({
	type: z.enum(['player', 'guest', 'engine']),
	username: z.string(),
	/** The rating of the user. Falls back to the INFINITY leaderboard. */
	rating: RatingSchema.optional(),
});

// Game Helper Schemas ---------------------------------------------------------

/** The id of an online game. */
export const GameIDSchema = z.number().int().nonnegative();

// Game State Types ------------------------------------------------------------

// Plain types, not schemas: these travel over HTTP and SSR, which the client casts
// rather than validates — nothing ever parses them. See the note at the top of the file.

/**
 * The static setup of a game: how it was configured at creation — variant, clock settings,
 * modifiers, creation time. Unchanging for the game's whole life. SSR'd into `gamePageData`
 * (and the `setup` of {@link StaticGameState} for the side bar / dead-game HTTP), so it is
 * never sent over the subscribe socket — the client already has it by game-load time.
 */
export interface StaticGameSetup {
	variant: GameStateVariant;
	timeControl: TimeControl;
	/** Epoch milliseconds the game was created. */
	timeCreated: number;
	/** The modifiers applied to this game. Absent if none. */
	modifiers?: GameModifier[];
}

/**
 * A game's {@link StaticGameSetup} plus its display fields (rated, players) and current conclusion.
 * Used by the SSR side bar and the dead-game HTTP path. Everything here is static & unchanging
 * since the game's inception EXCEPT the gameConclusion.
 */
export interface StaticGameState {
	// Kept whole so it can be forwarded to the client channel without field-by-field copying.
	setup: StaticGameSetup;
	rated: boolean;
	/** Per-color username container, with rating embedded per player. */
	players: PlayerGroup<ServerUsernameContainer>;
	gameConclusion?: GameConclusion;
}

/**
 * The full state of a DEAD (concluded) game, served over HTTP (`GET /api/game/:id`).
 * Built from DB columns only — the server does not parse the ICN.
 */
export interface DeadGameState extends StaticGameState {
	/**
	 * Source of truth for moves + clock stamps (+ start position
	 * only for custom-position games); the client parses it.
	 */
	icn: string;
}

// Seek Schemas ----------------------------------------------------------------

/** The number of digits generated seek IDs are. */
export const SEEK_ID_LENGTH = 5;
/** Seek ID: Base36 alphanumeric, fixed length of 5. */
export type SeekId = z.infer<typeof SeekIdSchema>;
export const SeekIdSchema = z
	.string()
	.length(SEEK_ID_LENGTH)
	.regex(/^[0-9a-z]+$/);

/** Shared info for all lobby game seek types. (excludes variant) */
export type BaseSeek = z.infer<typeof BaseSeekSchema>;
const BaseSeekSchema = z.strictObject({
	id: SeekIdSchema,
	player: ServerUsernameContainerSchema,
	color: z.union([typeschemas.PlayerSchema, z.literal(null)]),
	time: TimeControlSchema,
	mode: GameModeSchema,
	modifiers: z.array(GameModifierSchema).optional(),
});

/** The version of seeks broadcast to lobby viewers. */
export type OutSeek = z.infer<typeof OutSeekSchema>;
export const OutSeekSchema = BaseSeekSchema.extend({
	variant: OutSeekVariantSchema,
});

// SSR Page Data ---------------------------------------------------------------

/** SSR→client channel info marking the game page's game as an engine game. */
export interface EngineGamePageInfo {
	engine: ValidEngine;
	/** The engine's strength level for this game. */
	strengthLevel: number;
	/**
	 * Hashed URL of the checkmate-practice engine worker script (from the asset manifest).
	 * Present only while the game is still live — a concluded engine game has nothing left to run.
	 */
	workerUrl?: string;
	/**
	 * Content-versioned URL of the unbundled engine glue (`/engine/<hash>/apeiron.js`), from the manifest.
	 * Present only while the game is still live — a concluded engine game has nothing left to run.
	 */
	engineUrl?: string;
}

/** Static game-page data injected by the server. */
export interface GamePageData extends StaticGameSetup {
	id: number;
	isLive: boolean;
	/** The viewer's color if they're a participant — what they're allowed to move. */
	role?: Player;
	/** The side of the board the viewer sees it from, overridable by the URL's color segment. */
	viewColor: Player;
	engineGame?: EngineGamePageInfo;
}
