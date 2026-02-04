// dev-utils/scripts/organize-imports.ts

/**
 * This script organizes TypeScript import statements in all .ts files
 * within the `src/` directory and the root directory.
 * 
 * It does so according to this prompts rules:
 */

 /*
Go through every tingle .ts file in src/, or immediately in the root directory. Your job is to make sure all the imports are orderly and nice.

All import types should come above all imports, and these two groups must be separate by one empty line.
In the import type group, all package dependancy imports should be above source code imports, and there should be one empty line of padding between these two groups.
All imports of package dependancies, compared to imports of local source code, should also be in two separate groups, the prior above the latter, and also separated by one empty line.
In each import group, all only-default imports should come first (i.e. import websocket from '../websocket.js';), followed by hybrid default-and-normal-imports (i.e. import bounds, { UnboundedRectangle } from '../../util/math/bounds.js';), followed by normal-imports (i.e. import { players, rawTypes } from '../util/typeutil.js';), followed by normal-imports (i.e. import {  handleForgotPasswordRequest,  handleResetPassword, } from '../controllers/passwordResetController.js';) which span multiple lines due to our formatter auto-wrapping them when they get too long. These groups can be adjacent, they should NOT have one empty line between them. But the priors should still come above the latters.
After prioritizing the grouping rules above, the individual imports in each group should be ordered, from top to bottom, in order of ascending number of characters until the "from" part of the import. This means that the naturally longer the import names, the further down they are in their individual group. Basically, in the individual groups, sort them from shortest import to longest import, but only counting the name of the import before "from", so the file path its actually imported from should have no affect on the ordering here.
All import groups, whether type or regular, should be separated from the rest of the script by one empty line, both on top and bottom. If there are any lingering "Import start" or "Import end" or "System imports" or any other comments talking about the imports as a whole, those may be deleted. Do NOT delete any other comments or jsdoc in scripts, this change is a pure re-ordering.

Here is a full example of a script with disordered imports, and then the ordered version.

Disordered:

ts
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
Ordered

ts
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
*/

/**
 * KNOWN SHORTCOMINGS OF THIS SCRIPT:
 * 
 * It deletes any `// @ts-ignore` comments above imports. It should not do that.
 * I would place all imports with ts-ignore comments into the regular `import` group, ABOVE all other regular imports.
 * 
 * It also puts any imports that are only imported so their code will run, on top. For example:
 * `import './pingmeter.js'; // Only imported so its code runs`
 * I would place these all together in their own group, below the regular imports.
 * 
 * After all the imports are finished, it will tend to KEEP these lines, as intended:
 * `// Constants ----------------------------------------------------------------------`
 * However it will DELETE lines like this, which I do not like:
 * `// Types ------------------------------------------------------------------`
 * or this:
 * `// Type Definitions -----------------------------------------`
 * 
 * All files which reside in `src/server/middleware/`, for some reason this script
 * will delete the first line comment showing its file path, e.g.:
 * `// src/server/middleware/verifyJWT.ts`
 * it also strangely happened for these files:
 * `// src/server/types.ts`
 * `// src/shared/types.ts`
 * it also deleted lots of empty lines in the long documentation inside `src/shared/util/isprime.ts`
 */

import * as fs from 'fs';
import * as path from 'path';

interface Import {
  raw: string;
  isType: boolean;
  isPackage: boolean;
  isDefaultOnly: boolean;
  isHybrid: boolean;
  isMultiLine: boolean;
  lengthUntilFrom: number;
}

