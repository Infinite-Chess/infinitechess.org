// src/tests/integrationUtils.ts

import { testRequest } from './testRequest';
import { generateAccount } from '../server/controllers/createAccountController';

// Variables -------------------------------------------------------------------

/** Counter to ensure unique usernames for each test user */
let userCounter = 0;

// Functions -------------------------------------------------------------------

/** Creates a new test user, logs them in, and returns their username and session cookie. */
async function createAndLoginUser(): Promise<{
	user_id: number;
	username: string;
	cookie: string;
}> {
	userCounter++;
	const username = `ChessMaster-${userCounter}`;
	const user_id = await generateAccount({
		username,
		email: `${username}@example.com`,
		password: 'Password123!',
		autoVerify: true,
	});

	const response = await testRequest()
		.post('/auth')
		.send({ username, password: 'Password123!' });

	// Extract the session cookies
	const cookies = response.headers['set-cookie'] as unknown as string[]; // set-cookie is actually an array
	const jwt = cookies.find((c) => c.startsWith('jwt='));
	const memberInfo = cookies.find((c) => c.startsWith('memberInfo='));

	if (!jwt || !memberInfo) throw new Error('Missing login cookies');

	// Return both combined
	return {
		user_id,
		username,
		cookie: [jwt, memberInfo].filter(Boolean).join(';'),
	};
}

// Exports -------------------------------------------------------------------

export default {
	createAndLoginUser,
};
