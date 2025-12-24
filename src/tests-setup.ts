// src/tests-setup.ts

// Set up environment variables for testing.
// Prevents `test` job failing due to missing secrets.
process.env['ACCESS_TOKEN_SECRET'] = 'test_access_secret';
process.env['REFRESH_TOKEN_SECRET'] = 'test_refresh_secret';
