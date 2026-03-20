// src/server/config/paths.ts

/**
 * This file defines absolute paths to important directories in the project
 */

import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the project-root `logs/` directory. */
const LOGS_DIR = path.join(__dirname, '..', '..', '..', 'logs');

export default { LOGS_DIR };
