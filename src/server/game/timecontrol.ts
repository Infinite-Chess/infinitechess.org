// src/server/game/clockweb.ts

import type { MetaData } from '../../shared/chess/util/metadata';

/** These are the allowed time controls in production. */
const validTimeControls = [
	'-',
	'60+2',
	'120+2',
	'180+2',
	'300+2',
	'480+3',
	'600+4',
	'600+6',
	'720+5',
	'900+6',
	'1200+8',
	'1500+10',
	'1800+15',
	'2400+20',
];
/** These are only allowed in development. */
const devTimeControls = ['15+2'];

/** Whether the given time control is valid. */
function isClockValueValid(time_control: MetaData['TimeControl']): boolean {
	return (
		validTimeControls.includes(time_control) ||
		(process.env['NODE_ENV'] === 'development' && devTimeControls.includes(time_control))
	);
}

export default {
	isClockValueValid,
};
