// src/shared/components/playername.ts

/**
 * Turns a seek owner or game participant into the name one viewer reads for them.
 */

import type { Participant } from '../transport/domain.js';
import type { ScriptTranslations } from '../types/script-translations.js';

import interpolate from '../util/interpolate.js';
import engineregistry from '../chess/util/engineregistry.js';

// Functions -------------------------------------------------------------------

/**
 * A participant's display name, as one viewer reads it.
 * @param isViewer - Whether the participant is the viewer themselves. A guest reads as "(You)" to themselves.
 */
function resolve(
	participant: Participant,
	isViewer: boolean,
	sharedT: ScriptTranslations['shared'],
): string {
	const userStatus = sharedT.user_status;
	switch (participant.type) {
		case 'player':
			return participant.username;
		case 'guest':
			return isViewer ? userStatus.you_indicator : userStatus.guest_indicator;
		case 'deleted':
			return userStatus.deleted_indicator;
		case 'engine': {
			const { engine, strengthLevel } = participant;
			const name = engineregistry.REGISTRY[engine].name;
			if (engineregistry.isMaxStrength(engine, strengthLevel)) return name;
			return interpolate.interpolate(userStatus.engine_level, { name, level: strengthLevel });
		}
	}
}

// Exports ---------------------------------------------------------------------

export default { resolve };
