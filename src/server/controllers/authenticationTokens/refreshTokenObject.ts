
/**
 * The script works with modifying refresh token objects stored in the database.
 * [ { token, issued, expires }, { token, issued, expires }, ...]
 * 
 * Very few dependancies.
 */

// @ts-ignore
import timeutil from "../../../client/scripts/esm/util/timeutil.js";
// @ts-ignore
import { refreshTokenExpiryMillis, sessionCap } from "../../config/config.js";
// @ts-ignore
import { getClientIP } from "../../utility/IP.js";


// Type Definitions -------------------------------------------------


import { Request } from "express"; // Assuming Express is used

// Type for an array of refresh tokens
type RefreshTokensList = RefreshTokenObject[];

// Type for refresh token object
interface RefreshTokenObject {
	/** The actual JWT refresh token */
	token: string;
	/** ISO 8601 timestamp string when the token was issued */
	issued: string;
	/** ISO 8601 timestamp string when the token will expire */
	expires: string;
	/** The last connected IP address that used this refresh token */
	IP: string;
}


// Functions -------------------------------------------------------


/**
 * Deletes a specific refresh token from the list of refresh tokens.
 * @param {RefreshTokensList} refreshTokens - The list of refresh tokens.
 * @param {string} deleteToken - The jwt refresh token to be deleted.
 * @returns {RefreshTokensList} - The updated list of refresh tokens.
 */
function deleteRefreshTokenFromTokenList(refreshTokens: RefreshTokensList, deleteToken: string): RefreshTokensList {
	// Remove the specified refresh token from the array
	return refreshTokens.filter(token => token.token !== deleteToken);
}

/**
 * Adds a new refresh token to the existing array of refresh tokens.
 * @param {Request} req - The request object.
 * @param {RefreshTokensList} refreshTokens - The array of existing refresh tokens.
 * @param {string} token - The new refresh token to add.
 */
function addTokenToRefreshTokens(req: Request, refreshTokens: RefreshTokensList, token: string): void {
	const now = Date.now();
	const expires = now + refreshTokenExpiryMillis;
	const nowISO = timeutil.timestampToISO(now);
	const expiresISO = timeutil.timestampToISO(expires);
	const newRefreshToken: RefreshTokenObject = {
		token,
		issued: nowISO,
		expires: expiresISO,
		IP: getClientIP(req)!, // If req is undefined, provide a fallback
	};

	// Add the new token to the array
	refreshTokens.push(newRefreshToken);
}

/**
 * Removes expired refresh tokens from the array of existing refresh tokens.
 * @param {RefreshTokensList} tokens - The array of existing refresh tokens.
 * @returns {RefreshTokensList} - The updated array with expired tokens removed.
 */
function removeExpiredTokens(tokens: RefreshTokensList): RefreshTokensList {
	const currentTime = Date.now();
	// Filter out tokens that have expired
	return tokens.filter(tokenObj => timeutil.isoToTimestamp(tokenObj.expires) > currentTime);
}

/**
 * Returns the time in milliseconds since the token was issued.
 * @param {RefreshTokenObject} tokenObj - The refresh token object containing the `issued` property in ISO 8601 format.
 * @returns {number} - The time in milliseconds since the token was issued.
 */
function getTimeMillisSinceIssued(tokenObj: RefreshTokenObject): number {
	// Convert the 'issued' ISO 8601 string to a timestamp
	const issuedTimestamp = timeutil.isoToTimestamp(tokenObj.issued);
	const currentTime = Date.now();

	// Return the difference in milliseconds
	return currentTime - issuedTimestamp;
}

/**
 * Removes the oldest refresh tokens until the list size is within the sessionCap.
 * Returns an object containing the remaining tokens and the deleted tokens.
 * @param {RefreshTokensList} refreshTokens - The array of refresh tokens.
 * @returns {Object} - An object with two properties: 
 * - `trimmedTokens`: The updated array with tokens removed to meet the sessionCap.
 * - `deletedTokens`: The array of tokens that were removed.
 */
function trimTokensToSessionCap(refreshTokens: RefreshTokensList): { trimmedTokens: RefreshTokensList, deletedTokens: RefreshTokensList } {
	const deletedTokens: RefreshTokensList = [];

	// If the token list is within the session cap, no action is needed
	if (refreshTokens.length <= sessionCap) return { trimmedTokens: refreshTokens, deletedTokens };

	// Sort tokens by the issued timestamp (oldest first)
	refreshTokens.sort((a, b) => timeutil.isoToTimestamp(a.issued) - timeutil.isoToTimestamp(b.issued));

	// Identify and delete excess tokens
	const excessTokens = refreshTokens.splice(0, refreshTokens.length - sessionCap);
	deletedTokens.push(...excessTokens);

	// Return the object with trimmed and deleted tokens
	return { trimmedTokens: refreshTokens, deletedTokens };
}



export {
	deleteRefreshTokenFromTokenList,
	addTokenToRefreshTokens,
	removeExpiredTokens,
	getTimeMillisSinceIssued,
	trimTokensToSessionCap,
};

export type { RefreshTokensList, RefreshTokenObject };