// src/shared/util/tabid.ts

/**
 * How a browser tab names itself to the server, and the shape that name takes.
 * Both ends need this: the tab id rides on every socket upgrade request, and on the
 * logout request, which uses it to tell the leaving tab's sockets from its others.
 */

// Constants -------------------------------------------------------------------

/** The query parameter it rides on. */
const PARAM = 'tab';

/**
 * Its length, in base-62. Client-generated, so it can't be checked for
 * uniqueness; it needn't be unguessable either, it isn't relied on
 * for identity, but improved UX.
 */
const LENGTH = 8;

/** The exact shape of a tab id our client issues: base-62 characters, of a fixed length. */
const REGEX = new RegExp(`^[0-9A-Za-z]{${LENGTH}}$`);

// Exports ---------------------------------------------------------------------

export default { PARAM, LENGTH, REGEX };
