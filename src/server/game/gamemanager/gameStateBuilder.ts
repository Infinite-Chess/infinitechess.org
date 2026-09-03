// src/server/game/gamemanager/gameStateBuilder.ts

/**
 * Projects a live {@link ServerGame} outward: into the SSR page state, the wire
 * messages clients receive, and the ICN metadata a finished game is logged with.
 *
 * Pure builders — nothing here sends, persists, or mutates the game.
 * `deadGameState.ts` builds the same page state for games that only exist in the DB.
 */

import type { RatingData } from '../../utility/ratingCalculation.js';
import type { MoveRecord } from '../../../shared/chess/logic/movepiece.js';
import type { ServerGame } from './serverGameTypes.js';
import type { MovePacket } from '../../../shared/chess/util/typeschemas.js';
import type { SeekVariant } from '../../../shared/chess/util/variantselection.js';
import type { AuthMemberInfo } from '../../types.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type {
	SourceVariantMetaData,
	MetaData,
	Rating,
} from '../../../shared/chess/util/metadatautil.js';
import type {
	StaticGameSetup,
	StaticGameState,
	ServerUsernameContainer,
} from '../../../shared/transport/domain.js';
import type {
	ChatLogEntry,
	GameConclusionMessage,
	GameStateFull,
	GameStateMessage,
	LeanParticipantState,
	ParticipantState,
	RematchOfferInfo,
} from '../../../shared/transport/clientbound.js';

import uuid from '../../../shared/util/uuid.js';
import gameurl from '../../../shared/chess/util/gameurl.js';
import timeutil from '../../../shared/util/timeutil.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import winconutil from '../../../shared/chess/util/winconutil.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import engineregistry from '../../../shared/chess/util/engineregistry.js';
import variantregistry from '../../../shared/chess/variants/variantregistry.js';
import gamefileutility from '../../../shared/chess/logic/gamefileutility.js';
import { players as p } from '../../../shared/chess/util/typeutil.js';
import leaderboardregistry from '../../../shared/chess/variants/leaderboardregistry.js';

import tconfig from '../../config/translationConfig.js';
import drawOffers from './drawOffers.js';
import gameUtility from './gameUtility.js';
import memberInfoUtil from '../../auth/memberInfoUtil.js';
import chatEntryMapper from './chatEntryMapper.js';
import ratingCalculation from '../../utility/ratingCalculation.js';
import chatEntriesManager from '../../database/chatEntriesManager.js';
import leaderboardsManager from '../../database/leaderboardsManager.js';
import componentTranslationLoader from '../../config/componentTranslationLoader.js';

// Ratings ---------------------------------------------------------------------

/**
 * Returns the current elo of all players in the game on the leaderboard
 * of the variant being played, or the INFINITY leaderboard if the variant does not have a leaderboard.
 * @returns An object containing the rating for non-guests in the game, and whether we are confident in that rating, IF the variant has a leaderboard.
 * @throws If a database error occurs (from {@link leaderboardsManager.getEloOfPlayer}).
 */
