
/**
 * This scripts creates and parses embeded command sequences
 * that go into the comments of moves in Infinite Chess Notation.
 * 
 * An example of a clock embeded sequence is '[%clk 0:01:57.3]'
 * 
 * More info on embeded command sequences:
 * https://www.enpassant.dk/chess/palview/enhancedpgn.htm
 */


// Types ----------------------------------------------------------------------------


/** All valid command sequences. */
const validCommands = ['clk'] as const;

type Command = typeof validCommands[number];

/**
 * Represents a generic command ready to be embedded,
 * containing the command name and its formatted value string.
 */
interface CommandObject {
	/** The name of the command (e.g., 'clk', 'timestamp'). */
	command: Command; // Use the Command union type
	/** The string value associated with the command. */
	value: string;
}

/** Defines the structure returned when extracting commands from a comment string. */
interface ExtractedCommentData {
	/**
	 * The remaining comment text after all command sequences have been removed.
	 * Leading/trailing whitespace is trimmed, and multiple spaces resulting
	 * from command removal are collapsed into single spaces.
	 */
	comment: string;
	/**
	 * A record where keys are the command names (e.g., "clk", "timestamp")
	 * and values are the corresponding argument strings associated with those commands.
	 */
	commands: CommandObject[];
}


// General Command Functions --------------------------------------------------------------------


/**
 * Combines a comment string and a list of command objects into a single
 * string suitable for a PGN comment field (without outer curly braces "{}").
 * @param [comment] Optional. The human-readable comment string. Can be empty or contain only whitespace. (e.g. "Sacrifice!!!")
 * @param cmdObjs An array of CommandObject instances. Can be empty.
 * @returns A combined string with formatted commands followed by the comment (e.g. "[%clk 0:01:57.3] Sacrifice!!!").
 */
function combineCommentAndCommands(cmdObjs: CommandObject[], comment?: string): string {
	/** All parts going into the comment, including command sequences and the human-readable comment. */
	const parts: string[] = [];
	parts.push(...cmdObjs.map(formatCommandSequence));
	if (comment && comment.trim().length > 0) parts.push(comment.trim());
	return parts.join(' ');
}

/**
 * Takes a command object (containing a command name and its value)
 * and constructs the standard embedded command sequence string.
 * 
 * Example: { command: 'clk', value: '1:23:45.6' } => "[%clk 1:23:45.6]"
 * Example: { command: 'timestamp', value: '1678886400' } => "[%timestamp 1678886400]"
 */
function formatCommandSequence(cmdObj: CommandObject): string {
	return `[%${cmdObj.command} ${cmdObj.value}]`;
}

/**
 * Parses a comment string (expected without the outer curly braces `{}`)
 * to extract embedded command sequences (like [%clk ...] or [%timestamp ...])
 * and the remaining human-readable comment text.
 *
 * Command sequences may appear anywhere within the string.
 *
 * @param commentString The comment content string.
 * @returns An object containing the extracted commands and the cleaned comment text.
 */
function extractCommandsFromComment(commentString: string): ExtractedCommentData {
	const commands: CommandObject[] = [];
	const commandRegex = /\[%(\w+) ([^\]]+)\]/g; // The 'g' flag makes it find all occurrences globally.

	// First, extract all commands and store them.
	// We use matchAll for a more robust way to get all matches and capture groups.
	const matches = commentString.matchAll(commandRegex);
	for (const match of matches) {
		const commandName = match[1]! as Command; // e.g., "clk"
		const commandValue = match[2]!; // e.g., "0:09:56.7"
		// Validate the command name
		if (!validCommands.includes(commandName)) throw Error(`Invalid command sequence found in comment: [%${commandName} ...]`);
		commands.push({ command: commandName, value: commandValue });
	}

	// Second, remove all command sequences from the original string to get the raw comment.
	// Replace each found command sequence with an empty string.
	let rawComment = commentString.replace(commandRegex, '');

	// Third, clean up the resulting comment string:
	// Replace multiple consecutive spaces (which might occur where commands were removed) with a single space.
	rawComment = rawComment.trim().replace(/\s{2,}/g, ' ');

	return {
		comment: rawComment,
		commands,
	};
}


// Parsing 'clk' Command Sequences --------------------------------------------------------------------


/**
 * Takes a time in milliseconds and creates a CommandObject containing
 * the 'clk' command name and the time formatted as H:MM:SS.D.
 * The input milliseconds are rounded UP to the nearest 100ms boundary
 * before conversion.
 */
function createClkCommandObject(timeMillis: number): CommandObject {
	let formattedValue: string;

	// Handle edge case: if time is 0 or less, return 0 time object.
	if (timeMillis <= 0) {
		formattedValue = "0:00:00.0";
	} else {
		// Round the total milliseconds UP to the nearest 100ms boundary.
		const roundedUpMillis = Math.ceil(timeMillis / 100) * 100;

		// Calculate H:MM:SS.D based on the rounded-up value.
		const totalSecondsRounded = Math.floor(roundedUpMillis / 1000);
		const hours = Math.floor(totalSecondsRounded / 3600);
		const minutes = Math.floor((totalSecondsRounded % 3600) / 60);
		const seconds = totalSecondsRounded % 60;

		// Calculate tenths based on the rounded-up milliseconds.
		const tenths = (roundedUpMillis % 1000) / 100;

		// Convert minutes and seconds to strings and pad with leading zeros if needed.
		const paddedMinutes = minutes.toString().padStart(2, '0');
		const paddedSeconds = seconds.toString().padStart(2, '0');

		// Create the formatted time value string
		formattedValue = `${hours}:${paddedMinutes}:${paddedSeconds}.${tenths}`;
	}

	// Return the command object conforming to CommandObject
	return {
		command: 'clk', // The specific command name for this function
		value: formattedValue
	};
}

/**
 * Takes a clock time string value (extracted from a %clk command) and returns
 * the number of milliseconds represented by that time.
 * @param clkValueString The time string in H:MM:SS.D format (e.g., "1:23:45.6").
 * @returns The total time in milliseconds.
 */
function getMillisFromClkTimeValue(clkValueString: string): number {
	// Regular expression to match the format and capture the time components.
	const regex = /^(\d+):(\d{2}):(\d{2})\.(\d)$/;

	const match = clkValueString.match(regex);

	if (!match) throw new Error(`Clock time value string is not in the required H:MM:SS.D format! (${clkValueString})`);

	// Extract the captured groups. match[0] is the full string.
	// Groups are 1-indexed.
	const hoursStr = match[1];
	const minutesStr = match[2];
	const secondsStr = match[3];
	const tenthsStr = match[4];

	// Convert the captured string parts to numbers.
	const hours = Number(hoursStr);
	const minutes = Number(minutesStr);
	const seconds = Number(secondsStr);
	const tenths = Number(tenthsStr);

	// Calculate the total time in milliseconds.
	const totalMillis =
		(hours * 3600 * 1000) +  // Hours to milliseconds
		(minutes * 60 * 1000) +  // Minutes to milliseconds
		(seconds * 1000) +       // Seconds to milliseconds
		(tenths * 100);          // Tenths of a second to milliseconds
		
	return totalMillis;
}


// Exports ----------------------------------------------------------------------------


export default {
	combineCommentAndCommands,
	extractCommandsFromComment,

	createClkCommandObject,
	getMillisFromClkTimeValue,
};

export type {
	Command,
	CommandObject,
	ExtractedCommentData,
};