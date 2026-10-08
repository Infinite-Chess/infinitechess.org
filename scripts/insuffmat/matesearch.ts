// scripts/insuffmat/matesearch.ts

/**
 * Decides whether a set of pieces can be arranged into a legally reachable checkmate, by a
 * refutation-driven placement search. The defender royal in check sits at 0,0, and any others are
 * placed like other pieces; the search finds why the position is not yet a reachable mate and
 * branches over every way one more piece could remove that reason. Every reachable mate contains
 * such a piece for each reason, so a mate is found whenever one exists within the search window.
 * Unused pieces are parked far away.
 * Checkmate follows the site: some royal is in check, and no move leaves every royal safe.
 * Terms, evidence and known holes: README.md.
 */

// Types -----------------------------------------------------------------------

export type Kind =
	| 'K'
	| 'RC'
	| 'RQ'
	| 'Q'
	| 'R'
	| 'B0'
	| 'B1'
	| 'N'
	| 'P'
	| 'AM'
	| 'HA'
	| 'CH'
	| 'AR'
	| 'GU'
	| 'CA'
	| 'GI'
	| 'ZE'
	| 'CE'
	| 'NR'
	| 'HU'
	| 'RO';
type Side = 'A' | 'D';
type Piece = { kind: Kind; side: Side };
type Board = Map<number, Piece>;
export type Material = Partial<Record<Kind, number>>;
type Sq = [number, number];
type Candidate = { sq: Sq; side: Side; kinds: Kind[] };
type Move = { from: Sq; to: Sq; path: Sq[] };
/** A found checkmate, with the attacker's last move that reached it from a position where no defender royal was in check. */
type Mate = { board: Board; prior: Board; lastMove: [Sq, Sq]; attackerIsWhite: boolean };

// Constants -------------------------------------------------------------------

/** How far from the mated royal pieces are placed, per axis; generate.ts raises it to 7 on bounded boards. */
const R = Number(process.env['R'] ?? 6);

/** Every (±a, ±b) and (±b, ±a) offset, without repeats. */
const leapers = (a: number, b: number): Sq[] => {
	const out = new Set<string>();
	for (const [x, y] of [
		[a, b],
		[b, a],
	])
		for (const sx of [1, -1]) for (const sy of [1, -1]) out.add(`${x! * sx},${y! * sy}`);
	return [...out].map((k) => k.split(',').map(Number) as Sq);
};
/** The 8 offsets n squares away orthogonally and diagonally. */
const compass = (n: number): Sq[] => [...leapers(n, 0), ...leapers(n, n)];
const KING_STEPS = compass(1);
const KNIGHT = leapers(1, 2);
const ORTHO: Sq[] = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
];
const DIAG: Sq[] = [
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1],
];

/** The rose's 16 spirals (8 starting hops × 2 turning directions), as cumulative waypoints, as in specialdetect.roses. */
const ROSE_SPIRALS: Sq[][] = (() => {
	const hops: Sq[] = [
		[-2, -1],
		[-1, -2],
		[1, -2],
		[2, -1],
		[2, 1],
		[1, 2],
		[-1, 2],
		[-2, 1],
	];
	const spirals: Sq[][] = [];
	for (let i = 0; i < 8; i++)
		for (const dir of [1, -1]) {
			const spiral: Sq[] = [];
			let [x, y] = [0, 0];
			for (let c = 0; c < 7; c++) {
				const [hx, hy] = hops[(((i + dir * c) % 8) + 8) % 8]!;
				x += hx;
				y += hy;
				spiral.push([x, y]);
			}
			spirals.push(spiral);
		}
	return spirals;
})();

const DEFS: Record<
	Kind,
	{ leaps?: Sq[]; slides?: Sq[]; huygen?: true; pawn?: true; rose?: true; royal?: true }
> = {
	K: { leaps: KING_STEPS, royal: true },
	RC: { leaps: [...KING_STEPS, ...KNIGHT], royal: true },
	RQ: { slides: [...ORTHO, ...DIAG], royal: true },
	GU: { leaps: KING_STEPS },
	CE: { leaps: [...KING_STEPS, ...KNIGHT] },
	N: { leaps: KNIGHT },
	CA: { leaps: leapers(1, 3) },
	GI: { leaps: leapers(1, 4) },
	ZE: { leaps: leapers(2, 3) },
	HA: { leaps: [...compass(2), ...compass(3)] },
	R: { slides: ORTHO },
	B0: { slides: DIAG },
	B1: { slides: DIAG },
	Q: { slides: [...ORTHO, ...DIAG] },
	AR: { slides: DIAG, leaps: KNIGHT },
	CH: { slides: ORTHO, leaps: KNIGHT },
	AM: { slides: [...ORTHO, ...DIAG], leaps: KNIGHT },
	NR: { slides: KNIGHT },
	HU: { huygen: true },
	P: { pawn: true },
	RO: { rose: true },
};
/** Whether the kind is a royal, which can be checkmated. */
const isRoyal = (kind: Kind): boolean => DEFS[kind].royal === true;

// State -----------------------------------------------------------------------

/** The world border set by setWalls, per side; undefined is no wall. */
let walls: (number | undefined)[] = [];
let hasWalls = false;

// Geometry --------------------------------------------------------------------

