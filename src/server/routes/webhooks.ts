// src/server/routes/webhooks.ts

/**
 * Router for inbound third-party webhooks. Mounted at /webhooks.
 * Public — these are called by external services, not our own clients.
 */

import express from 'express';

import { handleSesWebhook } from '../controllers/awsWebhook.js';

const router = express.Router();

// AWS SNS sends text/plain instead of application/json, but it's still parsable as JSON.
const awsParser = express.json({ limit: '256kb', type: ['text/plain', 'application/json'] });

// AWS Simple Email Service (SES) bounce/complaint/delivery notifications.
router.post('/ses', awsParser, handleSesWebhook);

export default router;
