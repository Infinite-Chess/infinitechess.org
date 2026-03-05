// src/client/scripts/esm/util/icnDictionary.ts

/**
 * Preset DEFLATE dictionary optimized for ICN (Infinite Chess Notation) data.
 *
 * A DEFLATE preset dictionary pre-fills the compressor's sliding window so that
 * common ICN substrings can be back-referenced from the very first byte, yielding
 * much higher compression ratios for typical chess positions.
 *
 * Design principles:
 *  - Least-critical patterns come FIRST (they are further from the data boundary).
 *  - Most-critical patterns come LAST (they are closest to the data boundary and
 *    therefore get priority in the LZ77 back-reference search).
 *  - Patterns are drawn from every standard and popular infinite-chess variant so
 *    the dictionary generalises well.
 */

// prettier-ignore
const ICN_DICTIONARY_STRING: string = [

	// ── 1. Single characters and short tokens ──────────────────────────────────
	// All characters that can appear in ICN, giving the Huffman coder a warm-up.
	'|+>,=()[]{} \n0123456789- ',

	// ── 2. Piece abbreviations ─────────────────────────────────────────────────
	// White (uppercase), black (lowercase), and neutral pieces.
	'K P N B R Q k p n b r q ',
	'AM am HA ha CH ch AR ar GU gu CA ca GI gi ZE ze CE ce ',
	'RQ rq RC rc NR nr HU hu RO ro ob vo ',

	// ── 3. Player codes, move-rule, and win conditions ─────────────────────────
	'w b r y g n bu w:b b:w ',
	'0/100 0/50 ',
	'checkmate royalcapture allpiecescaptured ',

	// ── 4. Promotion-line fragments ────────────────────────────────────────────
	'(8;Q,R,B,N|1;q,r,b,n) ',
	'(8;q,r,b,n|1;Q,R,B,N) ',
	'(8;Q,R,B,N,AM|1;q,r,b,n,am) ',
	'(8;Q,R,B,N,CH,AR|1;q,r,b,n,ch,ar) ',

	// ── 5. ICN position-section header prefixes ────────────────────────────────
	'w 1 checkmate ',
	'w 0/100 1 checkmate ',
	'b 1 checkmate ',
	'w 1 royalcapture ',
	'w 0/100 1 (8;Q,R,B,N|1;q,r,b,n) checkmate ',

	// ── 6. Metadata field names ────────────────────────────────────────────────
	'[Event ""][Site ""][Round ""][White ""][Black ""]',
	'[UTCDate ""][UTCTime ""][Result ""][Variant ""][TimeControl "]"]',

	// ── 7. Coordinate suffix fragments ────────────────────────────────────────
	// "piece,y" endings that appear after the x-coordinate.
	',0 ,1 ,2 ,3 ,4 ,5 ,6 ,7 ,8 ,9 ,10 ,11 ,12 ,13 ,14 ,15 ',
	',-1 ,-2 ,-3 ,-4 ,-5 ,-6 ,-7 ,-8 ,-9 ,-10 ,-11 ,-12 ',
	',1+ ,2+ ,7+ ,8+ ,-1+ ,-2+ ,-7+ ,-8+ ,0+ ',
	',1| ,2| ,7| ,8| ,-1| ,-2| ,0| ',

	// ── 8. Individual pieces at the most common board squares ─────────────────
	'K5,1+ K4,1+ K5,1 k5,8+ k5,-1+ ',
	'Q4,1 Q5,1 q4,8 q4,-1 q5,8 ',
	'R1,1+ R8,1+ R-1,1 R10,1 r1,8+ r8,8+ r1,-1+ r8,-1+ ',
	'N2,1 N7,1 n2,8 n7,8 n2,-1 n7,-1 ',
	'B3,1 B6,1 b3,8 b6,8 b3,-1 b6,-1 ',

	// ── 9. Extended pieces at typical positions ───────────────────────────────
	'CH0,1 CH9,1 ch0,8 ch9,8 ',
	'GU1,1+ GU8,1+ gu1,8+ gu8,8+ ',
	'AR3,1 AR6,1 ar3,8 ar6,8 ',
	'AM4,1 am4,8 RC5,1+ rc5,8+ AM3,1 am3,8 ',
	'HU-2,0 HU11,0 hu-2,9 hu11,9 ',
	'HA-2,-6 HA11,-6 ha-2,15 ha11,15 ',
	'NR2,1 NR7,1 nr2,8 nr7,8 ',
	'RO-2,-6 RO11,-6 ro-2,15 ro11,15 ',

	// ── 10. Obstacle-piece runs (appear as long grids in some variants) ────────
	'ob-6, ob-5, ob-4, ob-3, ob-2, ob-1, ob0, ob1, ob2, ob3, ob4, ob5, ',
	'ob6, ob7, ob8, ob9, ob10, ob11, ob12, ob13, ob14, ob15, ',

	// ── 11. Pawn rows ─────────────────────────────────────────────────────────
	// White pawns at y=2 (the most common configuration)
	'P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+ ',
	// Extended white pawn rows
	'P-2,2+|P-1,2+|P0,2+|P9,2+|P10,2+|P11,2+ ',
	// Black pawns at y=7 (positive-y board layout)
	'p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+ ',
	// Extended black pawn rows (positive y)
	'p-2,7+|p-1,7+|p0,7+|p9,7+|p10,7+|p11,7+ ',
	// Black pawns at y=−2 (negative-y board layout)
	'p1,-2+|p2,-2+|p3,-2+|p4,-2+|p5,-2+|p6,-2+|p7,-2+|p8,-2+ ',
	// Extended black pawn rows (negative y)
	'p-2,-2+|p-1,-2+|p0,-2+|p9,-2+|p10,-2+|p11,-2+ ',

	// ── 12. Back ranks ────────────────────────────────────────────────────────
	// White back rank at y=1
	'R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+ ',
	// Black back rank at y=8 (positive-y layout)
	'r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+ ',
	// Black back rank at y=−1 (negative-y layout)
	'r1,-1+|n2,-1|b3,-1|q4,-1|k5,-1+|b6,-1|n7,-1|r8,-1+ ',

	// ── 13. Full standard starting positions (highest priority – placed last) ──
	// Negative-y layout: white at y=1/2, black at y=−1/−2
	'R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,-2+|p2,-2+|p3,-2+|p4,-2+|p5,-2+|p6,-2+|p7,-2+|p8,-2+|r1,-1+|n2,-1|b3,-1|q4,-1|k5,-1+|b6,-1|n7,-1|r8,-1+',
	// Positive-y layout: white at y=1/2, black at y=8/7
	'|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+',
].join('');

/**
 * The ICN preset DEFLATE dictionary as a `Uint8Array`.
 *
 * Pass this as `dictionary` to both `deflateSync` and `inflateSync` from
 * `fflate` to get significantly better compression on ICN position strings.
 */
const ICN_DEFLATE_DICTIONARY: Uint8Array = new TextEncoder().encode(ICN_DICTIONARY_STRING);

export default ICN_DEFLATE_DICTIONARY;