/** A square as one number, for fast board lookups. Coordinates must stay within ±32768. */
const key = (x: number, y: number): number => (x + 32_768) * 65_536 + y + 32_768;
const parseKey = (k: number): Sq => [Math.floor(k / 65_536) - 32_768, (k % 65_536) - 32_768];
/** A square as ICN coordinates. */
const coordText = (x: number, y: number): string => `${x},${y}`;
/** Whether the square is within the search window around the mated royal. */
const inWindow = (x: number, y: number): boolean => Math.abs(x) <= R && Math.abs(y) <= R;
/**
 * Sets the world border for following searches: "minX,maxX,minY,maxY" relative to the mated royal
 * at 0,0, each an inclusive last on-board coordinate or _ for none. Squares past it do not exist.
 */
function setWalls(spec: string): void {
	walls = spec.split(',').map((v) => (v === '_' ? undefined : Number(v)));
	hasWalls = walls.some((w) => w !== undefined);
}
setWalls('_,_,_,_');
/** Whether the square lies inside the world border. */
const onBoard = (x: number, y: number): boolean =>
	!(
		(walls[0] !== undefined && x < walls[0]) ||
		(walls[1] !== undefined && x > walls[1]) ||
		(walls[2] !== undefined && y < walls[2]) ||
		(walls[3] !== undefined && y > walls[3])
	);
/** Prime lookup, sieved past the furthest distance a faraway huygen can stand. */
const PRIME_SIEVE: boolean[] = (() => {
	const size = 25_000;
	const sieve = new Array<boolean>(size).fill(true);
	sieve[0] = sieve[1] = false;
	for (let i = 2; i * i < size; i++)
		if (sieve[i]) for (let j = i * i; j < size; j += i) sieve[j] = false;
	return sieve;
})();
/** Whether n is prime, for huygen distances. */
const isPrime = (n: number): boolean => PRIME_SIEVE[n] ?? false;

/**
 * Distances beyond the window at which a huygen can stand on a row or column through it, one
 * per distinct pattern of which window squares on that line sit at a prime distance from it.
 * Only that pattern decides what the huygen attacks and what blocks it, so one distance per
 * pattern stands for every distance. Every pattern possible far out is an admissible one, and
 * all of them occur below 10,000.
 */
const FAR_HUYGEN_PATTERNS: Map<string, number> = (() => {
	const seen = new Map<string, number>();
	for (let d = R + 1; d <= 10_000; d++) {
		let pattern = '';
		for (let x = -R; x <= R; x++) pattern += isPrime(d - x) ? '1' : '0';
		if (!seen.has(pattern)) seen.set(pattern, d);
	}
	return seen;
})();
const FAR_HUYGEN_DISTANCES = [...FAR_HUYGEN_PATTERNS.values()];
/**
 * The faraway huygen distances that suffice when the mated royal is a lone king: only its 3×3
 * matters, so a huygen there needs to attack one or two squares of the three on its line and
 * no other window square, which would only let it be blocked or captured.
 */
const FAR_HUYGEN_DISTANCES_LONE_KING = [...FAR_HUYGEN_PATTERNS]
	.filter(
		([pattern]) =>
			pattern.includes('1') &&
			[...pattern].every((c, i) => c === '0' || Math.abs(i - R) <= 1),
	)
	.map(([, d]) => d);
const FAR_HUYGEN_SET = new Set(FAR_HUYGEN_DISTANCES);
/** Whether a piece may be placed on the square: inside the window, or a faraway huygen square in line with it. */
const isPlaceable = (x: number, y: number): boolean =>
	onBoard(x, y) &&
	(inWindow(x, y) ||
		(Math.abs(y) <= R && FAR_HUYGEN_SET.has(Math.abs(x))) ||
		(Math.abs(x) <= R && FAR_HUYGEN_SET.has(Math.abs(y))));

/** The step count k ≥ 1 with to = from + k·dir, or 0 if none. */
function stepsAlong(fx: number, fy: number, tx: number, ty: number, [dx, dy]: Sq): number {
	const k = dx !== 0 ? (tx - fx) / dx : (ty - fy) / dy;
	return Number.isInteger(k) && k >= 1 && k * dx === tx - fx && k * dy === ty - fy ? k : 0;
}

/**
 * Every alternative path by which a piece at from attacks to: each is the squares that must
 * be empty. The piece attacks when any one path is clear. Empty when it never can.
 */
function pathsTo(
	kind: Kind,
	pawnDir: number,
	fx: number,
	fy: number,
	tx: number,
	ty: number,
): Sq[][] {
	return relativePaths(kind, pawnDir, tx - fx, ty - fy).map((path) =>
		path.map(([x, y]) => [fx + x, fy + y] as Sq),
	);
}

const KIND_INDEX = new Map((Object.keys(DEFS) as Kind[]).map((kind, i) => [kind, i]));
/** relativePaths' results, keyed by kind, pawn direction and offset. The geometry never depends on where the piece stands. */
const RELATIVE_PATHS = new Map<number, Sq[][]>();

/** Like pathsTo, for a piece at 0,0 attacking the offset. Cached. */
function relativePaths(kind: Kind, pawnDir: number, dx: number, dy: number): Sq[][] {
	const id =
		((KIND_INDEX.get(kind)! * 2 + (pawnDir > 0 ? 1 : 0)) * 50_001 + dx + 25_000) * 50_001 +
		dy +
		25_000;
	let paths = RELATIVE_PATHS.get(id);
	if (!paths) {
		paths = computeRelativePaths(kind, pawnDir, dx, dy);
		RELATIVE_PATHS.set(id, paths);
	}
	return paths;
}

