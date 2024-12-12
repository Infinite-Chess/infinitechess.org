import type { CustomRequest } from "../../types.js";
import type { Response } from "express";
// @ts-ignore
import { getMemberDataByCriteria } from "../database/memberManager.js";
// @ts-ignore
import { logEvents } from "../middleware/logEvents.js";
// @ts-ignore
import { deleteAccount } from "../controllers/deleteAccountController.js";
// @ts-ignore
import { deleteAllSessionsOfUser } from "../controllers/authenticationTokens/sessionManager.js";
// @ts-ignore
import { areRolesHigherInPriority } from "../controllers/roles.js";

const validCommands = [
	"ban",
	"delete",
	"username",
	"logout",
	"verify",
	"post",
	"invites",
	"announce",
	"userinfo",
	"help"
];

function processCommand(req: CustomRequest, res: Response): void {
	const command = req.params["command"]!;

	const commandAndArgs = parseArgumentsFromCommand(command);

	if (!req.memberInfo.signedIn) {
		res.status(401).send("Cannot send commands while logged out.");
		return;
	}
	if (!(req.memberInfo.roles?.includes("admin") ?? false)) {
		res.status(403).send("Cannot send commands without the admin role");
		return;
	}
	// TODO prevent affecting accounts with equal or higher roles
	switch (commandAndArgs[0]) {
		case "ban":
			return;
		case "delete":
			deleteCommand(command, commandAndArgs, req, res);
			return;
		case "username":
			usernameCommand(command, commandAndArgs, res);
			return;
		case "logout":
			logoutUser(command, commandAndArgs, res);
			return;
		case "verify":
			return;
		case "post":
			return;
		case "invites":
			return;
		case "announce":
			return;
		case "userinfo":
			getUserInfo(command, commandAndArgs, res);
			return;
		case "help":
			helpCommand(commandAndArgs, res);
			return;
		default:
			res.status(422).send("Unknown command.");
			return;
	}
}

function parseArgumentsFromCommand(command: string): string[] {
	// Parse command
	const commandAndArgs: string[] = [];
	let inQuote: boolean = false;
	let temp: string = "";
	for (let i = 0; i < command.length; i++) {
		if (command[i] === '"') {
			if (i === 0 || command[i - 1] !== '\\') {
				inQuote = !inQuote;
			}
			else {
				temp += '"';
			}
		}
		else if (command[i] === ' ' && !inQuote) {
			commandAndArgs.push(temp);
			temp = "";
		}
		else if (inQuote || (command[i] !== '"' && command[i] !== ' ')) {
			temp += command[i];
		}
	}
	commandAndArgs.push(temp);

	return commandAndArgs;
}

function deleteCommand(command: string, commandAndArgs: string[], req: CustomRequest, res: Response) {
	if (commandAndArgs.length < 3) {
		res.status(422).send("Invalid number of arguments, expected 2, got " + (commandAndArgs.length - 1) + ".");
		return;
	}
	// Valid Syntax
	logCommand(command);
	const reason = commandAndArgs[2];
	const usernameArgument = commandAndArgs[1];
	const { user_id, username, roles } = getMemberDataByCriteria(["user_id","username","roles"], "username", usernameArgument, { skipErrorLogging: true });
	if (user_id === undefined) return sendAndLogResponse(res, 404, "User " + usernameArgument + " does not exist.");
	// They were found...
	const adminsRoles = req.memberInfo.signedIn ? req.memberInfo.roles : null;
	const rolesOfAffectedUser = JSON.parse(roles);
	// Don't delete them if they are equal or higher than your status
	if (!areRolesHigherInPriority(adminsRoles, rolesOfAffectedUser)) return sendAndLogResponse(res, 403, "Forbidden to delete " + username + ".");
	if (!deleteAccount(user_id, reason)) return sendAndLogResponse(res, 500, "Failed to delete " + username + ".");
	sendAndLogResponse(res, 200, "Successfully deleted user " + username + ".");
}

