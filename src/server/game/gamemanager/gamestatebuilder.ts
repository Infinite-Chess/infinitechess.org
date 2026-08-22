// src/server/game/gamemanager/gamestatebuilder.ts

/**
 * Projects a live {@link ServerGame} outward: into the SSR page state, the wire
 * messages clients receive, and the ICN metadata a finished game is logged with.
 *
 * Pure builders — nothing here sends, persists, or mutates the game.
 * `deadgamestate.ts` builds the same page state for games that only exist in the DB.
 */

import type { RatingData } from '../../utility/ratingcalculation.js';
import type { MoveRecord } from '../../../shared/chess/logic/movepiece.js';
import type { ServerGame } from './servergametypes.js';
import type { AuthMemberInfo } from '../../types.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type { SourceVariantMetaData } from '../../../shared/chess/util/metadatautil.js';
import type {
	GameConclusionMessage,
	GameStateBase,
	GameStateMessage,
	ParticipantState,
	RematchOfferInfo,
} from '../../../shared/clientbound.js';
import type {
	SeekVariant,
	StaticGameSetup,
	StaticGameState,
	MetaData,
	MovePacket,
	Rating,
	ServerUsernameContainer,
} from '../../../shared/domain.js';

import uuid from '../../../shared/util/uuid.js';
import gameurl from '../../../shared/util/gameurl.js';
import timeutil from '../../../shared/util/timeutil.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import winconutil from '../../../shared/chess/util/winconutil.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import variantregistry from '../../../shared/chess/variants/variantregistry.js';
import { players as p } from '../../../shared/chess/util/typeutil.js';
import { getFormattedEngineName } from '../../../shared/chess/engine.js';
import {
	Leaderboards,
	getLeaderboardOfVariant,
} from '../../../shared/chess/variants/validleaderboard.js';

