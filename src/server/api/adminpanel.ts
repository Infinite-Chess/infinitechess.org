// src/server/api/adminpanel.ts

/**
 * This script handles all incoming commands send from the admin console page
 * /admin
 */

import type { Request, Response } from 'express';

import validators from '../../shared/util/validators.js';

import { deleteAccount } from '../controllers/deleteaccountcontroller.js';
import { logEventsAndPrint } from '../middleware/logevents.js';
import { manuallyVerifyUser } from '../controllers/verifyaccountcontroller.js';
import { getMemberDataByCriteria } from '../database/membermanager.js';
import { areRolesHigherInPriority } from '../controllers/roles.js';
import { refreshGitHubContributorsList } from './github.js';
import { deleteAllRefreshTokensForUser } from '../database/refreshtokenmanager.js';
import { addToBlacklist, removeFromBlacklist } from '../database/blacklistmanager.js';

// Constants -------------------------------------------------------------------------

const validCommands = [
	'ban',
	'unban',
	'delete',
	'username',
	'logout',
	'verify',
	'userinfo',
	'updatecontributors',
	'help',
] as const;

// Functions -------------------------------------------------------------------------

function processCommand(req: Request, res: Response): void {
	const command = req.params['command']!;

	const commandAndArgs = parseArgumentsFromCommand(command);

	if (!req.memberInfo || !req.memberInfo.signedIn) {
		res.status(401).send('Cannot send commands while logged out.');
		return;
	}
	if (!(req.memberInfo.roles?.includes('admin') ?? false)) {
		res.status(403).send('Cannot send commands without the admin role');
		return;
	}
	// TODO prevent affecting accounts with equal or higher roles
	switch (commandAndArgs[0]) {
		case 'ban':
			banEmailCommand(command, commandAndArgs, req, res);
			return;
		case 'unban':
			unbanEmailCommand(command, commandAndArgs, req, res);
			return;
		case 'delete':
			deleteCommand(command, commandAndArgs, req, res);
			return;
		case 'username':
			usernameCommand(command, commandAndArgs, req, res);
			return;
		case 'logout':
			logoutUser(command, commandAndArgs, req, res);
			return;
		case 'verify':
			verify(command, commandAndArgs, req, res);
			return;
		case 'userinfo':
			getUserInfo(command, commandAndArgs, req, res);
			return;
		case 'updatecontributors':
			updateContributorsCommand(command, req, res);
			return;
		case 'help':
			helpCommand(commandAndArgs, res);
			return;
		default:
			res.status(422).send('Unknown command.');
			return;
	}
}

function parseArgumentsFromCommand(command: string): string[] {
	// Parse command
	const commandAndArgs: string[] = [];
	let inQuote: boolean = false;
	let temp: string = '';
	for (let i = 0; i < command.length; i++) {
		if (command[i] === '"') {
			if (i === 0 || command[i - 1] !== '\\') {
				inQuote = !inQuote;
			} else {
				temp += '"';
			}
		} else if (command[i] === ' ' && !inQuote) {
			commandAndArgs.push(temp);
			temp = '';
		} else if (inQuote || (command[i] !== '"' && command[i] !== ' ')) {
			temp += command[i];
		}
	}
	commandAndArgs.push(temp);

	return commandAndArgs;
}

function deleteCommand(
	command: string,
	commandAndArgs: string[],
	req: Request,
	res: Response,
): void {
	if (commandAndArgs.length < 3) {
		res.status(422).send(
			'Invalid number of arguments, expected 2, got ' + (commandAndArgs.length - 1) + '.',
		);
		return;
	}
	// Valid Syntax
	logCommand(command, req);
	const reason = commandAndArgs[2]!;
	const usernameArgument = commandAndArgs[1]!;
	const record = getMemberDataByCriteria(
		['user_id', 'username', 'roles'],
		'username',
		usernameArgument,
	);
	if (record === undefined)
		return sendAndLogResponse(res, 404, 'User ' + usernameArgument + ' does not exist.');

	// They were found...
	const adminsRoles = req.memberInfo?.signedIn ? req.memberInfo.roles : null;
	const rolesOfAffectedUser = record.roles === null ? null : JSON.parse(record.roles);
	// Don't delete them if they are equal or higher than your status
	if (!areRolesHigherInPriority(adminsRoles, rolesOfAffectedUser))
		return sendAndLogResponse(res, 403, 'Forbidden to delete ' + record.username + '.');

	try {
		deleteAccount(record.user_id, reason);
		sendAndLogResponse(res, 200, 'Successfully deleted user ' + record.username + '.');
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		sendAndLogResponse(res, 500, `Failed to delete user (${record.username}): ${errorMessage}`);
	}
}

