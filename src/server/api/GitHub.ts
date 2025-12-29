/*
 * This module, in the future, where be where we connect to GitHub's API
 * to dynamically refresh a list of github contributors on the webiste,
 * probably below our patron donors.
 */

import { request, RequestOptions } from 'node:https';
import AbortController from 'abort-controller';
import process from 'node:process';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { writeFile } from 'node:fs/promises';
import path from 'path';
import fs from 'fs';

import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Contributor {
	name: string;
	iconUrl: string;
	linkUrl: string;
	contributionCount: number;
}

// Variables ---------------------------------------------------------------------------

const PATH_TO_CONTRIBUTORS_FILE = path.join(__dirname, '../../../database/contributors.json');

/** A list of contributors on the infinitechess.org [repository](https://github.com/Infinite-Chess/infinitechess.org).
 * This should be periodically refreshed.
 * 
 * example contributor:
 * ```js
 * {
	name: 'Naviary2',
    iconUrl: 'https://avatars.githubusercontent.com/u/163621561?v=4',
    linkUrl: 'https://github.com/Naviary2',
    contributionCount: 1502
  }
  ```
 */
let contributors: Contributor[] = (() => {
	if (!fs.existsSync(PATH_TO_CONTRIBUTORS_FILE)) return [];
	const file = fs.readFileSync(PATH_TO_CONTRIBUTORS_FILE).toString();
	return JSON.parse(file);
})();
// console.log(contributors);

/** The interval, in milliseconds, to use GitHub's API to refresh the contributor list. */
const intervalToRefreshContributorsMillis = 1000 * 60 * 60 * 3; // 3 hours
// const intervalToRefreshContributorsMillis = 1000 * 5; // 5s for dev testing

/** The id of the interval to update contributors. Can be used to cancel it if the API token isn't specified. */
const intervalId = setInterval(refreshGitHubContributorsList, intervalToRefreshContributorsMillis);
// refreshGitHubContributorsList(); // Initial refreshal for dev testing

if (process.env.GITHUB_API_KEY === undefined || process.env.GITHUB_REPO === undefined)
	throw new Error(
		'.env file is missing GITHUB_API_KEY or GITHUB_REPO, please regenerate the file or add the lines manually.',
	);

// Functions ---------------------------------------------------------------------------

/**
 * Uses GitHub's API to fetch all contributors on the infinitechess.org [repository](https://github.com/Infinite-Chess/infinitechess.org),
 * and updates our list!
 */
function refreshGitHubContributorsList(): void {
	const { GITHUB_API_KEY, GITHUB_REPO } = process.env;

	if (
		GITHUB_API_KEY === undefined ||
		GITHUB_REPO === undefined ||
		GITHUB_API_KEY.length === 0 ||
		GITHUB_REPO.length === 0
	) {
		logEventsAndPrint(
			'Either Github API key not detected, or repository not specified. Stopping updating contributor list.',
			'errLog.txt',
		);
		clearInterval(intervalId);
		return;
	}

	// Create an AbortController for the request
	const controller = new AbortController();
	const signal = controller.signal as AbortSignal;

	const options: RequestOptions = {
		method: 'GET',
		hostname: 'api.github.com',
		// "port": null,
		path: `/repos/${GITHUB_REPO}/contributors`,
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${GITHUB_API_KEY}`,
			'X-GitHub-Api-Version': '2022-11-28',
			'User-Agent': process.env.APP_BASE_URL,
			// "Content-Length": "0"
		},
		signal, // Pass the signal to the request options
	};

	const req = request(options, function (res) {
		// The type of this is Uint8Array because Buffer.concat() expects it.
		const chunks: Uint8Array[] = [];

		res.on('data', (chunk) => chunks.push(chunk));
		res.on('end', async () => {
			const body = Buffer.concat(chunks);
			if (res.statusCode !== 200)
				return logEventsAndPrint(
					`Response from GitHub when using API to get contributor list: ${body.toString()}`,
					'errLog.txt',
				);

			const response = body.toString();
			try {
				const json = JSON.parse(response);

				const currentContributors = json.map((contributor) => ({
					name: contributor.login,
					iconUrl: contributor.avatar_url,
					linkUrl: contributor.html_url,
					contributionCount: contributor.contributions,
				}));

				if (currentContributors.length > 0) {
					contributors = currentContributors;
					await writeFile(
						PATH_TO_CONTRIBUTORS_FILE,
						JSON.stringify(contributors, null, 2),
					);
					console.log('Contributors updated!');
				}
			} catch {
				logEventsAndPrint('Error parsing contributors JSON: ' + response, 'errLog.txt');
			}
		});
	});

	// Handle request errors
	req.on('error', (err) => {
		if (err.name === 'AbortError') {
			logEventsAndPrint(
				'GitHub contributor request was aborted due to timeout.',
				'errLog.txt',
			);
		} else {
			logEventsAndPrint(
				`Request error while fetching GitHub contributors: ${err.message}`,
				'errLog.txt',
			);
		}
	});

	// Add a timeout using AbortController if request takes too long
	const abortTimeout = setTimeout(() => {
		controller.abort();
		logEventsAndPrint('GitHub API request timed out.', 'errLog.txt');
	}, 10000);

	req.on('response', () => {
		clearTimeout(abortTimeout); // Clear timeout once the request gets a response
	});

	req.end();
}

/**
 * Returns a list of contributors on the infinitechess.org [repository](https://github.com/Infinite-Chess/infinitechess.org),
 * updated every {@link intervalToRefreshContributorsMillis}.
 */
function getContributors(): Contributor[] {
	return contributors;
}

export { refreshGitHubContributorsList, getContributors };
