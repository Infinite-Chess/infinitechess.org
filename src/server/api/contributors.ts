// src/server/api/contributors.ts

/**
 * The data behind `GET /api/contributors`: connects to GitHub's API to periodically refresh
 * the list of contributors shown on the website, backed by a JSON snapshot for instant reads.
 *
 * Not a request handler — the endpoint itself is three lines in `routes/api.ts`. It lives here
 * because that endpoint is its only reason to exist, and it reads `utility/`, which puts every
 * ladder rung below `api/` out of reach.
 *
 * INSTRUCTIONS:
 * In ANY github account (does not need to be a maintainer of the project),
 * create a classic access token with ZERO permissions (that is enough),
 * and paste it in the GITHUB_API_KEY field in the .env file.
 */

import fs from 'fs';
import path from 'path';
import * as z from 'zod';
import process from 'node:process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { request, RequestOptions } from 'node:https';

import jsutil from '../../shared/util/jsutil.js';

import zodlogger from '../utility/zodlogger.js';
import logEvents from '../utility/logEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Types -------------------------------------------------------------------------------------

/** A GitHub contributor on the infinitechess.org repository. */
interface Contributor {
	name: string;
	iconUrl: string;
	linkUrl: string;
	contributionCount: number;
}

// Schemas -----------------------------------------------------------------------------------

/** The raw contributor shape GitHub's API returns. */
const GitHubContributorSchema = z.array(
	z.object({
		login: z.string(),
		avatar_url: z.string(),
		html_url: z.string(),
		contributions: z.number(),
	}),
);

// Constants ---------------------------------------------------------------------------------

const PATH_TO_CONTRIBUTORS_FILE = path.join(__dirname, '../../../database/contributors.json');

/** The interval to use GitHub's API to refresh the contributor list. */
const INTERVAL_TO_REFRESH_CONTRIBUTORS_MS = 1000 * 60 * 60 * 3; // 3 hours

// State -------------------------------------------------------------------------------------

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
let contributors: Contributor[] = loadContributorsSnapshot();

/** The id of the interval to update contributors. Can be used to cancel it if the API token isn't specified. */
const intervalId = setInterval(refresh, INTERVAL_TO_REFRESH_CONTRIBUTORS_MS);

// Functions ---------------------------------------------------------------------------------

/**
 * Reads the contributor snapshot off disk, so the site has a list before the first refresh.
 * No shape check: we wrote it from a validated response, so only a truncated file can fail.
 */
function loadContributorsSnapshot(): Contributor[] {
	if (!fs.existsSync(PATH_TO_CONTRIBUTORS_FILE)) return [];
	try {
		return JSON.parse(fs.readFileSync(PATH_TO_CONTRIBUTORS_FILE).toString());
	} catch (error: unknown) {
		const errMsg = jsutil.getErrorMessage(error);
		logEvents.addAndPrint(`Error parsing the contributors snapshot: ${errMsg}`, 'errLog');
		return [];
	}
}

/**
 * Uses GitHub's API to fetch all contributors on the infinitechess.org [repository](https://github.com/Infinite-Chess/infinitechess.org),
 * and updates our list!
 */
function refresh(): void {
	const { GITHUB_API_KEY, GITHUB_REPO } = process.env;

	if (
		GITHUB_API_KEY === undefined ||
		GITHUB_REPO === undefined ||
		GITHUB_API_KEY.length === 0 ||
		GITHUB_REPO.length === 0
	) {
		logEvents.addAndPrint(
			'Either Github API key not detected, or repository not specified. Stopping updating contributor list.',
			'errLog',
		);
		clearInterval(intervalId);
		return;
	}

	// Create an AbortController for the request
	const controller = new AbortController();

	const options: RequestOptions = {
		method: 'GET',
		hostname: 'api.github.com',
		path: `/repos/${GITHUB_REPO}/contributors`,
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${GITHUB_API_KEY}`,
			'X-GitHub-Api-Version': '2022-11-28',
			'User-Agent': process.env['APP_BASE_URL'],
		},
		signal: controller.signal, // Abort when the request takes too long
	};

	const req = request(options, function (res) {
		// The type of this is Uint8Array because Buffer.concat() expects it.
		const chunks: Uint8Array[] = [];

		res.on('data', (chunk) => chunks.push(chunk));
		res.on('end', async () => {
			const body = Buffer.concat(chunks);
			if (res.statusCode !== 200)
				return logEvents.addAndPrint(
					`Response from GitHub when using API to get contributor list: ${body.toString()}`,
					'errLog',
				);

			const response = body.toString();
			let unvalidatedJson: unknown;
			try {
				unvalidatedJson = JSON.parse(response);
			} catch (error: unknown) {
				const errMsg = jsutil.getErrorMessage(error);
				logEvents.addAndPrint('Error parsing contributors JSON: ' + errMsg, 'errLog');
				return;
			}

			const parseResult = GitHubContributorSchema.safeParse(unvalidatedJson);
			if (!parseResult.success) {
				zodlogger.log(
					unvalidatedJson,
					parseResult.error,
					'Invalid GitHub API response for contributors.',
				);
				return;
			}

			contributors = parseResult.data.map((c) => ({
				name: c.login,
				iconUrl: c.avatar_url,
				linkUrl: c.html_url,
				contributionCount: c.contributions,
			}));

			await writeFile(PATH_TO_CONTRIBUTORS_FILE, JSON.stringify(contributors, null, 2));
		});
	});

	// Handle request errors
	req.on('error', (err) => {
		if (err.name === 'AbortError') {
			logEvents.addAndPrint(
				'GitHub contributor request was aborted due to timeout.',
				'errLog',
			);
		} else {
			logEvents.addAndPrint(
				`Request error while fetching GitHub contributors: ${err.message}`,
				'errLog',
			);
		}
	});

	// Add a timeout using AbortController if request takes too long
	const abortTimeout = setTimeout(() => {
		controller.abort();
		logEvents.addAndPrint('GitHub API request timed out.', 'errLog');
	}, 10000);

	req.on('response', () => {
		clearTimeout(abortTimeout); // Clear timeout once the request gets a response
	});

	req.end();
}

/**
 * Returns a list of contributors on the infinitechess.org [repository](https://github.com/Infinite-Chess/infinitechess.org),
 * updated every {@link INTERVAL_TO_REFRESH_CONTRIBUTORS_MS}.
 */
function get(): Contributor[] {
	return contributors;
}

// Exports ------------------------------------------------------------------------------------

export default { refresh, get };
