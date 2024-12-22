
/*
 * This module, in the future, where be where we connect to GitHub's API
 * to dynamically refresh a list of github contributors on the webiste,
 * probably below our patron donors.
 */

import { request } from 'node:https';
import process from 'node:process';
import dotenv from 'dotenv';
import { logEvents } from '../middleware/logEvents.js';
import { readFile, writeFile } from '../utility/lockFile.js';
import { join } from 'node:path';
dotenv.config()


/** A list of contributors on the infinitechess.org [repository](https://github.com/Infinite-Chess/infinitechess.org).
 * This should be periodically refreshed. 
 * collaborator {
 * 		name: "Infinite-Chess",
 * 		iconUrl: "https://avatars.githubusercontent.com/u/174292850?v=4",
 * 		linkUrl: "https://github.com/Infinite-Chess"
 * }*/
let contributors = [];

/** The interval, in milliseconds, to use GitHub's API to refresh the contributor list. */
const intervalToRefreshContributorsMillis = 1000 * 60 * 60; // 1 hour

/** The id of the interval to update contributors */
let intervalId;

/**
 * Uses GitHub's API to fetch all contributors on the infinitechess.org [repository](https://github.com/Infinite-Chess/infinitechess.org),
 * and updates our list!
 * 
 * WRITTEN
 */
function refreshGitHubContributorsList() {
	if (process.env.GITHUB_API_KEY.length == 0) {
		console.log("No Github API key detected. Not updating until restarted")
		clearInterval(intervalId);
		return
	}

	const repo = process.env.GITHUB_REPO || "Infinite-Chess/infinitechess.org"

	const options = {
		"method": "GET",
		"hostname": "api.github.com",
		"port": null,
		"path": "/repos/" + repo + "/collaborators",
		"headers": {
			"Accept": "application/vnd.github+json",
			"Authorization": "Bearer " + process.env.GITHUB_API_KEY,
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "infinitechess.org",
			"Content-Length": "0"
		}
	};

	const req = request(options, function (res) {
		const chunks = [];

		res.on("data", function (chunk) {
			chunks.push(chunk);
		});

		res.on("end", function () {
			const body = Buffer.concat(chunks);

			if (res.statusCode != 200) {
				return
			}

			const response = body.toString()
			try {
				const json = JSON.parse(response)

				let newContributors = []
				for (const contributor of json) {
					newContributors.push(
						{
							"name": contributor.login,
							"iconUrl": contributor.avatar_url,
							"linkUrl": contributor.html_url
						}
					)
				}
				if (newContributors.length > 0) {
					contributors = newContributors
					writeFile(join(import.meta.dirname, '..', '..', '..', 'database', 'contributors.json'), JSON.stringify(contributors))
					
					console.log("Contributors updated!", contributors)
				}
			} catch {
				logEvents("Error parsing contributors JSON," + response, 'errLog.txt', { print: true })
			}
		});
	});

	req.end();
}

/**
 * Returns a list of contributors on the infinitechess.org [repository](https://github.com/Infinite-Chess/infinitechess.org),
 * updated every {@link intervalToRefreshContributorsMillis}.
 * @returns {string[]}
 */
function getContributors() { return contributors; }

// Load most recent contributors from file
contributors = await readFile(join(import.meta.dirname, '..', '..', '..', 'database', 'contributors.json'))

// Update contributors on a interval
setInterval(refreshGitHubContributorsList, intervalToRefreshContributorsMillis)

export {
	refreshGitHubContributorsList,
	getContributors
};