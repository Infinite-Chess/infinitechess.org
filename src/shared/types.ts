// src/shared/types.ts

/**
 * Miscellaneous shared type definitions between server and client.
 */

import type { Rating } from '../server/database/leaderboardsmanager';

/** The username container of an invite sent by the server. DIFFERENT FROM UsernameContainerProperties!!!! */
interface ServerUsernameContainer {
	/** The type of the username container. */
	type: 'player' | 'guest';
	/** The username of the user. This can be "(Guest)" if the user is a guest. */
	username: string;
	/** The rating of the user. Falls back to to INFINITY leaderboard. */
	rating?: Rating;
}

export type { ServerUsernameContainer };
