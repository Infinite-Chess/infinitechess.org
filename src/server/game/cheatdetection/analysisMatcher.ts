// src/server/game/cheatdetection/analysisMatcher.ts

/**
 * Matches the analysis page's engine against live rated games. Each rated game records every
 * position it stands at. Each report from the analysis page lists the positions its engine
 * displayed, and from and until how long ago. One the game stood at while it was displayed becomes
 * an analysis match in the interaction data of the player the analysing device is tied to: by
 * their login, their browser, or only their network.
 *
 * Unlinked reports are ignored: both players know every position, and strangers analyse
 * popular players' games.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { MemberInfo } from '../../types.js';
import type { PlayerData, ServerGame } from '../gamemanager/serverGameTypes.js';
import type { AnalysisMatch, WatchedPosition } from './cheatDetectionTypes.js';

import gamerules from '../../../shared/chess/util/gamerules.js';
import positionkey from '../../../shared/chess/logic/positionkey.js';

import ip from '../../utility/ip.js';
import activeGames from '../gamemanager/activeGames.js';
import memberInfoUtil from '../../auth/memberInfoUtil.js';
import liveGameValues from '../gamemanager/liveGameValues.js';
import refreshTokenManager from '../../database/refreshTokenManager.js';

// Types -----------------------------------------------------------------------

/**
 * One stretch the analysis page's engine displayed a position: its {@link positionkey} key, and
 * from and until how long before the report.
 */
interface Episode {
	key: string;
	fromAgeMs: number;
	toAgeMs: number;
}

/** Who sent a report, as the request identifies them. */
interface Reporter {
	memberInfo: MemberInfo;
	ip: string;
}

// Watching --------------------------------------------------------------------

/** Starts recording a rated game's positions, from where it stands now. */
function watch(servergame: ServerGame): void {
	// Rated games are always validated, so this only narrows the type.
	if (!servergame.match.rated || !servergame.validateMoves) return;
	servergame.watchedPositions = [currentPosition(servergame)];
}

/** Records the position a validated game's latest move reached. */
function onMove(servergame: ServerGame & { validateMoves: true }): void {
	servergame.watchedPositions?.push(currentPosition(servergame));
}

/** The position a validated game stands at, reached now. */
function currentPosition(servergame: ServerGame & { validateMoves: true }): WatchedPosition {
	const ply = servergame.moves.length;
	const sideToMove = gamerules.getWhosTurnAtMoveIndex(servergame.gameRules, ply - 1);
	return { ply, key: positionkey.of(servergame.pieces, sideToMove), reachedAt: Date.now() };
}

// Matching --------------------------------------------------------------------

/**
 * Matches one analysis-page report against every live rated game, recording each match on the
 * player it's tied to.
 * @param receivedAt - When the report arrived, epoch ms, which each episode's ages count back from.
 * @throws If a database error occurs.
 */
function report(reporter: Reporter, episodes: Episode[], receivedAt: number): void {
	const episodesByKey = groupByKey(episodes);
	for (const servergame of activeGames.getAll()) {
		const positions = servergame.watchedPositions;
		if (!positions) continue;
		const plies = matchedPlies(positions, servergame.match.timeEnded, episodesByKey, receivedAt); // prettier-ignore
		if (plies.size > 0) recordMatches(servergame, reporter, plies);
	}
}

/**
 * A report's episodes by position key, so each game's positions are looked up, not compared with
 * every episode.
 */
function groupByKey(episodes: Episode[]): Map<string, Episode[]> {
	const byKey = new Map<string, Episode[]>();
	for (const episode of episodes) {
		const sameKey = byKey.get(episode.key);
		if (sameKey) sameKey.push(episode);
		else byKey.set(episode.key, [episode]);
	}
	return byKey;
}

/** The plies of every position the game stood at while an episode displayed it. */
function matchedPlies(
	positions: WatchedPosition[],
	timeEnded: number | undefined,
	episodesByKey: Map<string, Episode[]>,
	receivedAt: number,
): Set<number> {
	const plies = new Set<number>();
	positions.forEach((position, i) => {
		const leftAt = positions[i + 1]?.reachedAt ?? timeEnded ?? Infinity;
		for (const { fromAgeMs, toAgeMs } of episodesByKey.get(position.key) ?? []) {
			const shownFrom = receivedAt - fromAgeMs;
			const shownUntil = receivedAt - toAgeMs;
			if (shownFrom < leftAt && shownUntil >= position.reachedAt) plies.add(position.ply);
		}
	});
	return plies;
}

/**
 * Records matches at `plies` on each player the reporter is tied to.
 * @throws If a database error occurs.
 */
function recordMatches(servergame: ServerGame, reporter: Reporter, plies: Set<number>): void {
	const players = Object.entries(servergame.match.playerData).map(([color, data]) => ({ color: Number(color) as Player, data })); // prettier-ignore
	const sessionNetworks = getSessionNetworks(players.map(({ data }) => data));
	const reporterNetwork = ip.networkOf(reporter.ip);

	for (const { color, data } of players) {
		const link = linkOf(reporter, reporterNetwork, data, sessionNetworks);
		if (link === undefined) continue;
		const sharedWithOpponent = link === 'network' && players.some((p) => p.color !== color && isOnNetwork(p.data, sessionNetworks, reporterNetwork)); // prettier-ignore
		for (const ply of plies) {
			const match: AnalysisMatch = link === 'network' ? { ply, link, sharedWithOpponent } : { ply, link }; // prettier-ignore
			if (!data.interaction.matches.some((m) => m.ply === ply && m.link === link)) data.interaction.matches.push(match); // prettier-ignore
		}
		liveGameValues.onInteractionChanged(servergame, color);
	}
}

/** How the reporter is tied to a player, strongest first, or undefined if they aren't. */
function linkOf(
	reporter: Reporter,
	reporterNetwork: string,
	player: PlayerData,
	sessionNetworks: Map<number, Set<string>>,
): AnalysisMatch['link'] | undefined {
	const { memberInfo } = reporter;
	const { identifier } = player;
	if (memberInfoUtil.eqPartial(identifier, memberInfo)) return 'account';
	if (memberInfo.browser_id === identifier.browser_id) return 'browser';
	if (isOnNetwork(player, sessionNetworks, reporterNetwork)) return 'network';
	return undefined;
}

/** Whether `network` is one of the networks a player's sessions were last seen from. */
function isOnNetwork(
	player: PlayerData,
	sessionNetworks: Map<number, Set<string>>,
	network: string,
): boolean {
	if (!player.identifier.signedIn) return false; // Rated players always are: this only narrows the type.
	return sessionNetworks.get(player.identifier.user_id)?.has(network) ?? false;
}

/**
 * The networks each player's sessions were last seen from, by user id. A session records the IP
 * of every request it authenticates, its game socket's included.
 * @throws If a database error occurs.
 */
function getSessionNetworks(players: PlayerData[]): Map<number, Set<string>> {
	const user_ids = players.flatMap(({ identifier }) => (identifier.signedIn ? [identifier.user_id] : [])); // prettier-ignore
	const networks = new Map<number, Set<string>>();
	for (const { user_id, ip_address } of refreshTokenManager.findIPsForUsers(user_ids)) {
		if (ip_address === null) continue;
		if (!networks.has(user_id)) networks.set(user_id, new Set());
		networks.get(user_id)!.add(ip.networkOf(ip_address));
	}
	return networks;
}

// Exports ---------------------------------------------------------------------

export default {
	// Watching
	watch,
	onMove,
	// Matching
	report,
};