import tconfig from '../../config/translationconfig.js';
import drawoffers from './drawoffers.js';
import gameutility from './gameutility.js';
import memberinfoutil from '../../utility/memberinfoutil.js';
import ratingcalculation from '../../utility/ratingcalculation.js';
import { getScriptTranslations } from '../../config/componentTranslationLoader.js';
import { getEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';

// Ratings ---------------------------------------------------------------------------------------

/**
 * Returns the current elo of all players in the game on the leaderboard
 * of the variant being played, or the INFINITY leaderboard if the variant does not have a leaderboard.
 * @returns An object containing the rating for non-guests in the game, and whether we are confident in that rating, IF the variant has a leaderboard.
 * @throws If a database error occurs (from {@link getEloOfPlayerInLeaderboard}).
 */
function getRatingDataForGamePlayers(
	players: PlayerGroup<{ identifier: AuthMemberInfo }>,
	variant: SeekVariant,
): PlayerGroup<Rating> {
	// Fallback to INFINITY leaderboard if the variant does not have a leaderboard.
	const leaderboardId = getLeaderboardOfVariant(variant) ?? Leaderboards.INFINITY;

	const ratingData: PlayerGroup<Rating> = {};
	for (const [color, { identifier }] of Object.entries(players)) {
		if (!identifier.signedIn) continue; // Not a member, no rating to send
		const user_id = identifier.user_id;
		ratingData[Number(color) as Player] = getEloOfPlayerInLeaderboard(user_id, leaderboardId);
	}

	return ratingData;
}

/**
 * The per-player rating deltas for client display,
 * or undefined if the game isn't a finalized rated one.
 */
function getRatingChanges(servergame: ServerGame): PlayerGroup<number> | undefined {
	if (!servergame.ratingResults) return undefined;
	const ratingChanges: PlayerGroup<number> = {};
	for (const [color, result] of Object.entries(servergame.ratingResults)) {
		ratingChanges[Number(color) as Player] = result.change;
	}
	return ratingChanges;
}

// SSR Page State --------------------------------------------------------------------------------

/**
 * Assembles the role-agnostic {@link StaticGameState} of a live game (the static side-bar and game info).
 * @throws If a database error occurs (from {@link getRatingDataForGamePlayers}).
 */
function buildStaticState(servergame: ServerGame): StaticGameState {
	const match = servergame.match;

	// Resolve each player's display rating: once a rated game is finalized the leaderboard
	// is already post-calc, so use the retained at-game snapshot. In-progress (and casual)
	// games read live — there the leaderboard rating equals the at-game rating.
	const ratings: PlayerGroup<Rating> = {};
	if (!servergame.ratingResults) {
		Object.assign(ratings, getRatingDataForGamePlayers(match.playerData, match.variant));
	} else {
		for (const [color, result] of Object.entries(servergame.ratingResults)) {
			ratings[Number(color) as Player] = result.ratingAtGame;
		}
	}

	const players: PlayerGroup<ServerUsernameContainer> = {};
	for (const [p, data] of Object.entries(match.playerData)) {
		const color = Number(p) as Player;
		players[color] = memberinfoutil.buildServerUsernameContainer(
			data.identifier,
			ratings[color],
		);
	}
	if (match.engineParticipant) {
		const { color, engine, strengthLevel } = match.engineParticipant;
		players[color] = {
			type: 'engine',
			username: getFormattedEngineName(engine, strengthLevel),
		};
	}

	const state: StaticGameState = {
		setup: buildStaticGameSetup(servergame),
		rated: match.rated,
		players,
	};
	if (servergame.gameConclusion !== undefined) state.gameConclusion = servergame.gameConclusion;
	return state;
}

/**
 * Assembles the {@link StaticGameSetup} of a live game: how it was configured
 * — variant, clock settings, modifiers, creation time. SSR'd into `gamePageData`.
 */
function buildStaticGameSetup(servergame: ServerGame): StaticGameSetup {
	const match = servergame.match;
	return {
		variant: match.variant,
		timeControl: match.clock,
		timeCreated: match.timeCreated,
		modifiers: match.modifiers,
	};
}

// ICN Metadata ----------------------------------------------------------------------------------

/**
 * Assembles the ICN {@link MetaData} of a game on demand from its properties
 * (`match`, `gameConclusion`, ratings). Built only for serialization (ICN logging)
 * — never stored on the game. Metadata is always in English.
 * @param ratingData - Present for a concluded rated game: supplies the pre-calc display
 *   elos + rating diffs. Absent otherwise, in which case display elos are read live from
 *   the leaderboard ("rating immediately before the new rating was calculated").
 */
function buildMetadata(servergame: ServerGame, ratingData?: RatingData): MetaData {
	const { match } = servergame;

	// Resolve each player's display rating: from the pre-calc snapshot
	// when logging a rated game, else read live from the leaderboard.
	const ratings: PlayerGroup<Rating> = {};
	if (ratingData) {
		for (const [color, rd] of Object.entries(ratingData)) {
			ratings[Number(color) as Player] = {
				value: rd.elo_at_game,
				confident:
					rd.rating_deviation_at_game <= ratingcalculation.UNCERTAIN_LEADERBOARD_RD,
			};
		}
	} else {
		Object.assign(ratings, getRatingDataForGamePlayers(match.playerData, match.variant));
	}

	const scriptT = getScriptTranslations('shared', tconfig.DEFAULT_LANGUAGE); // Game metadata should only ever be in English
	const variantCode = gameutility.getVariantCode(match.variant);
	// Names the GAME: a custom game is a "Custom Variant" game no matter what it's a position of.
	const variantEnglishName = variantregistry.getVariantName(variantCode, scriptT);
	// These name the POSITION instead: which variant, at which revision of it, it was lifted from —
	// a date that may long predate this game, so a custom game's are carried over verbatim from its
	// seek rather than derived from its start. The game's own start time is a `games` table column.
	const sourceVariant: SourceVariantMetaData =
		match.variant.kind === 'preset'
			? {
					Variant: variantEnglishName,
					...timeutil.convertTimestampToUTCDateUTCTime(match.timeCreated),
				}
			: metadatautil.trimToSourceVariantMetadata(
					icnconverter.ShortToLong_Format(match.variant.position).metadata,
				);

	const getPlayerName = (color: Player): string => {
		if (match.engineParticipant?.color === color)
			return getFormattedEngineName(
				match.engineParticipant.engine,
				match.engineParticipant.strengthLevel,
			);
		const identity = match.playerData[color]!.identifier;
		return identity.signedIn ? identity.username : metadatautil.GUEST_NAME_ICN_METADATA;
	};

	const metadata: MetaData = {
		Event: `${match.rated ? 'Rated' : 'Casual'} ${variantEnglishName} infinite chess game${match.engineParticipant ? ' against an engine' : ''}`,
		Site: gameurl.getAbsoluteGameUrl(match.id),
		GameId: uuid.base10ToBase62(match.id),
		Round: '-',
		White: getPlayerName(p.WHITE),
		Black: getPlayerName(p.BLACK),
		TimeControl: match.clock,
		...sourceVariant,
	};
	// ID + display elo, present only for signed-in players.
	const white = match.playerData[p.WHITE]?.identifier;
	const black = match.playerData[p.BLACK]?.identifier;
	if (white?.signedIn) {
		metadata.WhiteID = uuid.base10ToBase62(white.user_id);
		if (ratings[p.WHITE]) metadata.WhiteElo = metadatautil.getFormattedElo(ratings[p.WHITE]!);
	}
	if (black?.signedIn) {
		metadata.BlackID = uuid.base10ToBase62(black.user_id);
		if (ratings[p.BLACK]) metadata.BlackElo = metadatautil.getFormattedElo(ratings[p.BLACK]!);
	}

	if (servergame.gameConclusion) {
		metadata.Result = metadatautil.getResultFromVictor(servergame.gameConclusion.victor);
		metadata.Termination = winconutil.getTerminationInEnglish(
			servergame.gameRules,
			servergame.gameConclusion.condition,
		);
	}
	if (ratingData) {
		metadata.WhiteRatingDiff = metadatautil.getWhiteBlackRatingDiff(
			ratingData[p.WHITE]!.elo_change_from_game!,
		);
		metadata.BlackRatingDiff = metadatautil.getWhiteBlackRatingDiff(
			ratingData[p.BLACK]!.elo_change_from_game!,
		);
	}

	return metadata;
}

// Wire Messages ---------------------------------------------------------------------------------

/**
 * Builds the recipient-agnostic {@link GameStateBase} — the live move list, clocks, conclusion, and
 * finalized flag. The core of every `gamestate` message — the `subscribe` reply and live pushes.
 * @param forceSync - Set true ONLY when the server rejected the client's last move,
 * to force their move list to match exactly. Omitted from the message when false.
 */
function buildStateBase(servergame: ServerGame, forceSync = false): GameStateBase {
	const base: GameStateBase = {
		finalized: servergame.match.finalized,
		moves: servergame.moves.map((m) => simplifyMove(m)),
	};
	if (!servergame.untimed) base.clockValues = gameutility.getClockValues(servergame);
	if (servergame.gameConclusion !== undefined) base.gameConclusion = servergame.gameConclusion;
	const ratingChanges = getRatingChanges(servergame);
	if (ratingChanges) base.ratingChanges = ratingChanges;
	if (forceSync) base.forceSync = true;
	return base;
}

/**
 * Builds a full {@link GameStateMessage} for one participant: the agnostic base plus their
 * participant overlay. Used for every participant `gamestate` message (subscribe reply and pushes).
 */
function buildStateMessage(
	servergame: ServerGame,
	role: Player,
	forceSync: boolean,
): GameStateMessage {
	return {
		...buildStateBase(servergame, forceSync),
		participantState: getParticipantState(servergame, role),
	};
}

/**
 * Builds the `gameconclusion` message: the result plus the game's clock values.
 * MUST set servergame.gameConclusion first!
 */
function buildConclusionMessage(servergame: ServerGame): GameConclusionMessage {
	const message: GameConclusionMessage = { gameConclusion: servergame.gameConclusion! };
	if (!servergame.untimed) message.clockValues = gameutility.getClockValues(servergame);
	return message;
}

/**
 * Simplifies a game's move into the {@link MovePacket} sent over the wire.
 * Clock stamps are deliberately omitted — the game page never reads them;
 * they reach the analysis page through the archived ICN instead.
 */
function simplifyMove(move: MoveRecord): MovePacket {
	return { token: move.token };
}

// Participant Overlay ---------------------------------------------------------------------------

function getParticipantState(servergame: ServerGame, role: Player): ParticipantState {
	const opponentRole = typeutil.invertPlayer(role);
	const now = Date.now();
	const match = servergame.match;
	const opponentData = match.playerData[opponentRole];

	const participantState: ParticipantState = {
		drawOffer: {
			unconfirmed: drawoffers.isExtendedBy(match, opponentRole), // True if our opponent has extended a draw offer we haven't yet confirmed/denied
			lastOfferPly: drawoffers.getLastOfferPly(match, role), // The move ply WE HAVE last offered a draw, if we have, otherwise undefined.
		},
	};

	// Include other relevant stuff if defined...

	// If their opponent has disconnected and the claim window is set, send them that info too.
	if (opponentData?.disconnect.timeOpponentMayClaim !== undefined) {
		participantState.disconnect = {
			millisUntilClaimable: opponentData.disconnect.timeOpponentMayClaim - now,
			voluntary: opponentData.disconnect.voluntary,
		};
	}

	// Once the game is over it lingers for the rematch handshake — send enough to
	// restore the rematch button's state (glow / disabled) on a page refresh.
	const rematch = getRematchOfferInfo(servergame, role);
	if (rematch !== undefined) participantState.rematch = rematch;

	return participantState;
}

/**
 * The rematch overlay for a color once the game is over: whether the opponent has an outstanding
 * offer (glow) and whether they're connected (button enabled). Undefined while the game is live.
 */
function getRematchOfferInfo(servergame: ServerGame, role: Player): RematchOfferInfo | undefined {
	if (!gameutility.isGameOver(servergame)) return undefined;
	// An engine is always present, and never offers first — it accepts ours the instant we send it.
	if (gameutility.isEngineGame(servergame)) return { offered: false, present: true };
	const opponentRole = typeutil.invertPlayer(role);
	const opponentData = servergame.match.playerData[opponentRole]!;
	return {
		offered: servergame.match.rematchOffers.has(opponentRole), // Opponent has an outstanding offer -> glow.
		present: opponentData.socket !== undefined, // Opponent connected -> button enabled.
	};
}

// Exports ---------------------------------------------------------------------------------------

export default {
	// Ratings
	getRatingChanges,
	// SSR Page State
	buildStaticState,
	// ICN Metadata
	buildMetadata,
	// Wire Messages
	buildStateBase,
	buildStateMessage,
	buildConclusionMessage,
	simplifyMove,
	// Participant Overlay
	getParticipantState,
	getRematchOfferInfo,
};
