
/**
 * This stores a monster regex I made for matching ICN.
 * 
 * It has a big issue. When matching ICNs with over ~2M pieces,
 * we'll get a stack overflow error. Fundamental Regex issue,
 * regex isn't built for handling such large strings.
 */



// Construct the MONSTER ICN regex!

/**
 * Delimiter between all ICN parts.
 * Matches whitespace OR the end of the ICN.
 */
const delimiter = String.raw`(?:\s+|(?=$))`;
// const delimiter = String.raw`\s+`; // Matches only whitespace

/** Matches an entire ICN, capturing with named groups. */
const ICNRegex = new RegExp(
	// If any ICN section match is found, whitespace is required immediately after them.
	String.raw`^\s*` + // Start of the string
	possessive(String.raw`(?:(?<metadata>${getSingleMetadataSource(false)}(?:\s+${getSingleMetadataSource(false)})*)${delimiter})?`) + // Captures all metadata into one string
	possessive(String.raw`(?:(?<turnOrder>${raw_piece_code_regex_source}(?::${raw_piece_code_regex_source})*)${delimiter})?`) +
	possessive(String.raw`(?:(?<enpassant>${coordsKeyRegexSource})${delimiter})?`) +
	possessive(String.raw`(?:(?<moveRule>${wholeNumberSource}\/${countingNumberSource})${delimiter})?`) +
	possessive(String.raw`(?:(?<fullMove>${countingNumberSource})${delimiter})?`) +
	possessive(String.raw`(?:${promotionsRegexSource}${delimiter})?`) +
	possessive(String.raw`(?:${winConditionRegexSource}${delimiter})?`) +
	possessive(String.raw`(?:(?<position>${positionRegexSource})${delimiter})?`) + // Captures the whole position in one string
	possessive(String.raw`(?<moves>${movesRegexSource})?`) + // Captures all moves in one string
	String.raw`\s*$` // End of the string
);
console.log("ICNRegex:", ICNRegex);














/**
 * Converts a string in Infinite Chess Notation to game in JSON format.
 * 
 * Throws an error if it's in an invalid format, or if required sections are missing.
 */
