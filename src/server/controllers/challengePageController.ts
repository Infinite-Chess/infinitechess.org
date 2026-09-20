// src/server/controllers/challengePageController.ts

/**
 * Builds the SSR render state for the challenge page — `/game/:id` while it still names an
 * open private seek: the client `challengePageData` channel, and the card's display-ready
 * seek properties, split by whether the viewer owns the challenge.
 */

import type { Request } from 'express';
import type { Player } from '../../shared/chess/util/typeutil.js';
import type { SeekPropertiesViewModel } from './seekProperties.js';
import type {
	ChallengePageData,
	ServerUsernameContainer,
	StaticGameSetup,
} from '../../shared/transport/domain.js';

import encodeQR from 'qr';

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
	owner: {
		/** Their display name. */
		name: string;
		/** Their formatted rating. Absent for a guest. */
		elo?: string;
		/** The side they chose to play. Absent when they left it to chance. */
		side?: Player;
	};
	properties: SeekPropertiesViewModel;
	/** The link to share, and its QR code as inline SVG. Present only for the owner. */
	share?: {
		url: string;
		qrSvg: string;
		/** The width to render the QR at. See {@link buildShare}. */
		qrSizePx: number;
	};
	/** Whether the viewer can never accept: they're signed out, and the challenge is rated. */
	signinRequired: boolean;
}

// Constants -------------------------------------------------------------------

/** How wide each of the QR code's modules is drawn. See {@link buildShare}. */
const QR_MODULE_PX = 4;

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
	const setup: StaticGameSetup = {
		variant: seek.variant,
		timeControl: seek.time,
		timeCreated: Date.now(),
		modifiers: seek.modifiers,
	};

	return {
		challengePageData: { id, variant: seek.variant },
		owner: {
			name: resolveOwnerName(seek.player, isOwner, req),
			elo: seek.player.rating ? metadatautil.getFormattedElo(seek.player.rating) : undefined,
			side: seek.color ?? undefined,
		},
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

/**
 * The challenge's canonical link, and its QR code as inline SVG. One string, so the two
 * can't disagree.
 *
 * The code's width is its module count times a whole number of pixels, so every module edge
 * lands on a pixel. Sizing it to a round width instead would leave the edges mid-pixel,
 * which the browser either blurs or rounds unevenly — both read as a fuzzy code. The count
 * varies with the link's length, so only the server — which just encoded it — can do this.
 */
function buildShare(id: number): { url: string; qrSvg: string; qrSizePx: number } {
	const url = urlUtils.getAbsoluteGameUrl(id);
	// `border` is the white quiet zone in modules. 2 is the narrowest a scanner is specified
	// to need, and the card frames the code in white anyway.
	const options = { ecc: 'medium', border: 2 } as const;
	/*
	 * The module count steps by 4 with the link's length: 27-42 characters encode to 33
	 * modules, 43 to 62 encode to 37. Production links run 36-39 characters — a 35-character
	 * base plus a 1-4 character base62 id, which `GAME_ID_UPPER_CAP` holds to 62^4 — so every
	 * code is 33 modules wide, with 4 characters of headroom. Only a longer domain or path can
	 * spend that; a longer id can't. Past it, every QR grows by 4 modules at once.
	 */
	// Both forms encode the same grid, so `raw` gives the `svg`'s own module count.
	const modules = encodeQR(url, 'raw', options).length;
	return {
		url,
		qrSvg: encodeQR(url, 'svg', options),
		qrSizePx: modules * QR_MODULE_PX,
	};
}

// Exports ---------------------------------------------------------------------

export default { getPageState };
