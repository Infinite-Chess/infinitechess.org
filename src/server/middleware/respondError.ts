// src/server/middleware/respondError.ts

/**
 * The content negotiation every error responder shares: whether this request is answered
 * with the SSR error page, a JSON body, or plain text.
 */

import type { Request, Response } from 'express';

/**
 * Answers an error on the status the caller has already set: a browser navigation gets
 * `renderHtml()`, an API client `{ message }` as JSON, anything else the message as plain text.
 * @param message - Localized error text, for the JSON and plain-text replies.
 * @param renderHtml - Renders the SSR error page. Omit to never render one.
 */
function send(req: Request, res: Response, message: string, renderHtml?: () => void): void {
	if (renderHtml && isBrowserNavigation(req)) renderHtml();
	else if (req.accepts('json')) res.json({ message });
	else res.type('txt').send(message);
}

/** Whether the request is a top-level browser navigation wanting HTML, rather than a fetch or a bot. */
function isBrowserNavigation(req: Request): boolean {
	return req.accepts('html') !== false && req.get('Sec-Fetch-Mode') === 'navigate';
}

// Exports ------------------------------------------------------------------------------------

export default { send };