/** Every path by which a piece at 0,0 attacks the offset. */
function computeRelativePaths(kind: Kind, pawnDir: number, dx: number, dy: number): Sq[][] {
	const def = DEFS[kind];
	const [fx, fy, tx, ty] = [0, 0, dx, dy];
	if (dx === 0 && dy === 0) return [];
	const paths: Sq[][] = [];
	if (def.leaps?.some(([a, b]) => a === dx && b === dy)) paths.push([]);
	if (def.pawn && dy === pawnDir && Math.abs(dx) === 1) paths.push([]);
	if (def.huygen && (dx === 0 || dy === 0) && isPrime(Math.abs(dx + dy))) {
		const sx = Math.sign(dx),
			sy = Math.sign(dy);
		const path: Sq[] = [];
		for (let d = 2; d < Math.abs(dx + dy); d++)
			if (isPrime(d)) path.push([fx + sx * d, fy + sy * d]);
		paths.push(path);
	}
	for (const dir of def.slides ?? []) {
		const k = stepsAlong(fx, fy, tx, ty, dir);
		if (k === 0) continue;
		const path: Sq[] = [];
		for (let i = 1; i < k; i++) path.push([fx + dir[0] * i, fy + dir[1] * i]);
		paths.push(path);
	}
	if (def.rose)
		for (const spiral of ROSE_SPIRALS) {
			const hop = spiral.findIndex(([x, y]) => x === dx && y === dy);
			if (hop !== -1)
				paths.push(spiral.slice(0, hop).map(([x, y]) => [fx + x, fy + y] as Sq));
		}
	return paths;
}

/** How far apart two squares of the window can be on either axis. */
const SPAN = 2 * R;
/** Per kind and pawn direction, whether the kind attacks a given offset within the window, as a flat grid. */
const ATTACK_GRID = new Map<string, Uint8Array>(
	(Object.keys(DEFS) as Kind[]).flatMap((kind) =>
		[1, -1].map((dir): [string, Uint8Array] => {
			const grid = new Uint8Array((2 * SPAN + 1) ** 2);
			for (let dx = -SPAN; dx <= SPAN; dx++)
				for (let dy = -SPAN; dy <= SPAN; dy++)
					grid[(dx + SPAN) * (2 * SPAN + 1) + dy + SPAN] =
						relativePaths(kind, dir, dx, dy).length > 0 ? 1 : 0;
			return [`${kind}${dir}`, grid];
		}),
	),
);
/** Whether the kind, at 0,0, ever attacks the offset (blockers aside). */
const canAttack = (kind: Kind, pawnDir: number, dx: number, dy: number): boolean =>
	Math.abs(dx) <= SPAN && Math.abs(dy) <= SPAN
		? ATTACK_GRID.get(`${kind}${pawnDir}`)![(dx + SPAN) * (2 * SPAN + 1) + dy + SPAN] === 1
		: relativePaths(kind, pawnDir, dx, dy).length > 0;

/** Whether the kind may stand on the square (bishops keep their square parity). */
function fitsSquare(kind: Kind, x: number, y: number): boolean {
	if (kind === 'B0') return Math.abs(x + y) % 2 === 0;
	if (kind === 'B1') return Math.abs(x + y) % 2 === 1;
	return true;
}

// Optimizations ---------------------------------------------------------------

type Transform = (x: number, y: number) => Sq;
/** The 8 rotations and reflections about 0,0. */
const ALL_TRANSFORMS: Transform[] = [
	(x, y) => [x, y],
	(x, y) => [-y, x],
	(x, y) => [-x, -y],
	(x, y) => [y, -x],
	(x, y) => [-x, y],
	(x, y) => [x, -y],
	(x, y) => [y, x],
	(x, y) => [-y, -x],
];

/** A kind's movement vectors (whole spirals for the rose), tagged by use, for testing which transforms preserve it. */
function movesetSignature(kind: Kind, pawnDir: number): Sq[][] {
	const def = DEFS[kind];
	const sig: Sq[][] = [];
	for (const v of def.leaps ?? []) sig.push([v, [0, 0]]);
	for (const v of def.slides ?? []) sig.push([v, [0, 1]]);
	if (def.huygen) for (const v of ORTHO) sig.push([v, [0, 2]]);
	if (def.pawn)
		sig.push(
			[
				[0, pawnDir],
				[0, 3],
			],
			[
				[1, pawnDir],
				[0, 4],
			],
			[
				[-1, pawnDir],
				[0, 4],
			],
		);
	if (def.rose) for (const spiral of ROSE_SPIRALS) sig.push([...spiral, [0, 5]]);
	return sig;
}
/** Whether the transform maps the signature onto itself. The last entry of each element is its tag, left untransformed. */
function preserves(t: Transform, sig: Sq[][]): boolean {
	const asKey = (el: Sq[]): string => el.map(([x, y]) => key(x, y)).join(';');
	const keys = new Set(sig.map((el) => asKey(el)));
	return sig.every((el) =>
		keys.has(asKey([...el.slice(0, -1).map(([x, y]) => t(x, y)), el.at(-1)!])),
	);
}
/** The rotations and reflections about 0,0 that map every given kind's moveset onto itself, in either pawn direction. */
function allowedTransforms(kinds: Kind[]): Transform[] {
	return ALL_TRANSFORMS.filter((t) =>
		kinds.every((kind) => [1, -1].every((dir) => preserves(t, movesetSignature(kind, dir)))),
	);
}

