// src/shared/editor/editorutil.ts

/**
 * Board Editor shared constants between client and server.
 */

// Constants ------------------------------------------

/** Maximum length for a position name */
const POSITION_NAME_MAX_LENGTH = 70;

/** Maximum byte length for ICN notation of a saved position */
const MAX_ICN_LENGTH = 1_000_000;

// Exports --------------------------------------------

export default { POSITION_NAME_MAX_LENGTH, MAX_ICN_LENGTH };
