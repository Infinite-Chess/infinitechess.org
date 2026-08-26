// src/server/routes/editorSaves.ts

/**
 * Router for the editor-saves resource: a member's saved board-editor positions.
 * Mounted at /api/editor-saves. The whole resource requires authentication.
 */

import express from 'express';

import resolveAuth from '../middleware/resolveAuth.js';
import rateLimiters from '../middleware/rateLimiters.js';
import editorSavesAPI from '../api/editorSavesAPI.js';

const router = express.Router();

// Every editor-saves route is private, auth is required.
router.use(resolveAuth.resolve);

router.get('/', editorSavesAPI.getSavedPositions);
router.post('/', rateLimiters.editorSave, editorSavesAPI.savePosition);
router.get('/:position_name', rateLimiters.editorLoad, editorSavesAPI.getPosition);
router.delete('/:position_name', editorSavesAPI.deletePosition);

export default router;