function usernameCommand(command: string, commandAndArgs: string[], res: Response) {
	if (commandAndArgs[1] === "get") {
		if (commandAndArgs.length < 3) {
			res.status(422).send("Invalid number of arguments, expected 2, got " + (commandAndArgs.length - 1) + ".");
			return;
		}
		const parsedId = Number.parseInt(commandAndArgs[2]!);
		if (Number.isNaN(parsedId)) {
			res.status(422).send("User id must be an integer.");
			return;
		}
		// Valid Syntax
		logCommand(command);
		const { username } = getMemberDataByCriteria(["username"], "user_id", parsedId, { skipErrorLogging: true });
		if (username === undefined) sendAndLogResponse(res, 404, "User with id " + parsedId + " does not exist.");
		else sendAndLogResponse(res, 200, username);
	}
	else if (commandAndArgs[1] === "set") {
		if (commandAndArgs.length < 4) {
			res.status(422).send("Invalid number of arguments, expected 3, got " + (commandAndArgs.length - 1) + ".");
			return;
		}
		// TODO add username changing logic
		res.status(503).send("Changing usernames is not yet supported.");
	}
	else if (commandAndArgs[1] === undefined) {
		res.status(422).send("Expected either get or set as a subcommand.");
	}
	else {
		res.status(422).send("Invalid subcommand, expected either get or set, got " + commandAndArgs[1] + ".");
	}
}

function logoutUser(command: string, commandAndArgs: string[], res: Response) {
	if (commandAndArgs.length < 2) {
		res.status(422).send("Invalid number of arguments, expected 1, got " + (commandAndArgs.length - 1) + ".");
		return;
	}
	// Valid Syntax
	logCommand(command);
	const username = commandAndArgs[1];
	const { user_id } = getMemberDataByCriteria(["user_id"], "username", username, { skipErrorLogging: true });
	if (user_id !== undefined) {
		deleteAllSessionsOfUser(user_id);
		sendAndLogResponse(res, 200, "User " + username + " successfully logged out.");
	}
	else {
		sendAndLogResponse(res, 404, "User " + username + " does not exist.");
	}
}

function getUserInfo(command: string, commandAndArgs: string[], res: Response) {
	if (commandAndArgs.length < 2) {
		res.status(422).send("Invalid number of arguments, expected 1, got " + (commandAndArgs.length - 1) + ".");
		return;
	}
	// Valid Syntax
	logCommand(command);
	const username = commandAndArgs[1];
	const memberData = getMemberDataByCriteria(["user_id", "username", "roles", "joined", "last_seen", "preferences", "verification", "username_history"], "username", username, { skipErrorLogging: true });
	if (Object.keys(memberData).length === 0) { // Empty (member not found)
		sendAndLogResponse(res, 404, "User " + username + " does not exist.");
	}
	else {
		sendAndLogResponse(res, 200, memberData);
	}
}

function helpCommand(commandAndArgs: string[], res: Response) {
	if (commandAndArgs.length === 1) {
		res.status(200).send("Commands: " + validCommands.join(", ") + "\nUse help <command> to get more information about a command.");
		return;
	}
	switch (commandAndArgs[1]) {
		case "ban":
			res.status(200).send("Syntax: ban <username> [days]\nBans a user for a duration or permanently.");
			return;
		case "unban":
			res.status(200).send("Syntax: unban <email>\nUnbans the given email.");
			return;
		case "delete":
			res.status(200).send("Syntax: delete <username> [reason]\nDeletes the given user's account for an optional reason.");
			return;
		case "username":
			res.status(200).send("Syntax: username get <userid>\n        username set <userid> <newUsername>\nGets or sets the username of the account with the given userid");
			return;
		case "logout":
			res.status(200).send("Syntax: logout <username>\nLogs out all sessions of the account with the given username.");
			return;
		case "verify":
			return;
		case "post":
			return;
		case "invites":
			return;
		case "announce":
			return;
		case "userinfo":
			res.status(200).send("Syntax: userinfo <username>\nPrints info about a user.");
			return;
		case "help":
			res.status(200).send("Syntax: help [command]\nPrints the list of commands or information about a command.");
			return;
		default:
			res.status(422).send("Unknown command.");
			return;
	}
}

function logCommand(command: string) {
	logEvents("Command executed: " + command, "adminCommands.txt", { print: true });
}

function sendAndLogResponse(res: Response, code: number, message: any) {
	res.status(code).send(message);
	// Also log the sent response
	logEvents("Result: " + message + "\n", "adminCommands.txt", { print: true });
}

export {
	processCommand
};