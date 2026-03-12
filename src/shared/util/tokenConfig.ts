// src/shared/util/tokenConfig.ts

/**
 * This script contains shared configuration constants for authentication tokens,
 * used by both the client and server.
 */

/** The expiration duration of access tokens, in milliseconds. */
// const ACCESS_TOKEN_EXPIRY_MILLIS: number = 1000 * 60 * 15; // 15 minutes
const ACCESS_TOKEN_EXPIRY_MILLIS: number = 1000 * 20; // 20 seconds, for testing purposes.

export default {
	ACCESS_TOKEN_EXPIRY_MILLIS,
};
