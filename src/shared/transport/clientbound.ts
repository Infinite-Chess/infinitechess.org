// src/shared/transport/clientbound.ts

/**
 * The CLIENTBOUND websocket contract: every action the server may send on each route,
 * and the payload each one carries. See serverbound.ts for the opposite direction.
 *
 * Single source of truth for both sides. The server type-imports the inferred types to get
 * compile-time checking of what it sends; the client validates incoming messages against
 * these schemas at the trust boundary, so it value-imports them. That's why the two
 * directions are separate files — bundling them together would drag the serverbound
 * schemas, which the client only ever needs as types, into its bundle.
 *
 * A schema belongs here if it exists ONLY as websocket message contents; anything
 * another transport also carries is owned and imported by domain.ts or elsewhere.
 */

import * as z from 'zod';

import domain from './domain.js';
import clockutil from '../chess/util/clockutil.js';
import typeschemas from '../chess/util/typeschemas.js';

// Common Helper Schemas -------------------------------------------------------

/**
 * A game to take the client to. Carries their role in it so the URL they navigate
 * to can pin the board's perspective to the side they're playing.
 */
export type GameNavigation = z.infer<typeof GameNavigationSchema>;
const GameNavigationSchema = z.strictObject({
	id: domain.GameIDSchema,
	/** Our color in the game. Absent if we're not a participant (spectator). */
	role: typeschemas.PlayerSchema.optional(),
});

// General Route ---------------------------------------------------------------

/** Every message the server may send on the 'general' route. */
export type ClientboundGeneralMessage = z.infer<typeof ClientboundGeneralSchema>;
const ClientboundGeneralSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('toast'), value: z.string() }),
	z.strictObject({ action: z.literal('toast-error'), value: z.string() }),
	z.strictObject({ action: z.literal('print'), value: z.string() }),
	z.strictObject({ action: z.literal('print-error'), value: z.string() }),
	z.strictObject({ action: z.literal('ping') }),
	z.strictObject({ action: z.literal('protocolversion'), value: z.number() }),
]);

// Lobby Route -----------------------------------------------------------------

/** How many clients are currently viewing the lobby. */
const ViewerCountSchema = z.number().nonnegative();

/** The payload of the `seekslist` message — every seek currently open in the lobby, and which one is ours. */
export type SeeksListMessage = z.infer<typeof SeeksListMessageSchema>;
const SeeksListMessageSchema = z.strictObject({
	seekslist: z.array(domain.OutSeekSchema),
	/** The id of our own open seek, absent if we have none. Always one of {@link SeeksListMessage.seekslist}. */
	ourseekid: domain.SeekIdSchema.optional(),
});

/** Tells us we're in a game — carried by the lobby state on subscribe, and pushed live thereafter. */
export type InGameMessage = z.infer<typeof InGameMessageSchema>;
const InGameMessageSchema = GameNavigationSchema.extend({
	/** Whether the server wants THIS tab taken into the game, instead of shown the rejoin banner. */
	navigate: z.boolean(),
});

/** The payload of the `lobbystate` message — the full lobby snapshot, sent the moment we subscribe. */
export type LobbyStateMessage = z.infer<typeof LobbyStateMessageSchema>;
const LobbyStateMessageSchema = SeeksListMessageSchema.extend({
	viewercount: ViewerCountSchema,
	/** Present only if we're already in a game at the time we subscribe. */
	ingame: InGameMessageSchema.optional(),
});

/** Every message the server may send on the 'lobby' route. */
export type ClientboundLobbyMessage = z.infer<typeof ClientboundLobbySchema>;
const ClientboundLobbySchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('lobbystate'), value: LobbyStateMessageSchema }),
	z.strictObject({ action: z.literal('seekslist'), value: SeeksListMessageSchema }),
	z.strictObject({ action: z.literal('viewercount'), value: ViewerCountSchema }),
	z.strictObject({ action: z.literal('ingame'), value: InGameMessageSchema }),
	z.strictObject({ action: z.literal('outgame') }),
]);