function banEmailCommand(
	command: string,
	commandAndArgs: string[],
	req: Request,
	res: Response,
): void {
	if (commandAndArgs.length !== 2) {
		res.status(422).send(
			'Invalid number of arguments, expected 1, got ' + (commandAndArgs.length - 1) + '.',
		);
		return;
	}
	// Valid Syntax
	logCommand(command, req);
	const email = commandAndArgs[1]!.toLowerCase();

	// Validate email format
	const validationResult = validators.validateEmail(email);
	if (validationResult !== validators.EmailValidationResult.Ok) {
		const errorKey = validators.getEmailErrorTranslation(validationResult);
		sendAndLogResponse(res, 422, `Invalid email format: ${errorKey ?? 'unknown error'}`);
		return;
	}

	try {
		addToBlacklist(email, 'banned');
		sendAndLogResponse(res, 200, `Successfully banned ${email}.`);
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		sendAndLogResponse(res, 500, `Failed to ban email (${email}): ${errorMessage}`);
	}
}

function unbanEmailCommand(
	command: string,
	commandAndArgs: string[],
	req: Request,
	res: Response,
): void {
	if (commandAndArgs.length !== 2) {
		res.status(422).send(
			'Invalid number of arguments, expected 1, got ' + (commandAndArgs.length - 1) + '.',
		);
		return;
	}
	// Valid Syntax
	logCommand(command, req);
	const email = commandAndArgs[1]!.toLowerCase();

	// Validate email format
	const validationResult = validators.validateEmail(email);
	if (validationResult !== validators.EmailValidationResult.Ok) {
		const errorKey = validators.getEmailErrorTranslation(validationResult);
		sendAndLogResponse(res, 422, `Invalid email format: ${errorKey ?? 'unknown error'}`);
		return;
	}

	try {
		removeFromBlacklist(email);
		sendAndLogResponse(res, 200, `Successfully unbanned ${email}.`);
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		sendAndLogResponse(res, 500, `Failed to unban email (${email}): ${errorMessage}`);
	}
}

function usernameCommand(
	command: string,
	commandAndArgs: string[],
	req: Request,
	res: Response,
): void {
	if (commandAndArgs[1] === 'get') {
		if (commandAndArgs.length < 3) {
			res.status(422).send(
				'Invalid number of arguments, expected 2, got ' + (commandAndArgs.length - 1) + '.',
			);
			return;
		}
		const parsedId = Number.parseInt(commandAndArgs[2]!);
		if (Number.isNaN(parsedId)) {
			res.status(422).send('User id must be an integer.');
			return;
		}
		// Valid Syntax
		logCommand(command, req);
		const record = getMemberDataByCriteria(['username'], 'user_id', parsedId);
		if (record === undefined)
			sendAndLogResponse(res, 404, 'User with id ' + parsedId + ' does not exist.');
		else sendAndLogResponse(res, 200, record.username);
	} else if (commandAndArgs[1] === 'set') {
		if (commandAndArgs.length < 4) {
			res.status(422).send(
				'Invalid number of arguments, expected 3, got ' + (commandAndArgs.length - 1) + '.',
			);
			return;
		}
		// TODO add username changing logic
		res.status(503).send('Changing usernames is not yet supported.');
	} else if (commandAndArgs[1] === undefined) {
		res.status(422).send('Expected either get or set as a subcommand.');
	} else {
		res.status(422).send(
			'Invalid subcommand, expected either get or set, got ' + commandAndArgs[1] + '.',
		);
	}
}

function logoutUser(command: string, commandAndArgs: string[], req: Request, res: Response): void {
	if (commandAndArgs.length < 2) {
		res.status(422).send(
			'Invalid number of arguments, expected 1, got ' + (commandAndArgs.length - 1) + '.',
		);
		return;
	}
	// Valid Syntax
	logCommand(command, req);
	const usernameArgument = commandAndArgs[1]!;
	const record = getMemberDataByCriteria(['user_id', 'username'], 'username', usernameArgument);
	if (record === undefined) {
		sendAndLogResponse(res, 404, 'User ' + usernameArgument + ' does not exist.');
		return;
	}

	try {
		// Effectively terminates all login sessions of the user
		deleteAllRefreshTokensForUser(record.user_id);
	} catch (e) {
		const errorMessage = e instanceof Error ? e.stack : String(e);
		logEventsAndPrint(
			`Error during admin-manual-logout of user "${record.username}": ${errorMessage}`,
			'errLog.txt',
		);
		sendAndLogResponse(
			res,
			500,
			`Failed to log out user "${record.username}" due to internal error.`,
		);
		return;
	}
	sendAndLogResponse(res, 200, 'User ' + record.username + ' successfully logged out.'); // Use their case-sensitive username
}