/** Per kind and square color, the most king-neighbor squares of that color one piece can attack from a single square. */
const MAX_COVER = Object.fromEntries(
	(Object.keys(DEFS) as Kind[]).map((kind) => {
		const best: [number, number] = [0, 0];
		for (let x = -R; x <= R; x++)
			for (let y = -R; y <= R; y++) {
				if ((x === 0 && y === 0) || !fitsSquare(kind, x, y)) continue;
				if (isRoyal(kind) && Math.max(Math.abs(x), Math.abs(y)) <= 1) continue; // A royal beside the mated royal would be in check
				for (const dir of [1, -1]) {
					const count: [number, number] = [0, 0];
					for (const [nx, ny] of KING_STEPS)
						if ((nx !== x || ny !== y) && pathsTo(kind, dir, x, y, nx, ny).length)
							count[Math.abs(nx + ny) % 2]!++;
					best[0] = Math.max(best[0], count[0]);
					best[1] = Math.max(best[1], count[1]);
				}
			}
		return [kind, best];
	}),
) as Record<Kind, [number, number]>;

// Search ----------------------------------------------------------------------

/** Searches for a reachable checkmate with a defender royal of the given kind in check at 0,0. */
function findMate(
	attacker: Material,
	defender: Material,
	royal: Kind,
	attackerPawnDir: number,
): Mate | undefined {
	let witness: { prior: Board; lastMove: [Sq, Sq] } | undefined; // Set by hasLegalLastMove
	const pawnDir = (side: Side): number => (side === 'A' ? attackerPawnDir : -attackerPawnDir);
	const visited = new Set<string>();
	// The flight-square capacity bound only holds when the royal at 0,0 is the defender's only one.
	const singleRoyal = !(Object.keys(defender) as Kind[]).some((k) => isRoyal(k));
	const farHuygenDistances =
		royal === 'K' && singleRoyal ? FAR_HUYGEN_DISTANCES_LONE_KING : FAR_HUYGEN_DISTANCES;

	/** Whether a piece on the board attacks the square by some clear path. */
	const pieceAttacks = (board: Board, k: number, p: Piece, tx: number, ty: number): boolean => {
		const [fx, fy] = parseKey(k);
		if (!onBoard(tx, ty)) return false;
		return relativePaths(p.kind, pawnDir(p.side), tx - fx, ty - fy).some((path) =>
			path.every(([x, y]) => onBoard(fx + x, fy + y) && !board.has(key(fx + x, fy + y))),
		);
	};
	/** Whether any piece of the side attacks the square. */
	const attacks = (board: Board, side: Side, tx: number, ty: number): boolean => {
		for (const [k, p] of board)
			if (p.side === side && k !== key(tx, ty) && pieceAttacks(board, k, p, tx, ty))
				return true;
		return false;
	};
	/** The squares of the side's royals. */
	const royalsOf = (board: Board, side: Side): Sq[] =>
		[...board].filter(([, p]) => p.side === side && isRoyal(p.kind)).map(([k]) => parseKey(k));
	/** Whether any royal of the side is attacked. */
	const isAnyRoyalAttacked = (board: Board, side: Side): boolean =>
		royalsOf(board, side).some(([x, y]) => attacks(board, side === 'A' ? 'D' : 'A', x, y));

	/** Every move of every defender piece. Slides stop at the window edge; a sliding royal's run beyond it is handled separately. */
	const defenderMoves = (board: Board): Move[] => {
		const moves: Move[] = [];
		for (const [k, p] of board) {
			if (p.side !== 'D') continue;
			const [fx, fy] = parseKey(k);
			const def = DEFS[p.kind];
			const tryTo = (tx: number, ty: number, path: Sq[]): void => {
				if (!onBoard(tx, ty) || !path.every(([x, y]) => onBoard(x, y))) return;
				if (board.get(key(tx, ty))?.side !== 'D')
					moves.push({ from: [fx, fy], to: [tx, ty], path });
			};
			for (const [a, b] of def.leaps ?? []) tryTo(fx + a, fy + b, []);
			for (const [a, b] of def.slides ?? []) {
				const path: Sq[] = [];
				for (let i = 1; inWindow(fx + a * i, fy + b * i); i++) {
					const x = fx + a * i,
						y = fy + b * i;
					tryTo(x, y, [...path]);
					if (board.has(key(x, y))) break;
					path.push([x, y]);
				}
			}
			if (def.huygen)
				for (const [a, b] of ORTHO) {
					const path: Sq[] = [];
					for (let d = 2; inWindow(fx + a * d, fy + b * d); d++) {
						if (!isPrime(d)) continue;
						const x = fx + a * d,
							y = fy + b * d;
						tryTo(x, y, [...path]);
						if (board.has(key(x, y))) break;
						path.push([x, y]);
					}
				}
			if (def.pawn) {
				const dir = pawnDir('D');
				if (onBoard(fx, fy + dir) && !board.has(key(fx, fy + dir)))
					moves.push({ from: [fx, fy], to: [fx, fy + dir], path: [] });
				for (const sx of [1, -1])
					if (
						onBoard(fx + sx, fy + dir) &&
						board.get(key(fx + sx, fy + dir))?.side === 'A'
					)
						moves.push({ from: [fx, fy], to: [fx + sx, fy + dir], path: [] });
			}
			if (def.rose)
				for (const spiral of ROSE_SPIRALS)
					for (let h = 0; h < spiral.length; h++) {
						const [x, y] = [fx + spiral[h]![0], fy + spiral[h]![1]];
						tryTo(
							x,
							y,
							spiral.slice(0, h).map(([sx, sy]) => [fx + sx, fy + sy] as Sq),
						);
						if (board.has(key(x, y))) break;
					}
			// Captures of attackers beyond the window (faraway huygens), which the window-bounded walks above miss.
			for (const [ak, ap] of board) {
				if (ap.side !== 'A') continue;
				const [ax, ay] = parseKey(ak);
				if (inWindow(ax, ay)) continue;
				const clearPath = pathsTo(p.kind, pawnDir(p.side), fx, fy, ax, ay).find((path) =>
					path.every(([x, y]) => !board.has(key(x, y))),
				);
				if (clearPath) moves.push({ from: [fx, fy], to: [ax, ay], path: clearPath });
				moves.push(...blocksBeyondWindow(board, p, fx, fy, ax, ay));
			}
		}
		return moves;
	};

	/**
	 * Moves of a defender sliding piece onto the line of a faraway attacker at (ax, ay), past the
	 * window edge, landing a prime distance from it: a huygen is blocked there. Leapers and roses
	 * need none of this, as their moves are generated without the window bound.
	 */
	const blocksBeyondWindow = (
		board: Board,
		p: Piece,
		fx: number,
		fy: number,
		ax: number,
		ay: number,
	): Move[] => {
		const alongX = Math.abs(ay) <= R; // The faraway piece's line is a row (else a column)
		const [lineCoord, farCoord] = alongX ? [ay, ax] : [ax, ay];
		const side = Math.sign(farCoord);
		const isBlockSquare = (c: number): boolean =>
			Math.abs(c) > R &&
			Math.sign(c) === side &&
			Math.abs(c) < Math.abs(farCoord) &&
			isPrime(Math.abs(farCoord - c));
		const toSq = (c: number): Sq => (alongX ? [c, lineCoord] : [lineCoord, c]);
		const reachable = (c: number): Move | undefined => {
			const [tx, ty] = toSq(c);
			if (!onBoard(tx, ty) || board.has(key(tx, ty))) return undefined;
			const path = relativePaths(p.kind, pawnDir(p.side), tx - fx, ty - fy).find((pth) =>
				pth.every(([x, y]) => !board.has(key(fx + x, fy + y))),
			);
			return (
				path && {
					from: [fx, fy],
					to: [tx, ty],
					path: path.map(([x, y]) => [fx + x, fy + y] as Sq),
				}
			);
		};
		const def = DEFS[p.kind];
		const moves: Move[] = [];
		const [pLine, pAlong] = alongX ? [fy, fx] : [fx, fy];
		for (const [dx, dy] of def.slides ?? []) {
			const [dLine, dAlong] = alongX ? [dy, dx] : [dx, dy];
			if (dLine === 0) {
				// Sliding along the line itself: the first block square past the window edge serves.
				if (pLine !== lineCoord || Math.sign(dAlong) !== side) continue;
				let c = side * (R + 1);
				while (Math.abs(c) < Math.abs(farCoord) && !isBlockSquare(c)) c += side;
				const move = isBlockSquare(c) ? reachable(c) : undefined;
				if (move) moves.push(move);
				continue;
			}
			// Crossing the line: it lands on it at exactly one square.
			const t = (lineCoord - pLine) / dLine;
			if (!Number.isInteger(t) || t < 1) continue;
			const c = pAlong + t * dAlong;
			const move = isBlockSquare(c) ? reachable(c) : undefined;
			if (move) moves.push(move);
		}
		if (def.huygen && pLine === lineCoord)
			for (let c = side * (R + 1); Math.abs(c) < Math.abs(farCoord); c += side) {
				if (!isBlockSquare(c) || !isPrime(Math.abs(c - pAlong))) continue;
				const move = reachable(c);
				if (move) {
					moves.push(move);
					break;
				}
			}
		return moves;
	};

	/** Every square from which some remaining attacker kind would attack the target along an empty path. */
	const attackerCandidates = (remaining: Material, tx: number, ty: number): Candidate[] => {
		const out: Candidate[] = [];
		for (let x = -R; x <= R; x++)
			for (let y = -R; y <= R; y++) {
				const kinds = (Object.keys(remaining) as Kind[]).filter(
					(kind) =>
						remaining[kind]! > 0 &&
						fitsSquare(kind, x, y) &&
						canAttack(kind, attackerPawnDir, tx - x, ty - y),
				);
				if (kinds.length) out.push({ sq: [x, y], side: 'A', kinds });
			}
		if (remaining.HU)
			for (const d of farHuygenDistances)
				for (const [x, y] of [
					[d, ty],
					[-d, ty],
					[tx, d],
					[tx, -d],
				] as Sq[])
					if (
						isPlaceable(x, y) &&
						relativePaths('HU', attackerPawnDir, tx - x, ty - y).length > 0
					)
						out.push({ sq: [x, y], side: 'A', kinds: ['HU'] });
		return out;
	};
	/** The material's remaining kinds that may stand on the square, optionally filtered. */
	const kindsAt = (m: Material, [x, y]: Sq, filter?: (k: Kind) => boolean): Kind[] =>
		(Object.keys(m) as Kind[]).filter(
			(k) => m[k]! > 0 && fitsSquare(k, x, y) && (!filter || filter(k)),
		);
	/** Placements of any remaining piece of either side on the square. */
	const anyPieceOn = (a: Material, d: Material, sq: Sq): Candidate[] => [
		{ sq, side: 'A', kinds: kindsAt(a, sq) },
		{ sq, side: 'D', kinds: kindsAt(d, sq) },
	];
	/** Placements that would leave some defender royal attacked on the given board: attack a royal there, or add another royal anywhere. */
	const keepARoyalAttacked = (after: Board, a: Material, d: Material): Candidate[] => {
		const cands = royalsOf(after, 'D').flatMap(([x, y]) => attackerCandidates(a, x, y));
		if ((Object.keys(d) as Kind[]).some((k) => isRoyal(k) && d[k]! > 0))
			for (let x = -R; x <= R; x++)
				for (let y = -R; y <= R; y++)
					cands.push({ sq: [x, y], side: 'D', kinds: kindsAt(d, [x, y], isRoyal) });
		return cands;
	};

	/** The board after a defender move. */
	const applyMove = (board: Board, { from, to }: Move): Board => {
		const after = new Map(board);
		const piece = after.get(key(...from))!;
		after.delete(key(...from));
		after.set(key(...to), piece);
		return after;
	};

	/** Every unmet condition of a reachable checkmate, each as the placements that could meet it. */
	const unmetConditions = (board: Board, a: Material, d: Material): Candidate[][] => {
		const unmet: Candidate[][] = [];
		if (!attacks(board, 'A', 0, 0)) unmet.push(attackerCandidates(a, 0, 0));
		for (const move of defenderMoves(board)) {
			const after = applyMove(board, move);
			if (isAnyRoyalAttacked(after, 'D')) continue;
			const cands = [
				...move.path.flatMap((sq) => anyPieceOn(a, d, sq)),
				...keepARoyalAttacked(after, a, d),
			];
			if (!board.has(key(...move.to)))
				cands.push({ sq: move.to, side: 'D', kinds: kindsAt(d, move.to) });
			unmet.push(cands);
		}
		unmet.push(...runOffConditions(board, a, d));
		if (unmet.length) return unmet;
		// The defender is mated; what remains is that the position must be legal and reachable.
		for (const [rk, rp] of board) {
			if (rp.side !== 'A' || !isRoyal(rp.kind)) continue;
			const [rx, ry] = parseKey(rk);
			const checkers = [...board].filter(
				([k, p]) => p.side === 'D' && pieceAttacks(board, k, p, rx, ry),
			);
			if (checkers.length) return [blockersOf(board, checkers, rx, ry, a, d)];
		}
		if (!hasLegalLastMove(board, d)) {
			// Unreachable (e.g. an impossible double check). Either a piece blocks one of the checks, or an attacker
			// not yet placed is the one that moved last, uncovering a check by stepping off its line.
			const checkers = [...board].filter(
				([k, p]) =>
					p.side === 'A' &&
					royalsOf(board, 'D').some(([x, y]) => pieceAttacks(board, k, p, x, y)),
			);
			const lines = royalsOf(board, 'D').flatMap(([x, y]) =>
				blockersOf(board, checkers, x, y, a, d),
			);
			return [[...lines, ...lines.flatMap(({ sq }) => steppedOffFrom(a, sq))]];
		}
		return [];
	};

	/** Placements of an unplaced attacker on every square it could have moved to from the given square. */
	const steppedOffFrom = (a: Material, [bx, by]: Sq): Candidate[] => {
		const out: Candidate[] = [];
		for (let x = -R; x <= R; x++)
			for (let y = -R; y <= R; y++) {
				const kinds = (Object.keys(a) as Kind[]).filter(
					(kind) =>
						a[kind]! > 0 &&
						fitsSquare(kind, x, y) &&
						(DEFS[kind].pawn
							? x === bx && y === by + attackerPawnDir
							: canAttack(kind, attackerPawnDir, x - bx, y - by)),
				);
				if (kinds.length) out.push({ sq: [x, y], side: 'A', kinds });
			}
		return out;
	};

	/** Placements on every clear attack path of the given pieces to the square. */
	const blockersOf = (
		board: Board,
		pieces: [number, Piece][],
		tx: number,
		ty: number,
		a: Material,
		d: Material,
	): Candidate[] =>
		pieces.flatMap(([k, p]) => {
			const [fx, fy] = parseKey(k);
			return pathsTo(p.kind, pawnDir(p.side), fx, fy, tx, ty)
				.filter((path) => path.every(([x, y]) => !board.has(key(x, y))))
				.flatMap((path) => path.flatMap((sq) => anyPieceOn(a, d, sq)));
		});

	/**
	 * A sliding defender royal whose line runs clear to the window edge escapes along it to
	 * infinitely many squares, unless an attacker slides along that same line from behind it
	 * (attacking the whole line once the royal leaves), or another royal stays attacked.
	 */
	const runOffConditions = (board: Board, a: Material, d: Material): Candidate[][] => {
		const unmet: Candidate[][] = [];
		for (const [rk, rp] of board) {
			if (rp.side !== 'D' || !isRoyal(rp.kind)) continue;
			const [rx, ry] = parseKey(rk);
			for (const [dx, dy] of DEFS[rp.kind].slides ?? []) {
				const ray: Sq[] = [];
				let blocked = false;
				for (let i = 1; inWindow(rx + dx * i, ry + dy * i); i++) {
					// A wall ends the line inside the window, so the royal cannot run off along it.
					if (
						!onBoard(rx + dx * i, ry + dy * i) ||
						board.has(key(rx + dx * i, ry + dy * i))
					)
						blocked = true;
					ray.push([rx + dx * i, ry + dy * i]);
				}
				if (blocked) continue;
				const behind: Sq[] = [];
				for (let i = 1; inWindow(rx - dx * i, ry - dy * i); i++)
					behind.push([rx - dx * i, ry - dy * i]);
				const slidesAlong = (k: Kind): boolean =>
					(DEFS[k].slides ?? []).some(([sx, sy]) => sx === dx && sy === dy);
				const covered = behind.some(([x, y]) => {
					const p = board.get(key(x, y));
					return (
						p?.side === 'A' &&
						slidesAlong(p.kind) &&
						pieceAttacks(board, key(x, y), p, rx, ry)
					);
				});
				// Past the window the royal can stop on infinitely many squares, so only another royal can stay attacked.
				const after = new Map(board);
				after.delete(rk);
				if (covered || isAnyRoyalAttacked(after, 'D')) continue;
				const cands: Candidate[] = [
					...ray.flatMap((sq) => anyPieceOn(a, d, sq)),
					...behind.map(
						(sq): Candidate => ({ sq, side: 'A', kinds: kindsAt(a, sq, slidesAlong) }),
					),
					...keepARoyalAttacked(after, a, d),
				];
				unmet.push(cands);
			}
		}
		return unmet;
	};

	/**
	 * Whether some attacker move could have produced this position from one where no defender
	 * royal was in check. Un-makes every attacker move. A capture may only restore a piece the
	 * defender still has unused, since insuffmat is judged on the material before that capture.
	 */
	const hasLegalLastMove = (board: Board, d: Material): boolean => {
		for (const [k, p] of board) {
			if (p.side !== 'A') continue;
			const [sx, sy] = parseKey(k);
			const capturable = (Object.keys(d) as Kind[]).filter(
				(kind) => d[kind]! > 0 && !isRoyal(kind) && fitsSquare(kind, sx, sy),
			);
			for (const { from, capture } of unmoveOrigins(board, p, sx, sy)) {
				for (const captured of capture ? capturable : [undefined]) {
					const prior = new Map(board);
					prior.delete(k);
					prior.set(key(...from), p);
					if (captured) prior.set(k, { kind: captured, side: 'D' });
					if (isAnyRoyalAttacked(prior, 'D')) continue;
					witness = { prior, lastMove: [from, [sx, sy]] };
					return true;
				}
			}
		}
		return false;
	};

	/** Every square an attacker piece could have moved from to reach (sx, sy), and whether that move may have captured. */
	const unmoveOrigins = (
		board: Board,
		p: Piece,
		sx: number,
		sy: number,
	): { from: Sq; capture: boolean }[] => {
		const origins: { from: Sq; capture: boolean }[] = [];
		if (DEFS[p.kind].pawn) {
			const dir = pawnDir('A');
			if (onBoard(sx, sy - dir) && !board.has(key(sx, sy - dir)))
				origins.push({ from: [sx, sy - dir], capture: false });
			for (const ox of [1, -1])
				if (onBoard(sx + ox, sy - dir) && !board.has(key(sx + ox, sy - dir)))
					origins.push({ from: [sx + ox, sy - dir], capture: true });
			return origins;
		}
		for (let x = sx - 2 * R; x <= sx + 2 * R; x++)
			for (let y = sy - 2 * R; y <= sy + 2 * R; y++) {
				if (!onBoard(x, y) || board.has(key(x, y))) continue;
				const clear = relativePaths(p.kind, pawnDir('A'), sx - x, sy - y).some((path) =>
					path.every(
						([px, py]) => onBoard(x + px, y + py) && !board.has(key(x + px, y + py)),
					),
				);
				if (clear)
					origins.push({ from: [x, y], capture: false }, { from: [x, y], capture: true });
			}
		return origins;
	};

	// Walls break the symmetry about 0,0; generate.ts instead searches one layout per mirror-image family.
	const symmetries = hasWalls
		? [ALL_TRANSFORMS[0]!]
		: allowedTransforms([
				royal,
				...(Object.keys(attacker) as Kind[]),
				...(Object.keys(defender) as Kind[]),
			]);

	/** The board's key, minimized over every allowed symmetry so symmetric boards share one. */
	const canonicalId = (board: Board): string => {
		let best: Float64Array | undefined;
		for (const t of symmetries) {
			const entries = new Float64Array(board.size);
			let i = 0;
			for (const [k, p] of board)
				entries[i++] =
					key(...t(...parseKey(k))) * 64 +
					(p.side === 'A' ? 0 : 32) +
					KIND_INDEX.get(p.kind)!;
			entries.sort();
			if (best === undefined || isLess(entries, best)) best = entries;
		}
		return best!.join(',');
	};
	/** Whether a sorts before b, element by element. Both are the same length. */
	const isLess = (a: Float64Array, b: Float64Array): boolean => {
		for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
		return false;
	};

	/** Whether the remaining pieces could still cover every free neighbor square, counted per square color. */
	const canStillCover = (board: Board, a: Material, d: Material): boolean => {
		const free: [number, number] = [0, 0];
		const withoutRoyal = new Map(board);
		withoutRoyal.delete(key(0, 0));
		for (const [sx, sy] of KING_STEPS) {
			if (!onBoard(sx, sy) || board.get(key(sx, sy))?.side === 'D') continue;
			if (attacks(withoutRoyal, 'A', sx, sy)) continue;
			free[Math.abs(sx + sy) % 2]!++;
		}
		for (const parity of [0, 1] as const) {
			let capacity = 0;
			for (const [kind, n] of Object.entries(a) as [Kind, number][])
				capacity += n * MAX_COVER[kind][parity];
			for (const [kind, n] of Object.entries(d) as [Kind, number][])
				if ((kind !== 'B0' && kind !== 'B1') || Number(kind[1]) === parity) capacity += n;
			if (capacity < free[parity]) return false;
		}
		return true;
	};

	/** How many placements the candidates offer on this board. */
	const optionCount = (board: Board, cands: Candidate[]): number =>
		cands.reduce(
			(n, c) => n + (board.has(key(...c.sq)) || !isPlaceable(...c.sq) ? 0 : c.kinds.length),
			0,
		);

	/** Depth-first search from the board, placing pieces until a reachable mate or every option fails. */
	const search = (board: Board, a: Material, d: Material): Mate | undefined => {
		const id = canonicalId(board);
		if (visited.has(id)) return undefined;
		visited.add(id);
		if (singleRoyal && !canStillCover(board, a, d)) return undefined;
		const unmet = unmetConditions(board, a, d);
		if (unmet.length === 0)
			return { board, ...witness!, attackerIsWhite: attackerPawnDir === 1 };
		// Every unmet condition must be met, so meeting whichever has the fewest options stays complete.
		const cands = unmet.reduce((best, c) =>
			optionCount(board, c) < optionCount(board, best) ? c : best,
		);
		const tried = new Set<string>();
		for (const { sq, side, kinds } of cands) {
			if (board.has(key(...sq)) || !isPlaceable(...sq)) continue;
			for (const kind of kinds) {
				const placement = `${key(...sq)}${side}${kind}`;
				if (tried.has(placement)) continue;
				tried.add(placement);
				const pool = side === 'A' ? a : d;
				const next = new Map(board);
				next.set(key(...sq), { kind, side });
				const nextPool = { ...pool, [kind]: pool[kind]! - 1 };
				const found = side === 'A' ? search(next, nextPool, d) : search(next, a, nextPool);
				if (found) return found;
			}
		}
		return undefined;
	};

	return search(new Map([[key(0, 0), { kind: royal, side: 'D' }]]), attacker, defender);
}

