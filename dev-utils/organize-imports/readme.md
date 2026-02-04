
The organize-imports script was made to follow the rules in this prompt:

// ===========================================================================================

Go through every tingle .ts file in src/, or immediately in the root directory. Your job is to make sure all the imports are orderly and nice.

All import types should come above all imports, and these two groups must be separate by one empty line.
In the import type group, all package dependancy imports should be above source code imports, and there should be one empty line of padding between these two groups.
All imports of package dependancies, compared to imports of local source code, should also be in two separate groups, the prior above the latter, and also separated by one empty line.
In each import group, all only-default imports should come first (i.e. import websocket from '../websocket.js';), followed by hybrid default-and-normal-imports (i.e. import bounds, { UnboundedRectangle } from '../../util/math/bounds.js';), followed by normal-imports (i.e. import { players, rawTypes } from '../util/typeutil.js';), followed by normal-imports (i.e. import {  handleForgotPasswordRequest,  handleResetPassword, } from '../controllers/passwordResetController.js';) which span multiple lines due to our formatter auto-wrapping them when they get too long. These groups can be adjacent, they should NOT have one empty line between them. But the priors should still come above the latters.
After prioritizing the grouping rules above, the individual imports in each group should be ordered, from top to bottom, in order of ascending number of characters until the "from" part of the import. This means that the naturally longer the import names, the further down they are in their individual group. Basically, in the individual groups, sort them from shortest import to longest import, but only counting the name of the import before "from", so the file path its actually imported from should have no affect on the ordering here.
All import groups, whether type or regular, should be separated from the rest of the script by one empty line, both on top and bottom. If there are any lingering "Import start" or "Import end" or "System imports" or any other comments talking about the imports as a whole, those may be deleted. Do NOT delete any other comments or jsdoc in scripts, this change is a pure re-ordering.

Here is a full example of a script with disordered imports, and then the ordered version.

Disordered:
```ts
import WebSocket from 'ws';
import type { Request, Response } from 'express';

import { executeSafely_async } from '../../utility/errorGuard.js';
import {
	incrementActiveGameCount,
	decrementActiveGameCount,
	printActiveGameCount,
} from './gamecount.js';
import drawOffers, { closeDrawOffer } from './drawoffers.js';
import { getTimeServerRestarting } from '../timeServerRestarts.js';
import gameutility from './gameutility.js';
import socketUtility from '../../socket/socketUtility.js';
import statlogger from '../statlogger.js';
import gamelogger from './gamelogger.js';
import {
	cancelAutoAFKResignTimer,
	startDisconnectTimer,
	cancelDisconnectTimers,
	getDisconnectionForgivenessDuration,
} from './afkdisconnect.js';
import {
	addUserToActiveGames,
	removeUserFromActiveGame,
	getIDOfGamePlayerIsIn,
	hasColorInGameSeenConclusion,
} from './activeplayers.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import gamesManager, { genUniqueGameID } from '../../database/gamesManager.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import ratingabuse from './ratingabuse.js';
import clock from '../../../shared/chess/logic/clock.js';
import gamefile from '../../../shared/chess/logic/gamefile.js';
import { getEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';
import { Leaderboards } from '../../../shared/chess/variants/validleaderboard.js';

import type { ServerGame } from './gameutility.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Invite } from '../invitesmanager/inviteutility.js';
import type { AuthMemberInfo } from '../../types.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type { Rating } from '../../database/leaderboardsManager.js';
```

Ordered:
```ts
import type { Request, Response } from 'express';

import type { Invite } from '../invitesmanager/inviteutility.js';
import type { Rating } from '../../database/leaderboardsManager.js';
import type { ServerGame } from './gameutility.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';

import * as z from 'zod';
import WebSocket from 'ws';

import clock from '../../../shared/chess/logic/clock.js';
import gamefile from '../../../shared/chess/logic/gamefile.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import statlogger from '../statlogger.js';
import gamelogger from './gamelogger.js';
import ratingabuse from './ratingabuse.js';
import gameutility from './gameutility.js';
import socketUtility from '../../socket/socketUtility.js';
import drawOffers, { closeDrawOffer } from './drawoffers.js';
import gamesManager, { genUniqueGameID } from '../../database/gamesManager.js';
import { Leaderboards } from '../../../shared/chess/variants/validleaderboard.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { executeSafely_async } from '../../utility/errorGuard.js';
import { getTimeServerRestarting } from '../timeServerRestarts.js';
import { getEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';
import {
	incrementActiveGameCount,
	decrementActiveGameCount,
	printActiveGameCount,
} from './gamecount.js';
import {
	addUserToActiveGames,
	removeUserFromActiveGame,
	getIDOfGamePlayerIsIn,
	hasColorInGameSeenConclusion,
} from './activeplayers.js';
import {
	cancelAutoAFKResignTimer,
	startDisconnectTimer,
	cancelDisconnectTimers,
	getDisconnectionForgivenessDuration,
} from './afkdisconnect.js';
```

// ===========================================================================================

## Known bugs of the script are:

It deletes any `// @ts-ignore` comments above imports. It should not do that.
I would place all imports with ts-ignore comments into the regular `import` group, ABOVE all other regular imports.

It also puts any imports that are only imported so their code will run, on top. For example:
`import './pingmeter.js'; // Only imported so its code runs`
I would place these all together in their own group, below the regular imports.

After all the imports are finished, it will tend to KEEP these lines, as intended:
`// Constants ----------------------------------------------------------------------`
However it will DELETE lines like this, which I do not like:
`// Types ------------------------------------------------------------------`
or this:
`// Type Definitions -----------------------------------------`

All files which reside in `src/server/middleware/`, for some reason this script
will delete the first line comment showing its file path, e.g.:
`// src/server/middleware/verifyJWT.ts`
it also strangely happened for these files:
`// src/server/types.ts`
`// src/shared/types.ts`
it also deleted lots of empty lines in the long documentation inside `src/shared/util/isprime.ts`

## To fix these:

Adjacent to this readme.md are two directories, `problem/` and `solution/`. The first contains a bunch of "before" files which the script may have been bugged with. The second contains the "after" files, which are the correct versions of those files, which the script should try to match.