function getRatingDataForGamePlayers(
	players: PlayerGroup<{ identifier: AuthMemberInfo }>,
	variant: SeekVariant,
): PlayerGroup<Rating> {
	// Fallback to INFINITY leaderboard if the variant does not have a leaderboard.
	const leaderboardId =
		leaderboardregistry.ofVariant(variant) ?? leaderboardregistry.IDS.INFINITY;

	const ratingData: PlayerGroup<Rating> = {};
	for (const [color, { identifier }] of Object.entries(players)) {
		if (!identifier.signedIn) continue; // Not a member, no rating to send
		const user_id = identifier.user_id;
		ratingData[Number(color) as Player] = leaderboardsManager.getEloOfPlayer(
			user_id,
			leaderboardId,
		);
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

// SSR Page State --------------------------------------------------------------

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
		players[color] = memberInfoUtil.buildServerUsernameContainer(
			data.identifier,
			ratings[color],
		);
	}
	if (match.engineParticipant) {
		const { color, engine, strengthLevel } = match.engineParticipant;
		players[color] = {
			type: 'engine',
			username: engineregistry.getFormattedName(engine, strengthLevel),
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

// ICN Metadata ----------------------------------------------------------------

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
				confident: ratingCalculation.isRatingConfident(rd.rating_deviation_at_game),
			};
		}
	} else {
		Object.assign(ratings, getRatingDataForGamePlayers(match.playerData, match.variant));
	}

	const scriptT = componentTranslationLoader.getScript('shared', tconfig.DEFAULT_LANGUAGE); // Game metadata should only ever be in English
	const variantCode = gameUtility.getVariantCode(match.variant);
	// Names the GAME: a custom game is a "Custom Variant" game no matter what it's a position of.
	const variantEnglishName = variantregistry.getName(variantCode, scriptT);
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
			return engineregistry.getFormattedName(
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
			servergame.gameRules.moveRule,
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

// Wire Messages ---------------------------------------------------------------

/**
 * Builds the recipient-agnostic {@link GameStateFull} — the live move list, clocks, conclusion,
 * spectator count, and finalized flag, with no participant overlay. What a spectator receives,
 * and the core every participant's `full` reply is assembled from.
 * @param forceSync - Set true ONLY when the server rejected the client's last move,
 * to force their move list to match exactly. Omitted from the message when false.
 */
function buildFullState(servergame: ServerGame, forceSync = false): GameStateFull {
	const state: GameStateFull = {
		kind: 'full',
		finalized: servergame.match.finalized,
		moves: servergame.moves.map((m) => simplifyMove(m)),
		spectators: servergame.spectators.size,
	};
	if (!servergame.untimed) state.clockValues = gameUtility.getClockValues(servergame);
	if (servergame.gameConclusion !== undefined) state.gameConclusion = servergame.gameConclusion;
	const ratingChanges = getRatingChanges(servergame);
	if (ratingChanges) state.ratingChanges = ratingChanges;
	if (forceSync) state.forceSync = true;
	return state;
}

/**
 * Builds one participant's `gamestate`: their participant overlay, plus — for a `full` reply —
 * the whole agnostic base. The shape follows what they REQUESTED, never the game's own stage.
 * @param kind - `'full'` answers a `subscribe`, `'lean'` a `subscriberematch`.
 * @param forceSync - Meaningful to a `full` reply only. See {@link buildFullState}.
 * @throws If a database error occurs.
 */
function buildStateMessage(
	servergame: ServerGame,
	role: Player,
	kind: GameStateMessage['kind'],
	forceSync: boolean,
): GameStateMessage {
	if (kind === 'full') {
		const participantState = getParticipantState(servergame, role);
		return { ...buildFullState(servergame, forceSync), participantState };
	} else {
		const participantState = getLeanParticipantState(servergame, role);
		return { kind, spectators: servergame.spectators.size, participantState };
	}
}

/**
 * Builds the `gameconclusion` message: the result plus the game's clock values.
 * MUST set servergame.gameConclusion first!
 * @param role - The recipient, if a participant: their rematch overlay is attached,
 * born with this very conclusion.
 */
function buildConclusionMessage(servergame: ServerGame, role?: Player): GameConclusionMessage {
	const message: GameConclusionMessage = { gameConclusion: servergame.gameConclusion! };
	if (!servergame.untimed) message.clockValues = gameUtility.getClockValues(servergame);
	if (role !== undefined) message.rematch = getRematchOfferInfo(servergame, role)!; // Guaranteed defined — the conclusion is set by the time we're called.
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

// Participant Overlay ---------------------------------------------------------

/**
 * Builds a participant's private state overlay (clocks, rematch offers) for their resyncs.
 * @throws If a database error occurs.
 */
function getParticipantState(servergame: ServerGame, role: Player): ParticipantState {
	const opponentRole = typeutil.invertPlayer(role);
	const now = Date.now();
	const match = servergame.match;
	const opponentDisconnect = match.playerData[opponentRole]?.disconnect; // An engine opponent has no entry

	return {
		drawOffer: {
			unconfirmed: drawOffers.isExtendedBy(match, opponentRole), // True if our opponent has extended a draw offer we haven't yet confirmed/denied
			lastOfferPly: drawOffers.getLastOfferPly(match, role), // The move ply WE HAVE last offered a draw, if we have, otherwise undefined.
		},
		// Present once their opponent has disconnected and the claim window is set.
		disconnect:
			opponentDisconnect?.timeOpponentMayClaim !== undefined
				? {
						millisUntilClaimable: opponentDisconnect.timeOpponentMayClaim - now,
						voluntary: opponentDisconnect.voluntary,
					}
				: undefined,
		// Once the game is over it lingers for the rematch handshake — send enough to
		// restore the rematch button's state (glow / disabled) on a page refresh.
		rematch: getRematchOfferInfo(servergame, role),
		chat: buildChatLog(servergame),
	};
}

/**
 * Builds the overlay a LEAN state carries. Its game is always concluded, so a draw offer and a
 * disconnect claim are both already closed — only the rematch handshake and the chat remain.
 * @throws If a database error occurs.
 */
function getLeanParticipantState(servergame: ServerGame, role: Player): LeanParticipantState {
	return {
		rematch: getRematchOfferInfo(servergame, role)!, // Guaranteed defined — a lean state only ever answers a concluded game.
		chat: buildChatLog(servergame),
	};
}

/**
 * The rematch overlay for a color once the game is over: whether the opponent has an outstanding
 * offer (glow) and whether they're connected (button enabled). Undefined while the game is live.
 */
function getRematchOfferInfo(servergame: ServerGame, role: Player): RematchOfferInfo | undefined {
	if (!gamefileutility.isGameOver(servergame)) return undefined;
	// An engine is always present, and never offers first — it accepts ours the instant we send it.
	if (gameUtility.isEngineGame(servergame)) return { offered: false, present: true };
	const opponentRole = typeutil.invertPlayer(role);
	const opponentData = servergame.match.playerData[opponentRole]!;
	return {
		offered: servergame.match.rematchOffers.has(opponentRole), // Opponent has an outstanding offer -> glow.
		present: opponentData.socket !== undefined, // Opponent connected -> button enabled.
	};
}

/**
 * The whole chat log, which the client also replays to rebuild its own send-rule mirror.
 * Undefined (never empty) for an engine game, which has no chat at all — so no query runs.
 * @throws If a database error occurs.
 */
function buildChatLog(servergame: ServerGame): ChatLogEntry[] | undefined {
	if (gameUtility.isEngineGame(servergame)) return undefined;
	// One reading serves the whole log, so its entries share one measuring moment.
	const now = Date.now();
	const records = chatEntriesManager.getOfGame(servergame.match.id);
	return records.map((record, i) => chatEntryMapper.toLogEntry(record, i, now));
}

// Exports ---------------------------------------------------------------------

export default {
	// Ratings
	getRatingChanges,
	// SSR Page State
	buildStaticState,
	// ICN Metadata
	buildMetadata,
	// Wire Messages
	buildFullState,
	buildStateMessage,
	buildConclusionMessage,
	simplifyMove,
	// Participant Overlay
	getParticipantState,
	getRematchOfferInfo,
};