// Scenarios -------------------------------------------------------------------

/** Whether a reachable checkmate exists in any arrangement: either side mated, any of its royals the checked one, either bishop-color assignment. */
function isMatePossible(white: Material, black: Material): Mate | undefined {
	const swapBishops = (m: Material): Material => ({ ...m, B0: m.B1, B1: m.B0 });
	for (const flip of [false, true]) {
		const w = flip ? swapBishops(white) : white;
		const b = flip ? swapBishops(black) : black;
		for (const [att, def, attDir] of [
			[w, b, 1],
			[b, w, -1],
		] as const)
			for (const royal of (Object.keys(def) as Kind[]).filter(
				(k) => isRoyal(k) && def[k]! > 0,
			)) {
				const mate = findMate(
					clean(att),
					clean({ ...def, [royal]: def[royal]! - 1 }),
					royal,
					attDir,
				);
				if (mate) return mate;
			}
	}
	return undefined;
}
/** The material without its zero counts. */
const clean = (m: Material): Material =>
	Object.fromEntries(Object.entries(m).filter(([, n]) => n! > 0)) as Material;

/** Parses "K,Q vs k,b0,b1" style material: comma-separated piece codes per side, b0/b1 giving bishop parities. */
function parse(spec: string): [Material, Material] {
	const sides = spec.split(' vs').map((side) => {
		const m: Material = {};
		for (const code of side.trim().toUpperCase().split(',').filter(Boolean)) {
			if (!(code in DEFS)) throw Error(`Unknown piece code "${code}" in "${spec}"`);
			m[code as Kind] = (m[code as Kind] ?? 0) + 1;
		}
		return m;
	});
	return [sides[0] ?? {}, sides[1] ?? {}];
}
/** The board as an ICN with the given side to move. No promotion field, so pawns never promote. */
function toIcn(board: Board, attackerIsWhite: boolean, toMove: Side): string {
	const isWhite = (side: Side): boolean => (side === 'A') === attackerIsWhite;
	const pieces = [...board].map(([k, p]) => {
		const abbr = p.kind === 'B0' || p.kind === 'B1' ? 'B' : p.kind;
		return `${isWhite(p.side) ? abbr : abbr.toLowerCase()}${coordText(...parseKey(k))}`;
	});
	const border = hasWalls ? ` ${walls.map((w) => w ?? '_').join(',')}` : '';
	return `${isWhite(toMove) ? 'w' : 'b'}${border} ${pieces.join('|')}`;
}
/** One line per found mate, for the site to verify: label, mate (defender to move), the prior position (attacker to move), and the last move. */
const witnessLine = (label: string, m: Mate): string =>
	[
		label,
		toIcn(m.board, m.attackerIsWhite, 'D'),
		toIcn(m.prior, m.attackerIsWhite, 'A'),
		`${coordText(...m.lastMove[0])}>${coordText(...m.lastMove[1])}`,
	].join('\t');

// Exports ---------------------------------------------------------------------

export default {
	// Geometry
	setWalls,
	// Optimizations
	allowedTransforms,
	// Scenarios
	isMatePossible,
	parse,
	witnessLine,
};
