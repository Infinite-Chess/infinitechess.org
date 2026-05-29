// src/server/routes/splashTexts.ts

/**
 * Fun splash texts shown as the tagline on the home page.
 * One is picked at random per request in root.ts.
 *
 * Strings may contain HTML, which is rendered via `| safe` in the template.
 * Wrap glyphs whose meaning changes when capitalized (e.g. ω vs Ω)
 * in `<span class="lc">…</span>` so the tagline's text-transform: uppercase
 * skips them.
 */
const splashTexts: string[] = [
	'Chess without borders',
	'Chess on an infinite plane',
	'Open world Chess',
	'Chess 2.0',
	'Finite Chess',
	'Games on an integer lattice',
	'Mate in omega',
	'Checkmate in <span class="lc">ω</span>³·27 + <span class="lc">ω</span>²·3006 + <span class="lc">ω</span>·4 + 78,350,543 moves',
	'Mate in Ω-1',
	'You will die before it ends',
	"Don't mind the checks",
	'Check! Check! Check! Check!',
	'Draw by indefinite play',
	'I resign.',
	'How do pawns promote?',
	'Never-ending infinite sandbox game',
	"Don't let anyone tell you otherwise",
	"SHHHHHHH don't tell anyone",
	'Almost infinite',
	'May as well be considered infinite',
	'Vickalan where are you',
	'Totally, most definitely, 100% infinite',
	"It's infinite as far as you're concerned",
	'If I cannot win, I will make you suffer',
	"Don't zoom out too far",
	"You couldn't reach the edge if you tried",
	'What could be out there?',
	'OGs have been to rainbow land',
	"You're unusually fascinated with zooming out",
	'Definitely not exaggerated',
	'An extremely large chessboard',
	'See footnote',
	"We don't sell boards",
	'I like this game',
	"Won't you try it",
	"Don't go",
	'Stay a while',
	'Avoid the monsters in the farlands',
	"It's not a variant",
	'The superset of all chess variants',
	'The beefier computer auto-wins',
	"I didn't see the bishop",
	'THE ROOOOOOOOOK!!!!!',
	'Sponsored by Add Loot Studios',
	'Yessss tell all your friends',
	'The engine that runs all chess',
	'Freedom',
	'Ordinals, not cardinals',
	'Receive your own unique position',
	"Don't ask how gravity works",
	'The lore',
	'The entire chess universe',
	"I literally can't make it bigger",
];

/** Returns a randomly chosen splash text. */
export function getRandomSplashText(): string {
	return splashTexts[Math.floor(Math.random() * splashTexts.length)]!;
}
