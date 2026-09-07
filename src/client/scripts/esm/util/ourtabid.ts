// src/client/scripts/esm/util/ourtabid.ts

/**
 * This browser tab's own id, held in sessionStorage so it survives the life of
 * the tab. Sent on every socket upgrade request, and on the logout request, so the
 * server can tell this tab's sockets from our other tabs'. See {@link tabid}.
 */

import uuid from '../../../../shared/util/uuid.js';
import tabid from '../../../../shared/util/tabid.js';

// Constants -------------------------------------------------------------------

/** The sessionStorage key it's held under. */
const STORAGE_KEY = 'tab-id';

/** Fixed for as long as the tab lives. */
const ID: string = getTabID();

// Functions -------------------------------------------------------------------

/** Reads this tab's stored id, generating and storing one on its first page load. */
function getTabID(): string {
	try {
		const stored = sessionStorage.getItem(STORAGE_KEY);
		if (stored !== null) return stored;
		const id = uuid.generateID_Base62(tabid.LENGTH);
		sessionStorage.setItem(STORAGE_KEY, id);
		return id;
	} catch {
		// Storage is blocked. A fresh id each page load still names this tab
		// for as long as the page lives, which covers every reconnect.
		return uuid.generateID_Base62(tabid.LENGTH);
	}
}

// Exports ---------------------------------------------------------------------

export default { ID };
