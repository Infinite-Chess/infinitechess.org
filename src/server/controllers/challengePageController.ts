// src/server/controllers/challengePageController.ts

/**
 * Builds the SSR render state for the challenge page — `/game/:id` while it still names an
 * open private seek: the client `challengePageData` channel, and the card's display-ready
 * seek properties, split by whether the viewer owns the challenge.
 */

import type { Request } from 'express';
import type { Player } from '../../shared/chess/util/typeutil.js';
import type { SeekPropertiesViewModel } from './seekProperties.js';
import type { ChallengePageData, ServerUsernameContainer } from '../../shared/transport/domain.js';

import encodeQR from 'qr';

import modutil from '../../shared/chess/util/modutil.js';
import metadatautil from '../../shared/chess/util/metadatautil.js';

import urlUtils from '../utility/urlUtils.js';
import activeSeeks from '../game/seeksmanager/activeSeeks.js';
import gamesManager from '../database/gamesManager.js';
import memberInfoUtil from '../auth/memberInfoUtil.js';
import seekProperties from './seekProperties.js';

// Types -----------------------------------------------------------------------

/** The full render context for `challenge.njk`. */
interface ChallengePageState {
	/** Serialized into the page as `window.challengePageData`. */
	challengePageData: ChallengePageData;
	/** The owner's display name, and their formatted rating if they have one. */
	ownerName: string;
	ownerElo?: string;
	/** The side the owner chose to play. Absent when they left it to chance. */
	ownerSide?: Player;
	/** The icon id of each modifier the seek carries. */
	modifierIconIds: string[];
	properties: SeekPropertiesViewModel;
	/** The link to share, and its QR code as inline SVG. Present only for the owner. */
	share?: { url: string; qrSvg: string };
	/** Whether the viewer can never accept: they're signed out, and the challenge is rated. */
	signinRequired: boolean;
}

// Page State ------------------------------------------------------------------

/**
 * Resolves the render state for `/game/:id`, or `undefined` if the
 * id is malformed or names no open private seek.
 */
function getPageState(req: Request): ChallengePageState | undefined {
	const id = gamesManager.decodeID(req.params['id']!);
	if (id === undefined) return undefined; // Malformed id

	const seek = activeSeeks.getByID(id);
	if (seek === undefined || !seek.private) return undefined;

	const memberInfo = req.memberInfo!;
	const isOwner = memberInfoUtil.eqPartial(seek.owner, memberInfo);
	// The setup the game will have. A seek's variant already carries its position.
	const setup = {
		variant: seek.variant,
		timeControl: seek.time,
		timeCreated: Date.now(),
		modifiers: seek.modifiers,
	};

	return {
		challengePageData: { id, variant: seek.variant },
		ownerName: resolveOwnerName(seek.player, isOwner, req),
		ownerElo: seek.player.rating ? metadatautil.getFormattedElo(seek.player.rating) : undefined,
		ownerSide: seek.color ?? undefined,
		modifierIconIds: (seek.modifiers ?? []).map((m) => modutil.getModifierIconId(m.kind)),
		properties: seekProperties.build(setup, seek.mode === 'rated', undefined, req),
		share: isOwner ? buildShare(id) : undefined,
		signinRequired: !memberInfo.signedIn && seek.mode === 'rated',
	};
}

/** The owner's display name, as the lobby shows it: a guest owner is "(You)" to themselves, "(Guest)" to anyone else. */
function resolveOwnerName(
	player: ServerUsernameContainer,
	viewerIsOwner: boolean,
	req: Request,
): string {
	if (player.type !== 'guest') return player.username;
	const userStatus = req.t.shared.user_status;
	return viewerIsOwner ? userStatus.you_indicator : userStatus.guest_indicator;
}

/** The challenge's canonical link, and its QR code as inline SVG. One string, so the two can't disagree. */
function buildShare(id: number): { url: string; qrSvg: string } {
	const url = urlUtils.getAbsoluteGameUrl(id);
	return { url, qrSvg: encodeQR(url, 'svg', { ecc: 'medium', border: 4 }) };
}

// Exports ---------------------------------------------------------------------

export default { getPageState };
