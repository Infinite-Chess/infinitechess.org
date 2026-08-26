// src/server/api/adminPanel.ts

/**
 * This script handles all incoming commands send from the admin console page
 * /admin
 */

import type { Request, Response } from 'express';

import validators from '../../shared/util/validators.js';

import roles from '../controllers/roles.js';
import logEvents from '../utility/logEvents.js';
import contributors from './contributors.js';
import memberManager from '../database/memberManager.js';
import blacklistManager from '../database/blacklistManager.js';
import refreshTokenManager from '../database/refreshTokenManager.js';
import deleteAccountController from '../controllers/deleteAccountController.js';

// Constants -------------------------------------------------------------------

const VALID_COMMANDS = [
	'ban',
	'unban',
	'delete',
	'username',
	'logout',
	'userinfo',
	'updatecontributors',
	'help',
] as const;

// Functions -------------------------------------------------------------------

/**
 * `POST /api/admin/command` — parses and runs an admin console command from the request body.
 * Requires the caller to be signed in with the admin role; rejects unknown commands.
 */
function processCommand(req: Request, res: Response): void {
	const command = verifyBodyHasCommand(req, res);
	if (command === undefined) return; // Response already sent

	const commandAndArgs = parseArgumentsFromCommand(command);

	if (!req.memberInfo || !req.memberInfo.signedIn) {
		res.status(401).send('Cannot send commands while logged out.');
		return;
	}
	if (!(req.memberInfo.roles?.includes('admin') ?? false)) {
		res.status(403).send('Cannot send commands without the admin role');
		return;
	}

	// TODO: prevent affecting accounts with equal or higher roles across all commands, not just delete.

	try {
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
	} catch {
		// A DB operation inside a command threw (already logged)
		sendAndLogResponse(res, 500, 'A server error occurred while processing the command.');
	}
}

/**
 * Tests if the request body has a valid non-empty `command` string.
 * If not, this auto-sends a response to the client with an error.
 * @returns The command string, or undefined if the body is invalid.
 */
function verifyBodyHasCommand(req: Request, res: Response): string | undefined {
	const { command } = req.body;

	if (!command || typeof command !== 'string') {
		// Only reachable by hand-crafted/malformed requests.
		res.sendStatus(400);
		return undefined;
	}

	return command;
}

/** Splits a raw admin command into its command word and arguments, honoring double-quoted args. */
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
	const record = memberManager.getDataByCriteria(
		['user_id', 'username', 'roles'],
		'username',
		usernameArgument,
	);
	if (record === undefined)
		return sendAndLogResponse(res, 404, 'User ' + usernameArgument + ' does not exist.');

	// They were found...
	const adminsRoles = req.memberInfo?.signedIn ? req.memberInfo.roles : null;
	const rolesOfAffectedUser = roles.parse(record.roles);
	// Don't delete them if they are equal or higher than your status
	if (!roles.areHigherInPriority(adminsRoles, rolesOfAffectedUser))
		return sendAndLogResponse(res, 403, 'Forbidden to delete ' + record.username + '.');

	if (!memberManager.isValidDeleteReason(reason))
		throw Error(`Delete reason (${reason}) is invalid.`);
	deleteAccountController.deleteAccount(record.user_id, reason);

	sendAndLogResponse(res, 200, 'Successfully deleted user ' + record.username + '.');
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
	const email = commandAndArgs[1]!;

	// Validate email format
	const validationResult = validators.validateEmail(email);
	if (validationResult !== validators.EmailValidationResult.Ok) {
		sendAndLogResponse(res, 422, 'Invalid email format.');
		return;
	}

	blacklistManager.add(email, 'banned');
	sendAndLogResponse(res, 200, `Successfully banned ${email}.`);
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
	const email = commandAndArgs[1]!;

	// Validate email format
	const validationResult = validators.validateEmail(email);
	if (validationResult !== validators.EmailValidationResult.Ok) {
		sendAndLogResponse(res, 422, 'Invalid email format.');
		return;
	}

	blacklistManager.remove(email);
	sendAndLogResponse(res, 200, `Successfully unbanned ${email}.`);
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
		const record = memberManager.getDataByCriteria(['username'], 'user_id', parsedId);
		if (record === undefined)
			sendAndLogResponse(res, 404, 'User with id ' + parsedId + ' does not exist.');
		else sendAndLogResponse(res, 200, record.username);
	} else if (commandAndArgs[1] === undefined) {
		res.status(422).send('Expected get as a subcommand.');
	} else {
		res.status(422).send('Invalid subcommand, expected get, got ' + commandAndArgs[1] + '.');
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
	const record = memberManager.getDataByCriteria(
		['user_id', 'username'],
		'username',
		usernameArgument,
	);
	if (record === undefined) {
		sendAndLogResponse(res, 404, 'User ' + usernameArgument + ' does not exist.');
		return;
	}

	// Effectively terminates all login sessions of the user
	refreshTokenManager.removeAllForUser(record.user_id);
	sendAndLogResponse(res, 200, 'User ' + record.username + ' successfully logged out.'); // Use their case-sensitive username
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
	const record = memberManager.getDataByCriteria(
		[
			'user_id',
			'username',
			'roles',
			'joined',
			'last_seen',
			'preferences',
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
	contributors.refresh();
	sendAndLogResponse(res, 200, 'Contributors should now be updated!');
}

function helpCommand(commandAndArgs: string[], res: Response): void {
	if (commandAndArgs.length === 1) {
		res.status(200).send(
			'Commands: ' +
				VALID_COMMANDS.join(', ') +
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
				'Syntax: username get <userid>\nGets the username of the account with the given userid.',
			);
			return;
		case 'logout':
			res.status(200).send(
				'Syntax: logout <username>\nLogs out all sessions of the account with the given username.',
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
		logEvents.addAndPrint(
			`Command executed by admin "${req.memberInfo.username}" of id "${req.memberInfo.user_id}":   ` +
				command,
			'adminCommands',
		);
	} else throw new Error('Admin SHOULD have been logged in by this point. DANGEROUS');
}

function sendAndLogResponse(res: Response, code: number, message: string): void {
	res.status(code).send(message);
	// Also log the sent response
	logEvents.addAndPrint('Result:   ' + message + '\n', 'adminCommands');
}

// Exports ---------------------------------------------------------------------

export default { processCommand };
