// src/server/routes/editorSaves.ts

/**
 * Router for the editor-saves resource: a member's saved board-editor positions.
 * Mounted at /api/editor-saves. The whole resource requires authentication.
 */

import express from 'express';

import EditorSavesAPI from '../api/EditorSavesAPI.js';
import { resolveAuth } from '../middleware/resolveAuth.js';
import { editorSaveLimiter, editorLoadLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

// Every editor-saves route is private, auth is required.
router.use(resolveAuth);

router.get('/', EditorSavesAPI.getSavedPositions);
router.post('/', editorSaveLimiter, EditorSavesAPI.savePosition);
router.get('/:position_name', editorLoadLimiter, EditorSavesAPI.getPosition);
router.delete('/:position_name', EditorSavesAPI.deletePosition);

export default router;