function verify(command: string, commandAndArgs: string[], req: Request, res: Response): void {
	if (commandAndArgs.length < 2) {
		res.status(422).send(
			'Invalid number of arguments, expected 1, got ' + (commandAndArgs.length - 1) + '.',
		);
		return;
	}
	// Valid Syntax
	logCommand(command, req);
	const email = commandAndArgs[1]!.toLowerCase();

	// Validate email format
	const validationResult = validators.validateEmail(email);
	if (validationResult !== validators.EmailValidationResult.Ok) {
		const errorKey = validators.getEmailErrorTranslation(validationResult);
		sendAndLogResponse(res, 422, `Invalid email format: ${errorKey ?? 'unknown error'}`);
		return;
	}

	// This method works without us having to confirm they exist first
	const result = manuallyVerifyUser(email); // { success, username, reason }
	if (result.success)
		sendAndLogResponse(res, 200, 'User ' + result.username + ' has been verified!');
	else sendAndLogResponse(res, 500, result.reason); // Failure message
}

function getUserInfo(command: string, commandAndArgs: string[], req: Request, res: Response): void {
	if (commandAndArgs.length < 2) {
		res.status(422).send(
			'Invalid number of arguments, expected 1, got ' + (commandAndArgs.length - 1) + '.',
		);
		return;
	}
	// Valid Syntax
	logCommand(command, req);
	const username = commandAndArgs[1]!;
	const record = getMemberDataByCriteria(
		[
			'user_id',
			'username',
			'roles',
			'joined',
			'last_seen',
			'preferences',
			'is_verified',
			'is_verification_notified',
			'username_history',
			'checkmates_beaten',
		],
		'username',
		username,
	);
	if (record === undefined) sendAndLogResponse(res, 404, 'User ' + username + ' does not exist.');
	else sendAndLogResponse(res, 200, JSON.stringify(record));
}

function updateContributorsCommand(command: string, req: Request, res: Response): void {
	logCommand(command, req);
	refreshGitHubContributorsList();
	sendAndLogResponse(res, 200, 'Contributors should now be updated!');
}

function helpCommand(commandAndArgs: string[], res: Response): void {
	if (commandAndArgs.length === 1) {
		res.status(200).send(
			'Commands: ' +
				validCommands.join(', ') +
				'\nUse help <command> to get more information about a command.',
		);
		return;
	}
	switch (commandAndArgs[1]) {
		case 'ban':
			res.status(200).send('Syntax: ban <email>\nBans the given email address.');
			return;
		case 'unban':
			res.status(200).send('Syntax: unban <email>\nUnbans the given email address.');
			return;
		case 'delete':
			res.status(200).send(
				"Syntax: delete <username> [reason]\nDeletes the given user's account for an optional reason.",
			);
			return;
		case 'username':
			res.status(200).send(
				'Syntax: username get <userid>\n        username set <userid> <newUsername>\nGets or sets the username of the account with the given userid',
			);
			return;
		case 'logout':
			res.status(200).send(
				'Syntax: logout <username>\nLogs out all sessions of the account with the given username.',
			);
			return;
		case 'verify':
			res.status(200).send(
				'Syntax: verify <email>\nVerifies the account with the given email address.',
			);
			return;
		case 'userinfo':
			res.status(200).send('Syntax: userinfo <username>\nPrints info about a user.');
			return;
		case 'updatecontributors':
			res.status(200).send(
				'Syntax: updatecontributors\nManually update to the most recent contributors list from the Github API. Should be used for testing',
			);
			return;
		case 'help':
			res.status(200).send(
				'Syntax: help [command]\nPrints the list of commands or information about a command.',
			);
			return;
		default:
			res.status(422).send('Unknown command.');
			return;
	}
}

function logCommand(command: string, req: Request): void {
	if (req.memberInfo?.signedIn) {
		logEventsAndPrint(
			`Command executed by admin "${req.memberInfo.username}" of id "${req.memberInfo.user_id}":   ` +
				command,
			'adminCommands.txt',
		);
	} else throw new Error('Admin SHOULD have been logged in by this point. DANGEROUS');
}

function sendAndLogResponse(res: Response, code: number, message: any): void {
	res.status(code).send(message);
	// Also log the sent response
	logEventsAndPrint('Result:   ' + message + '\n', 'adminCommands.txt');
}

export { processCommand };
