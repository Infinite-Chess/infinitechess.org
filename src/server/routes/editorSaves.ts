// src/server/routes/editorSaves.ts

/**
 * Router for the editor-saves resource: a member's saved board-editor positions.
 * Mounted at /api/editor-saves. The whole resource requires authentication.
 */

import express from 'express';

import rateLimiters from '../middleware/rateLimiters.js';
import EditorSavesAPI from '../api/EditorSavesAPI.js';
import { resolveAuth } from '../middleware/resolveAuth.js';

const router = express.Router();

// Every editor-saves route is private, auth is required.
router.use(resolveAuth);

router.get('/', EditorSavesAPI.getSavedPositions);
router.post('/', rateLimiters.editorSave, EditorSavesAPI.savePosition);
router.get('/:position_name', rateLimiters.editorLoad, EditorSavesAPI.getPosition);
router.delete('/:position_name', EditorSavesAPI.deletePosition);

export default router;