// eslint-disable-next-line no-unused-vars
function ShortToLong_Format(icn: string): LongFormatOut {
	console.log("Start match...");
	const matches = icn.match(ICNRegex);
	console.log("Done matching!");
	if (matches === null) throw new Error("ICN is in an invalid format! " + icn);
	const groups = matches.groups!;

	const metadata: Record<string, string> = {};
	if (groups['metadata']) {
		const metadataMatches = groups['metadata'].matchAll(new RegExp(getSingleMetadataSource(true), 'g'));
		for (const match of metadataMatches) {
			const key = match[1]!;
			const value = match[2]!;
			metadata[key] = value;
		}
	}

	let turnOrder: Player[] = defaults.turnOrder;
	if (groups['turnOrder']) {
		// console.log(`Turn Order: (${groups['turnOrder']})}`);
		// Substitues
		if (groups['turnOrder'] === 'w') groups['turnOrder'] = 'w:b'; // 'w' is short for 'w:b'
		else if (groups['turnOrder'] === 'b') groups['turnOrder'] = 'b:w'; // 'b' is short for 'b:w'
		const turnOrderArray = groups['turnOrder'].split(':'); // ['w','b']
		turnOrder = [...turnOrderArray.map(p_code => {
			if (!(p_code in player_codes_inverted)) throw Error(`Unknown player code (${p_code}) when parsing turn order of ICN! Turn order (${groups['turnOrder']})`);
			return Number(player_codes_inverted[p_code]);
		})] as Player[]; // [1,2]
	}

	let enpassant: EnPassant | undefined;
	if (groups['enpassant']) {
		const coords = coordutil.getCoordsFromKey(groups['enpassant'] as CoordsKey);
		const lastTurn = turnOrder[turnOrder.length - 1];
		const yParity = lastTurn === p.WHITE ? 1 : lastTurn === p.BLACK ? -1 : (() => { throw new Error(`Invalid last turn (${lastTurn}) when parsing enpassant in ICN!`); })();
		enpassant = { square: coords, pawn: [coords[0], coords[1] + yParity] };
	}

	let moveRule: number | undefined;
	let moveRuleState: number | undefined;
	if (groups['moveRule']) {
		const [_moveRuleState, _moveRule] = groups['moveRule'].split('/').map(Number);
		if (_moveRuleState! > _moveRule!) throw Error(`Invalid move rule (${groups['moveRule']}) when parsing ICN!`);
		moveRule = _moveRule;
		moveRuleState = _moveRuleState;
	}

	let fullMove: number = defaults.fullMove;
	if (groups['fullMove']) fullMove = Number(groups['fullMove']);

	let promotionRanks: PlayerGroup<number[]> | undefined;
	let promotionsAllowed: PlayerGroup<RawType[]> | undefined;
	if (groups['promotions']) { // '8,16,24,32;q,r,b,n|1,9,17,25;q,r,b,n'
		const _promotionRanks: PlayerGroup<number[]> = {};
		const _promotionsAllowed: PlayerGroup<RawType[]> = {};
		const promotions = groups['promotions'].split('|'); // ['8,16,24,32;q,r,b,n','1,9,17,25;q,r,b,n']
		// Make sure the number of promotions matches the number of players
		if (promotions.length !== turnOrder.length) throw new Error(`Number of promotions (${promotions.length}) does not match number of players (${turnOrder.length})!`);
		for (const player of turnOrder) {
			const playerPromotions = promotions.shift()!; // '8,16,24,32;q,r,b,n'
			if (playerPromotions === '') continue; // Player has no promotions. Maybe promotions were "(8|)"
			const [ranks, allowed] = playerPromotions.split(';'); // The allowed section is optional
			_promotionRanks[player] = ranks!.split(',').map(Number);
			_promotionsAllowed[player] = allowed ? allowed.split(',').map(raw => Number(piece_codes_raw_inverted[raw]) as RawType) : default_promotions;
		}
		promotionRanks = _promotionRanks;
		promotionsAllowed = _promotionsAllowed;
	}

	let winConditions: PlayerGroup<string[]> = defaults.winConditions;
	if (groups['winConditions']) { // 'checkmate,checkmate|allpiecescaptured'
		const winConStrings = groups['winConditions'].split('|'); // ['checkmate','checkmate|allpiecescaptured']
		const _winConditions: PlayerGroup<string[]> = {};
		// If winConStrings.length is 1, all players have the same win conditions
		if (winConStrings.length === 1) {
			const winConArray = winConStrings[0]!.split(','); // ['checkmate','allpiecescaptured']
			for (const player of turnOrder) {
				_winConditions[player] = [...winConArray];
			}
		} else { // Each player has their own win conditions
			// Make sure the number of win conditions matches the number of players
			if (winConStrings.length !== turnOrder.length) throw new Error(`Number of win conditions (${winConStrings.length}) does not match number of players (${turnOrder.length})!`);
			for (const player of turnOrder) {
				const winConString = winConStrings.shift()!;
				_winConditions[player] = winConString.split(','); // ['checkmate','allpiecescaptured']
			}
		}
		winConditions = _winConditions;
	}

	let position: Map<CoordsKey, number> | undefined;
	let specialRights: Set<CoordsKey> | undefined;
	if (groups['position']) {
		({ position, specialRights } = generatePositionFromShortForm(groups['position']));
	} else {
		// Position not specified. We then require the metadata: Variant, UTCDate, and UTCTime
		if (!metadata['Variant'] || !metadata['UTCDate'] || !metadata['UTCTime']) throw Error("ICN's Variant, UTCDate, and UTCTime must be specified when no position specified.");
		// Could optionally get the position from variant.ts, but probably not a responsibility of icnconverter
		// ({ position, specialRights } = variant.getStartingPositionOfVariant({ Variant: metadata['Variant'], UTCDate: metadata['UTCDate'], UTCTime: metadata['UTCTime'] }));
	}

	let moves: _Move_Out[] | undefined;
	if (groups['moves']) moves = parseShortFormMoves(groups['moves']);

	// =================================== Return the game object ===================================

	const gameRules: GameRules = {
		turnOrder,
		winConditions,
	};
	if (moveRule) gameRules.moveRule = moveRule;
	if (promotionRanks) gameRules.promotionRanks = promotionRanks;
	if (promotionsAllowed) gameRules.promotionsAllowed = promotionsAllowed;

	const state_global: Partial<GlobalGameState> = {};
	if (specialRights) state_global.specialRights = specialRights;
	if (enpassant) state_global.enpassant = enpassant;
	if (moveRuleState !== undefined) state_global.moveRuleState = moveRuleState;
	
	const game: LongFormatOut = {
		metadata: metadata as unknown as MetaData,
		gameRules,
		fullMove,
		state_global
	};
	if (position) game.position = position;
	if (moves) game.moves = moves;

	console.log("Parced ICN: ", jsutil.deepCopyObject(game));

	return game;
}