// src/server/api/GitHub.ts

/*
 * This module, in the future, where be where we connect to GitHub's API
 * to dynamically refresh a list of github contributors on the webiste,
 * probably below our patron donors.
 */

import { request, RequestOptions } from 'node:https';
import AbortController from 'abort-controller';
import process from 'node:process';
import { writeFile } from 'node:fs/promises';
import path from 'path';
import fs from 'fs';
import * as z from 'zod';
import { fileURLToPath } from 'node:url';

import { logEventsAndPrint } from '../middleware/logEvents.js';
import { logZodError } from '../utility/zodlogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** A GitHub contributor on the infinitechess.org repository. */
interface Contributor {
	name: string;
	iconUrl: string;
	linkUrl: string;
	contributionCount: number;
}

// Variables ---------------------------------------------------------------------------

const GitHubContributorSchema = z.array(
	z.object({
		login: z.string(),
		avatar_url: z.string(),
		html_url: z.string(),
		contributions: z.number(),
	}),
);

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
	const signal: AbortSignal = controller.signal as AbortSignal;

	const options: RequestOptions = {
		method: 'GET',
		hostname: 'api.github.com',
		// "port": null,
		path: `/repos/${GITHUB_REPO}/contributors`,
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${GITHUB_API_KEY}`,
			'X-GitHub-Api-Version': '2022-11-28',
			'User-Agent': process.env['APP_BASE_URL'],
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
			let unvalidatedJson: any;
			try {
				unvalidatedJson = JSON.parse(response);
			} catch (error: unknown) {
				const errMsg = error instanceof Error ? error.message : String(error);
				logEventsAndPrint('Error parsing contributors JSON: ' + errMsg, 'errLog.txt');
				return;
			}

			const zod_result = GitHubContributorSchema.safeParse(unvalidatedJson);
			if (!zod_result.success) {
				logZodError(
					unvalidatedJson,
					zod_result.error,
					'Invalid GitHub API response for contributors.',
				);
				return;
			}

			const currentContributors: Contributor[] = zod_result.data.map((c) => ({
				name: c.login,
				iconUrl: c.avatar_url,
				linkUrl: c.html_url,
				contributionCount: c.contributions,
			}));

			contributors = currentContributors;
			await writeFile(PATH_TO_CONTRIBUTORS_FILE, JSON.stringify(contributors, null, 2));
			console.log('Contributors updated!');
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
