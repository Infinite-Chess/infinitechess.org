import type { CustomRequest } from "../../types.js";
import type { Response } from "express";
// @ts-ignore
import { deleteUser, getMemberDataByCriteria, updateMemberColumns } from "../database/memberManager.js";
// @ts-ignore
import { deleteRefreshTokensOfUser } from "../database/refreshTokenManager.js";
// @ts-ignore
import { logEvents } from "../middleware/logEvents.js";

async function processCommand(req: CustomRequest, res: Response): Promise<void> {
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
			if (commandAndArgs.length < 2) {
				res.status(400).send("Invalid number of arguments, expected 1, got " + (commandAndArgs.length - 1) + ".");
				return;
			}
			deleteUser(getMemberDataByCriteria(["user_id"], "username", commandAndArgs[1])["user_id"], commandAndArgs[2] ?? "");
			res.status(200).send("");
			logEvents("Command executed: " + command + "\n", "adminCommands");
			return;
		case "username":
			if (commandAndArgs[1] === "get") {
				if (commandAndArgs.length < 3) {
					res.status(400).send("Invalid number of arguments, expected 2, got " + (commandAndArgs.length - 1) + ".");
					return;
				}
				res.status(200).send(getMemberDataByCriteria(["username"], "user_id", Number.parseInt(commandAndArgs[2]!))["username"]);
				logEvents("Command executed: " + command + "\nResult: " + getMemberDataByCriteria(["username"], "user_id", Number.parseInt(commandAndArgs[2]!))["username"] + "\n", "adminCommands");
			}
			else if (commandAndArgs[1] === "set") {
				if (commandAndArgs.length < 4) {
					res.status(400).send("Invalid number of arguments, expected 3, got " + (commandAndArgs.length - 1) + ".");
					return;
				}
				// TODO add username changing logic
				res.status(503).send("Changing usernames is not yet supported.");
			}
			else {
				res.status(400).send("Invalid subcommand, expected either get or set, got " + commandAndArgs[1] + ".");
			}
			return;
		case "logout":
			if (commandAndArgs.length < 2) {
				res.status(400).send("Invalid number of arguments, expected 1, got " + (commandAndArgs.length - 1) + ".");
				return;
			}
			deleteRefreshTokensOfUser(getMemberDataByCriteria(["user_id"], "username", commandAndArgs[1])["user_id"]);
			res.status(200).send("");
			logEvents("Command executed: " + command + "\n", "adminCommands");
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
			if (commandAndArgs.length < 2) {
				res.status(400).send("Invalid number of arguments, expected 1, got " + (commandAndArgs.length - 1) + ".");
				return;
			}
			res.status(200).send(getMemberDataByCriteria(["user_id", "username", "roles", "joined", "last_seen", "preferences", "verification", "username_history"],
				"username",
				commandAndArgs[1]));
			logEvents("Command executed: " + command + "\n" + getMemberDataByCriteria(["user_id", "username", "roles", "joined", "last_seen", "preferences", "verification", "username_history"],
				"username",
				commandAndArgs[1]) + "\n", "adminCommands");
			return;
		case "help":
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
					res.status(400).send("Unknown command.");
					return;
			}
		default:
			res.status(400).send("Unknown command.");
			return;
	}
}

export {
	processCommand
};