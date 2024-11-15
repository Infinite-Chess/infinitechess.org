
/**
 * This is the router that handles the delete account fetch request on
 * your profile page.
 */

import express from 'express';
import { removeAccount } from '../database/controllers/removeAccountController.js';
const router = express.Router();

router.delete('/member/:member/delete', removeAccount);

export { router };