// Game Route ------------------------------------------------------------------

// --- Overlay Info ---

/** Info storing draw offers of the game. */
export type DrawOfferInfo = z.infer<typeof DrawOfferInfoSchema>;
const DrawOfferInfoSchema = z.strictObject({
	/** True if our opponent has extended a draw offer we haven't yet confirmed/denied. */
	unconfirmed: z.boolean(),
	/** The move ply WE HAVE last offered a draw, if we have, otherwise undefined. */
	lastOfferPly: z.number().int().optional(),
});

/** Contains information about an opponent's disconnection. */
export type DisconnectInfo = z.infer<typeof DisconnectInfoSchema>;
const DisconnectInfoSchema = z.strictObject({
	/**
	 * How many milliseconds remain, at the time the server sent the message, until we
	 * may claim victory / a draw against our disconnected opponent. The client counts
	 * down from this.
	 */
	millisUntilClaimable: z.number(),
	/** Whether the opponent disconnected by choice, or if it was non-intentional (lost network). */
	voluntary: z.boolean(),
});

/** The state of a post-game rematch offer, from the perspective of one participant. */
export type RematchOfferInfo = z.infer<typeof RematchOfferInfoSchema>;
const RematchOfferInfoSchema = z.strictObject({
	/** True if our opponent has an outstanding rematch offer (drives the button's glow). */
	offered: z.boolean(),
	/** True if our opponent is currently connected (otherwise the rematch button is disabled). */
	present: z.boolean(),
});

// --- Chat ---

/** The closed set of static event notices the chat log can hold. */
export type ChatNoticeCode = z.infer<typeof ChatNoticeCodeSchema>;
const ChatNoticeCodeSchema = z.literal([
	'draw-offered', 'draw-declined', 'draw-accepted',
	'rematch-offered', 'rematch-accepted',
	'disconnect-voluntary', 'disconnect-involuntary', 'reconnected',
	'postgame-left', 'postgame-returned',
	'cheat-detected',
	'account-closed', 'account-terminated',
]); // prettier-ignore

/** What every chat log entry carries, message or notice. */
const ChatEntryBaseSchema = z.strictObject({
	/**
	 * Its 0-based position in this game's log. The client appends an entry only when this is
	 * the next index it needs — a repeat, or one past a gap, is dropped instead of mis-ordered.
	 */
	index: z.number().int().nonnegative(),
	/** The sender, or the player a notice is about. */
	player: typeschemas.PlayerSchema,
});

const ChatMessageSchema = ChatEntryBaseSchema.extend({
	kind: z.literal('message'),
	text: z.string(),
});
const ChatNoticeSchema = ChatEntryBaseSchema.extend({
	kind: z.literal('notice'),
	code: ChatNoticeCodeSchema,
});

/** One live chat delta: a player's typed message, or a static event notice. */
export type ChatEntry = z.infer<typeof ChatEntrySchema>;
const ChatEntrySchema = z.discriminatedUnion('kind', [ChatMessageSchema, ChatNoticeSchema]);

/**
 * One entry of a FULL log — a delta, plus how long ago the server recorded it. A duration,
 * never an instant, since the two clocks aren't in sync. Required here but absent from a delta:
 * only a full log is replayed to rebuild the client's rate-limit history, and a delta is
 * broadcast the moment it is recorded.
 */
export type ChatLogEntry = z.infer<typeof ChatLogEntrySchema>;
const ChatLogEntrySchema = z.discriminatedUnion('kind', [
	ChatMessageSchema.extend({ millisAgo: z.number() }),
	ChatNoticeSchema.extend({ millisAgo: z.number() }),
]);

/** A participant's whole chat log, oldest first. Absent for a chatless engine game. */
const ChatLogSchema = z.array(ChatLogEntrySchema);

// --- Participant State ---

/**
 * The state of the game unique to participants (not spectators), as a FULL gamestate carries
 * it: draw/disconnect while live, and rematch once over. A `subscribe` lands on either stage,
 * so this carries both.
 */
