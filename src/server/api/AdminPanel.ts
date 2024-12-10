import type { CustomRequest } from "../../types.js";
import type { Response } from "express";
// @ts-ignore
import { deleteUser, getMemberDataByCriteria, updateMemberColumns } from "../database/memberManager.js";
// @ts-ignore
import { deleteRefreshTokensOfUser } from "../database/refreshTokenManager.js";
// @ts-ignore
import { logEvents } from "../middleware/logEvents.js";
// @ts-ignore
import { deleteAccount } from "../controllers/deleteAccountController.js";
// @ts-ignore
import { deleteAllSessionsOfUser } from "../controllers/authenticationTokens/sessionManager.js";

function processCommand(req: CustomRequest, res: Response): void {
	const command = req.params["command"]!;
	const commandAndArgs = command.split(" ");
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
			deleteCommand(command, commandAndArgs, res);
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

function deleteCommand(command: string, commandAndArgs: string[], res: Response) {
	logCommand(command);
	if (commandAndArgs.length < 2) {
		res.status(422).send("Invalid number of arguments, expected 1, got " + (commandAndArgs.length - 1) + ".");
		return;
	}
	try {
		deleteAccount(getMemberDataByCriteria(["user_id"], "username", commandAndArgs[1])["user_id"] ?? (() => { throw new Error(); })(), commandAndArgs[2] ?? "");
	}
	catch {
		res.status(422).send("User " + commandAndArgs[1] + " does not exist.");
		return;
	}
	res.status(200).send("");
}

function usernameCommand(command: string, commandAndArgs: string[], res: Response) {
	if (commandAndArgs[1] === "get") {
		logEvents("Command executed: " + command + "\nResult: " + getMemberDataByCriteria(["username"], "user_id", parsedId)["username"] + "\n", "adminCommands");
		if (commandAndArgs.length < 3) {
			res.status(422).send("Invalid number of arguments, expected 2, got " + (commandAndArgs.length - 1) + ".");
			return;
		}
		const parsedId = Number.parseInt(commandAndArgs[2]!);
		const username = getMemberDataByCriteria(["username"], "user_id", parsedId)["username"];
		res.status(username === undefined ? 422 : 200).send(username ?? "User with id " + parsedId + " does not exist.");
	}
	else if (commandAndArgs[1] === "set") {
		if (commandAndArgs.length < 4) {
			res.status(422).send("Invalid number of arguments, expected 3, got " + (commandAndArgs.length - 1) + ".");
			return;
		}
		// TODO add username changing logic
		res.status(503).send("Changing usernames is not yet supported.");
	}
	else {
		res.status(422).send("Invalid subcommand, expected either get or set, got " + commandAndArgs[1] + ".");
	}
}

function logoutUser(command: string, commandAndArgs: string[], res: Response) {
	logCommand(command);
	if (commandAndArgs.length < 2) {
		res.status(422).send("Invalid number of arguments, expected 1, got " + (commandAndArgs.length - 1) + ".");
		return;
	}
	try {
		deleteAllSessionsOfUser(getMemberDataByCriteria(["user_id"], "username", commandAndArgs[1])["user_id"] ?? (() => { throw new Error(); })());
	}
	catch {
		res.status(422).send("User " + commandAndArgs[1] + " does not exist.");
	}
	res.status(200).send("");
}

function getUserInfo(command: string, commandAndArgs: string[], res: Response) {
	logEvents("Command executed: " + command + "\n" + getMemberDataByCriteria(["user_id", "username", "roles", "joined", "last_seen", "preferences", "verification", "username_history"],
		"username",
		commandAndArgs[1]) + "\n", "adminCommands");
	if (commandAndArgs.length < 2) {
		res.status(422).send("Invalid number of arguments, expected 1, got " + (commandAndArgs.length - 1) + ".");
		return;
	}
	res.status(200).send(getMemberDataByCriteria(["user_id", "username", "roles", "joined", "last_seen", "preferences", "verification", "username_history"],
		"username",
		commandAndArgs[1]));
}

function helpCommand(commandAndArgs: string[], res: Response) {
	if (commandAndArgs.length === 1) {
		res.status(200).send("Commands: ban, delete, username, logout, verify, post, invites, announce, userinfo, help\nUse help <command> to get more information about a command.");
		return;
	}
	switch (commandAndArgs[1]) {
		case "ban":
			res.status(200).send("Syntax: ban email|ip|browser <username> <reason> [days]\nBans a user for a duration for the given reason.");
			return;
		case "unban":
			res.status(200).send("Syntax: unban <username>\nUnbans the given user.");
			return;
		case "delete":
			res.status(200).send("Syntax: delete <username> [reason]\nDeletes the given user's account for an optional reason.");
			return;
		case "username":
			res.status(200).send("Syntax: username get <userid>\n        username set <userid> <newUsername>\nGets or sets the username of the account with the given userid");
			return;
		case "logout":
			res.status(200).send("Syntax: logout <username>\nLogs out the account with the given username.");
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
	logEvents("Command executed: " + command + "\n", "adminCommands");
}

export {
	processCommand
};