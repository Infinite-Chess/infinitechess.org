// src/shared/util/memberurl.ts

/**
 * The `/member/:username` profile page URL, built in one place.
 *
 * SUBJECT TO CHANGE when we redesign the member profile page.
 * At that time we may want to decide on and finalize the URL structure.
 */

/** Builds the `/member/:username` URL, lowercased so each member has one canonical URL. */
function getMemberUrl(username: string): string {
	return `/member/${username.toLowerCase()}`;
}

export default { getMemberUrl };