export type ParticipantState = z.infer<typeof ParticipantStateSchema>;
const ParticipantStateSchema = z.strictObject({
	drawOffer: DrawOfferInfoSchema,
	/** If our opponent has disconnected, this will be present. */
	disconnect: DisconnectInfoSchema.optional(),
	/** Present only once the game is concluded and not memory-evicted yet for the rematch handshake. */
	rematch: RematchOfferInfoSchema.optional(),
	chat: ChatLogSchema.optional(),
});

/**
 * The same state as a LEAN gamestate carries it. Its game is always concluded, and
 * `applyConclusion` closes the draw offer and cancels the disconnect — so this cannot
 * express either.
 */
export type LeanParticipantState = z.infer<typeof LeanParticipantStateSchema>;
const LeanParticipantStateSchema = z.strictObject({
	/** Required: the game is over, handshake is underway. */
	rematch: RematchOfferInfoSchema,
	chat: ChatLogSchema.optional(),
});

// --- Game State ---

/** How many spectators there are right now for a live game. */
const SpectatorCountSchema = z.number().nonnegative();

/**
 * The FULL `gamestate` — the answer to every `subscribe`, and to every push that can desync a
 * board. Carries the move list, clocks and conclusion.
 */
export type GameStateFull = z.infer<typeof GameStateFullSchema>;
const GameStateFullSchema = z.strictObject({
	kind: z.literal('full'),
	/** How many spectators there are right now. Absent only for a dead game loaded over HTTP. */
	spectators: SpectatorCountSchema.optional(),
	/** Present for participants, absent for spectators. */
	participantState: ParticipantStateSchema.optional(),
	/** The full move list (reconciled against on reconnect). */
	moves: z.array(typeschemas.MovePacketSchema),
	/**
	 * The live ticking clocks, so a fresh load / reconnect shows
	 * running time, not the base time. Absent for untimed games.
	 */
	clockValues: clockutil.ClockValuesSchema.optional(),
	gameConclusion: typeschemas.GameConclusionSchema.optional(),
	/**
	 * Per-player rating deltas. A finalized-result fact carried as state so a late
	 * resyncer gets it. Present only once a rated game is finalized; absent otherwise.
	 */
	ratingChanges: typeschemas.GenPlayerGroupSchema(z.number()).optional(),
	/**
	 * Whether the game is finalized (result locked in permanently). Once true, nothing but rematch
	 * offers can change, so the client reconnects with `subscriberematch` instead of a full `subscribe`.
	 */
	finalized: z.boolean(),
	/**
	 * When true, the client must force its move list to exactly match the server's — reverting any
	 * extra unconfirmed move at the end rather than re-submitting it. Set only when the server
	 * rejected the client's last move; absent (⇒ false) on a normal subscribe / live reconnect.
	 */
	forceSync: z.boolean().optional(),
});

/**
 * The LEAN `gamestate` — the answer to every `subscriberematch`. Only a client that already holds
 * a finalized game ever sends that, so its board can no longer change and needs no re-sending.
 */
const GameStateLeanSchema = z.strictObject({
	kind: z.literal('lean'),
	/** Required, unlike on a full state: a lean one is only ever built from a live game. */
	spectators: SpectatorCountSchema,
	/** Required: only a participant is ever answered with a lean state — a spectator gets none. */
	participantState: LeanParticipantStateSchema,
});

/** The payload of every `gamestate`. Which one follows the REQUEST, never the game's stage. */
export type GameStateMessage = z.infer<typeof GameStateMessageSchema>;
const GameStateMessageSchema = z.discriminatedUnion('kind', [
	GameStateFullSchema,
	GameStateLeanSchema,
]);

// --- Other Payloads ---

/**
 * The `gameconclusion` message — a non-move-triggered conclusion sent to those who can't
 * desync (whoever's turn it is NOT) so long as their socket is open, so they need only the
 * conclusion + frozen clocks + rematch starting state (if participant), not a full game
 * state resend. Move-triggered conclusions already reach them via `move`.
 */