function findTsFiles(dir: string, recursive: boolean): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      files.push(...findTsFiles(fullPath, true));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function parseImport(importStr: string): Import {
  const trimmed = importStr.trim();
  const isType = trimmed.startsWith('import type ') || trimmed.startsWith('import type{');
  const isMultiLine = importStr.includes('\n');
  
  // Extract the 'from' part to determine if it's a package or source import
  const fromMatch = importStr.match(/from\s+['"]([^'"]+)['"]/);
  const fromPath = fromMatch ? fromMatch[1] : '';
  const isPackage = !fromPath.startsWith('.') && !fromPath.startsWith('/');
  
  // Calculate length until "from"
  const fromIndex = importStr.indexOf(' from ');
  const lengthUntilFrom = fromIndex !== -1 ? fromIndex : importStr.length;
  
  // Determine import type (default-only, hybrid, normal)
  let isDefaultOnly = false;
  let isHybrid = false;
  
  // Remove 'import type' or 'import' to analyze the rest
  const afterImport = importStr.replace(/^import\s+type\s+/, '').replace(/^import\s+/, '');
  const beforeFrom = afterImport.split(' from ')[0]?.trim() || '';
  
  // Check for curly braces
  const hasCurlyBraces = beforeFrom.includes('{');
  const hasCommaBeforeCurly = beforeFrom.indexOf(',') < beforeFrom.indexOf('{') && beforeFrom.indexOf(',') !== -1;
  
  if (!hasCurlyBraces) {
    isDefaultOnly = true;
  } else if (hasCommaBeforeCurly) {
    isHybrid = true;
  }
  
  return {
    raw: importStr,
    isType,
    isPackage,
    isDefaultOnly,
    isHybrid,
    isMultiLine,
    lengthUntilFrom
  };
}

function extractImports(content: string): { imports: Import[], leadingContent: string, trailingContent: string } {
  const lines = content.split('\n');
  let leadingContent = '';
  let trailingContent = '';
  const imports: Import[] = [];
  
  let i = 0;
  let foundFirstImport = false;
  
  // Extract leading comments (before any imports), excluding section headers
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Skip empty lines at the start
    if (!line) {
      leadingContent += lines[i] + '\n';
      i++;
      continue;
    }
    
    // Check if it's a section comment header (should be excluded)
    if (line.startsWith('//') && (
      line.toLowerCase().includes('import') ||
      line.toLowerCase().includes('system') ||
      line.toLowerCase().includes('middleware') ||
      line.toLowerCase().includes('custom') ||
      line.toLowerCase().includes('type') ||
      line.toLowerCase().includes('regular') ||
      line.toLowerCase().includes('package')
    )) {
      // Skip section headers - don't include in leading content
      i++;
      continue;
    }
    
    // Check if it's a comment (not a section header)
    if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') || line === '*/') {
      leadingContent += lines[i] + '\n';
      i++;
      continue;
    }
    
    // If we hit an import, stop collecting leading content
    if (line.startsWith('import ')) {
      break;
    }
    
    // If we hit any other code, stop
    break;
  }
  
  // Now collect all imports, skipping section comment headers
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Skip section comment headers
    if (line.startsWith('//') && (
      line.toLowerCase().includes('import') ||
      line.toLowerCase().includes('system') ||
      line.toLowerCase().includes('middleware') ||
      line.toLowerCase().includes('custom') ||
      line.toLowerCase().includes('type') ||
      line.toLowerCase().includes('regular') ||
      line.toLowerCase().includes('package')
    )) {
      i++;
      continue;
    }
    
    // Skip empty lines between imports
    if (!line) {
      i++;
      continue;
    }
    
    // Check if it's an import statement
    if (line.startsWith('import ')) {
      foundFirstImport = true;
      let importStr = lines[i];
      i++;
      
      // Handle multi-line imports
      while (i < lines.length && !importStr.includes(';')) {
        importStr += '\n' + lines[i];
        i++;
      }
      
      imports.push(parseImport(importStr));
      continue;
    }
    
    // If we found imports and now hit non-import code, collect the rest
    if (foundFirstImport) {
      trailingContent = lines.slice(i).join('\n');
      break;
    }
    
    // If we haven't found any imports yet, add to leading content
    leadingContent += lines[i] + '\n';
    i++;
  }
  
  return { imports, leadingContent, trailingContent };
}

