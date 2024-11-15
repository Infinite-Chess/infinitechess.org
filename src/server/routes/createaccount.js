
/**
 * This is the router that handles get fetch requests on the create account page.
 * They need to find out if a specific username or email is already taken.
 */

import express from 'express';
const router = express.Router();

import { checkEmailAssociated, checkUsernameAvailable, createNewMember } from '../database/controllers/createaccountController.js';

router.post('/', createNewMember); // "/createaccount" POST request
router.get('/username/:username', checkUsernameAvailable);
router.get('/email/:email', checkEmailAssociated);

export { router };