export type GameConclusionMessage = z.infer<typeof GameConclusionMessageSchema>;
const GameConclusionMessageSchema = z.strictObject({
	gameConclusion: typeschemas.GameConclusionSchema,
	/** If the game is timed, the frozen final clock values. */
	clockValues: clockutil.ClockValuesSchema.optional(),
	/** The recipient's rematch overlay, born with this very conclusion — present only for a participant. */
	rematch: RematchOfferInfoSchema.optional(),
});

/** The message contents of a server websocket `'move'` message — our opponent's move. */
export type OpponentsMoveMessage = z.infer<typeof OpponentsMoveMessageSchema>;
const OpponentsMoveMessageSchema = z.strictObject({
	/** The move our opponent played. In the most compact notation: `"5,2>5,4"`. */
	move: typeschemas.MovePacketSchema,
	gameConclusion: typeschemas.GameConclusionSchema.optional(),
	/** Our opponent's move number, 1-based. */
	moveNumber: z.number().int().positive(),
	/** If the game is timed, this will be the current clock values. */
	clockValues: clockutil.ClockValuesSchema.optional(),
});

// --- Actions ---

/** Every message the server may send on the 'game' route. */
export type ClientboundGameMessage = z.infer<typeof ClientboundGameSchema>;
const ClientboundGameSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('gamestate'), value: GameStateMessageSchema }),
	z.strictObject({ action: z.literal('move'), value: OpponentsMoveMessageSchema }),
	z.strictObject({ action: z.literal('clock'), value: clockutil.ClockValuesSchema }),
	z.strictObject({ action: z.literal('spectatorcount'), value: SpectatorCountSchema }),
	z.strictObject({
		action: z.literal('gameconclusion'),
		value: GameConclusionMessageSchema,
	}),
	z.strictObject({
		action: z.literal('gameratingchange'),
		value: typeschemas.GenPlayerGroupSchema(z.number()),
	}),
	z.strictObject({ action: z.literal('detached') }),
	z.strictObject({ action: z.literal('notlive') }),
	z.strictObject({ action: z.literal('supersededbytab') }),
	z.strictObject({
		action: z.literal('opponentdisconnect'),
		value: DisconnectInfoSchema,
	}),
	z.strictObject({ action: z.literal('opponentreconnect') }),
	z.strictObject({ action: z.literal('drawoffer') }),
	z.strictObject({ action: z.literal('finalized') }),
	z.strictObject({ action: z.literal('chatentry'), value: ChatEntrySchema }),
	z.strictObject({ action: z.literal('rematchoffer') }),
	z.strictObject({ action: z.literal('opponentleft') }),
	z.strictObject({ action: z.literal('opponentreturn') }),
	z.strictObject({ action: z.literal('rematchstarted'), value: GameNavigationSchema }),
]);

// Envelope --------------------------------------------------------------------

/** Every clientbound message, envelope included. What the client validates against. */
export type ClientboundMessage = z.infer<typeof ClientboundSchema>;
export const ClientboundSchema = z.discriminatedUnion('route', [
	// Receipts for a message we sent, carrying only the id being receipted. `echo` says it
	// arrived (and is what the echo timer waits on); `ack` says it has been handled, and
	// comes only for a message we flagged `needsack`. Neither is echoed back.
	z.strictObject({ route: z.literal('echo'), contents: z.int() }),
	z.strictObject({ route: z.literal('ack'), contents: z.int() }),
	// Routed messages
	z.strictObject({
		id: z.int(),
		route: z.literal('general'),
		contents: ClientboundGeneralSchema,
	}),
	z.strictObject({ id: z.int(), route: z.literal('lobby'), contents: ClientboundLobbySchema }),
	z.strictObject({ id: z.int(), route: z.literal('game'), contents: ClientboundGameSchema }),
]);