function sortImports(imports: Import[]): string {
  // Categorize imports into 4 groups
  const typePackage: Import[] = [];
  const typeSource: Import[] = [];
  const regularPackage: Import[] = [];
  const regularSource: Import[] = [];
  
  for (const imp of imports) {
    if (imp.isType) {
      if (imp.isPackage) {
        typePackage.push(imp);
      } else {
        typeSource.push(imp);
      }
    } else {
      if (imp.isPackage) {
        regularPackage.push(imp);
      } else {
        regularSource.push(imp);
      }
    }
  }
  
  // Sort function: default-only < hybrid < normal (single-line) < multi-line, then by length
  const sortFn = (a: Import, b: Import): number => {
    // First by style: default-only < hybrid < normal < multi-line
    const getTypeOrder = (imp: Import) => {
      if (imp.isDefaultOnly) return 0;
      if (imp.isHybrid) return 1;
      if (imp.isMultiLine) return 3;
      return 2; // normal single-line
    };
    
    const typeOrderA = getTypeOrder(a);
    const typeOrderB = getTypeOrder(b);
    
    if (typeOrderA !== typeOrderB) {
      return typeOrderA - typeOrderB;
    }
    
    // Then by length until 'from'
    return a.lengthUntilFrom - b.lengthUntilFrom;
  };
  
  typePackage.sort(sortFn);
  typeSource.sort(sortFn);
  regularPackage.sort(sortFn);
  regularSource.sort(sortFn);
  
  // Build output with proper blank line rules
  const parts: string[] = [];
  
  // Type package imports
  if (typePackage.length > 0) {
    parts.push(typePackage.map(i => i.raw).join('\n'));
  }
  
  // Blank line only if we have both type package AND type source
  if (typePackage.length > 0 && typeSource.length > 0) {
    parts.push('');
  }
  
  // Type source imports
  if (typeSource.length > 0) {
    parts.push(typeSource.map(i => i.raw).join('\n'));
  }
  
  // Blank line only if we have any type imports AND any regular imports
  const hasTypeImports = typePackage.length > 0 || typeSource.length > 0;
  const hasRegularImports = regularPackage.length > 0 || regularSource.length > 0;
  if (hasTypeImports && hasRegularImports) {
    parts.push('');
  }
  
  // Regular package imports
  if (regularPackage.length > 0) {
    parts.push(regularPackage.map(i => i.raw).join('\n'));
  }
  
  // Blank line only if we have both regular package AND regular source
  if (regularPackage.length > 0 && regularSource.length > 0) {
    parts.push('');
  }
  
  // Regular source imports
  if (regularSource.length > 0) {
    parts.push(regularSource.map(i => i.raw).join('\n'));
  }
  
  return parts.join('\n');
}

function processFile(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { imports, leadingContent, trailingContent } = extractImports(content);
  
  if (imports.length === 0) {
    return false; // No imports to organize
  }
  
  const sortedImports = sortImports(imports);
  
  // Remove trailing newlines from leading content
  let cleanLeadingContent = leadingContent.trimEnd();
  if (cleanLeadingContent) {
    cleanLeadingContent += '\n\n';
  }
  
  // Remove leading newlines from trailing content
  let cleanTrailingContent = trailingContent.trimStart();
  if (cleanTrailingContent) {
    cleanTrailingContent = '\n\n' + cleanTrailingContent;
  }
  
  const newContent = cleanLeadingContent + sortedImports + cleanTrailingContent;
  
  // Only write if content changed
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    return true;
  }
  
  return false;
}

function main() {
  const rootDir = '/home/runner/work/infinitechess.org/infinitechess.org';
  const srcDir = path.join(rootDir, 'src');
  
  // Find all TypeScript files
  const srcFiles = findTsFiles(srcDir, true);
  const rootFiles = findTsFiles(rootDir, false);
  const allFiles = [...srcFiles, ...rootFiles];
  
  let changedCount = 0;
  
  for (const file of allFiles) {
    if (processFile(file)) {
      const relativePath = path.relative(rootDir, file);
      console.log(relativePath);
      changedCount++;
    }
  }
  
  console.log(`\n${changedCount} file(s) changed`);
}

main();
