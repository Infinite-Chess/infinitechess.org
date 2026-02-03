// src/tests/integrationUtils.ts

import { testRequest } from './testRequest';
import { generateAccount } from '../server/controllers/createAccountController';

// Functions -------------------------------------------------------------------

/** Creates a new test user, logs them in, and returns their username and session cookie. */
async function createAndLoginUser(): Promise<{ username: string; cookie: string }> {
	const username = 'ChessMaster';
	await generateAccount({
		username,
		email: 'master@example.com',
		password: 'Password123!',
		autoVerify: true,
	});

	const response = await testRequest()
		.post('/auth')
		.send({ username: 'ChessMaster', password: 'Password123!' });

	// Extract the session cookies
	const cookies = response.headers['set-cookie'] as unknown as string[]; // set-cookie is actually an array
	const jwt = cookies.find((c) => c.startsWith('jwt='));
	const memberInfo = cookies.find((c) => c.startsWith('memberInfo='));

	if (!jwt || !memberInfo) throw new Error('Missing login cookies');

	// Return both combined
	return {
		username,
		cookie: [jwt, memberInfo].filter(Boolean).join(';'),
	};
}

// Exports -------------------------------------------------------------------

export default {
	createAndLoginUser,
};
